use std::sync::{Mutex, OnceLock};

use serde_json::{json, Value};
use tauri::Emitter;
use tauri::Manager;
use tauri_plugin_shell::{
    process::{CommandChild, CommandEvent},
    ShellExt,
};

use crate::{
    models::{AgentDocumentContext, AgentLibrarySearchToolQuery, AgentSettings, AgentStatus},
    services::{agent_tools_service, settings_service},
    utils::error::{AppError, AppResult},
};

static AGENT_STATE: OnceLock<Mutex<AgentRuntimeState>> = OnceLock::new();

#[derive(Debug, Default)]
struct AgentRuntimeState {
    status: AgentStatus,
    child: Option<CommandChild>,
    stdout_buffer: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AgentRpcRecord {
    Response {
        id: Option<String>,
        command: String,
        success: bool,
        error: Option<String>,
    },
    ToolRequest {
        id: String,
        method: String,
        params: Value,
    },
    Event {
        event_type: String,
        payload: Value,
    },
}

pub fn start_session(app: tauri::AppHandle, session_key: String) -> AppResult<()> {
    let mut state = runtime_state()
        .lock()
        .map_err(|_| AppError::Validation("Agent 运行状态已损坏".to_string()))?;

    if state.child.is_none() {
        let sidecar = app
            .shell()
            .sidecar("siwei-pi-agent-sidecar")
            .map_err(|error| AppError::Validation(format!("解析 Pi sidecar 失败: {error}")))?;
        let (mut rx, child) = sidecar
            .spawn()
            .map_err(|error| AppError::Validation(format!("启动 Pi sidecar 失败: {error}")))?;

        let app_for_events = app.clone();
        tauri::async_runtime::spawn(async move {
            while let Some(event) = rx.recv().await {
                handle_sidecar_event(&app_for_events, event);
            }
        });

        state.child = Some(child);
    }

    state.status.session_key = Some(session_key);
    state.status.available = true;
    state.status.running = true;
    state.status.streaming = false;
    state.status.error = None;

    Ok(())
}

pub fn send_message(
    app: tauri::AppHandle,
    message: String,
    document_context: AgentDocumentContext,
) -> AppResult<()> {
    if message.trim().is_empty() {
        return Err(AppError::Validation("助理消息不能为空".to_string()));
    }

    if document_context.document_id.trim().is_empty()
        || document_context.snapshot_key.trim().is_empty()
    {
        return Err(AppError::Validation("文档上下文不完整".to_string()));
    }

    let mut state = runtime_state()
        .lock()
        .map_err(|_| AppError::Validation("Agent 运行状态已损坏".to_string()))?;

    let settings = load_agent_settings(&app)?;
    if !settings.enabled {
        return Err(AppError::Validation("文档助理尚未启用".to_string()));
    }
    let api_key = load_api_key_from_keyring(&settings.provider)?;

    if let Some(child) = state.child.as_mut() {
        let configure_command = build_configure_command(&settings, &api_key);
        let configure_line = format!("{configure_command}\n");
        child
            .write(configure_line.as_bytes())
            .map_err(|error| AppError::Validation(format!("配置 Pi sidecar 失败: {error}")))?;
    }

    state.status.model = Some(format!("{}/{}", settings.provider, settings.model));

    let command = build_prompt_command(&message, &document_context);
    let line = format!("{command}\n");
    if state.child.is_none() {
        state.status.error = Some("Pi sidecar 尚未运行".to_string());
        return Err(AppError::Validation("Pi sidecar 尚未运行".to_string()));
    }
    let child = state.child.as_mut().expect("checked child is_some");

    child
        .write(line.as_bytes())
        .map_err(|error| AppError::Validation(format!("写入 Pi sidecar 失败: {error}")))?;

    state.status.streaming = true;
    Ok(())
}

pub fn abort() -> AppResult<()> {
    let mut state = runtime_state()
        .lock()
        .map_err(|_| AppError::Validation("Agent 运行状态已损坏".to_string()))?;
    if let Some(child) = state.child.as_mut() {
        let _ = child.write(b"{\"type\":\"abort\"}\n");
    }
    state.status.streaming = false;
    Ok(())
}

pub fn get_status() -> AppResult<AgentStatus> {
    runtime_state()
        .lock()
        .map(|state| state.status.clone())
        .map_err(|_| AppError::Validation("Agent 运行状态已损坏".to_string()))
}

pub fn save_api_key(provider: String, api_key: String) -> AppResult<()> {
    if provider.trim().is_empty() {
        return Err(AppError::Validation("Provider 不能为空".to_string()));
    }

    if api_key.trim().is_empty() {
        return Err(AppError::Validation("API key 不能为空".to_string()));
    }

    save_api_key_to_keyring(&provider, &api_key)
}

pub fn delete_api_key(provider: String) -> AppResult<()> {
    if provider.trim().is_empty() {
        return Err(AppError::Validation("Provider 不能为空".to_string()));
    }

    delete_api_key_from_keyring(&provider)
}

pub fn parse_rpc_record(line: &str) -> AppResult<AgentRpcRecord> {
    let value: Value = serde_json::from_str(line)
        .map_err(|error| AppError::JsonParse(format!("Agent RPC 行解析失败: {error}")))?;

    if value.get("jsonrpc").and_then(Value::as_str) == Some("2.0") {
        if let Some(method) = value.get("method").and_then(Value::as_str) {
            let id = value
                .get("id")
                .and_then(Value::as_str)
                .ok_or_else(|| AppError::JsonParse("Agent RPC 请求缺少 id 字段".to_string()))?;
            return Ok(AgentRpcRecord::ToolRequest {
                id: id.to_string(),
                method: method.to_string(),
                params: value.get("params").cloned().unwrap_or_else(|| json!({})),
            });
        }

        let id = value
            .get("id")
            .and_then(Value::as_str)
            .map(ToString::to_string);
        let error = value
            .get("error")
            .and_then(Value::as_object)
            .and_then(|error| error.get("message"))
            .and_then(Value::as_str)
            .map(ToString::to_string);
        return Ok(AgentRpcRecord::Response {
            id,
            command: "jsonrpc".to_string(),
            success: error.is_none(),
            error,
        });
    }

    let record_type = value
        .get("type")
        .and_then(Value::as_str)
        .ok_or_else(|| AppError::JsonParse("Agent RPC 缺少 type 字段".to_string()))?;

    if record_type == "response" {
        let command = value
            .get("command")
            .and_then(Value::as_str)
            .unwrap_or("unknown")
            .to_string();
        let success = value
            .get("success")
            .and_then(Value::as_bool)
            .unwrap_or(false);
        let error = value
            .get("error")
            .and_then(Value::as_str)
            .map(ToString::to_string);

        return Ok(AgentRpcRecord::Response {
            id: value
                .get("id")
                .and_then(Value::as_str)
                .map(ToString::to_string),
            command,
            success,
            error,
        });
    }

    Ok(AgentRpcRecord::Event {
        event_type: record_type.to_string(),
        payload: value,
    })
}

fn drain_jsonl_lines(buffer: &mut String, chunk: &[u8]) -> Vec<String> {
    buffer.push_str(&String::from_utf8_lossy(chunk));
    let mut lines = Vec::new();

    while let Some(newline_index) = buffer.find('\n') {
        let mut line = buffer[..newline_index].to_string();
        if line.ends_with('\r') {
            line.pop();
        }
        buffer.replace_range(..=newline_index, "");
        if !line.trim().is_empty() {
            lines.push(line);
        }
    }

    lines
}

pub fn build_prompt_command(message: &str, context: &AgentDocumentContext) -> Value {
    json!({
        "jsonrpc": "2.0",
        "id": format!("prompt-{}", now_millis()),
        "method": "agent.prompt",
        "params": {
            "message": message,
            "documentContext": context,
        },
    })
}

pub fn build_configure_command(settings: &AgentSettings, api_key: &str) -> Value {
    json!({
        "jsonrpc": "2.0",
        "id": format!("configure-{}", now_millis()),
        "method": "agent.configure",
        "params": {
            "provider": settings.provider.clone(),
            "model": settings.model.clone(),
            "baseUrl": settings.base_url.clone(),
            "thinkingLevel": settings.thinking_level,
            "apiKey": api_key,
        },
    })
}

fn load_agent_settings(app: &tauri::AppHandle) -> AppResult<AgentSettings> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|source| AppError::Tauri {
            operation: "获取应用数据目录",
            source,
        })?;
    Ok(settings_service::get_settings(app_data_dir)?.agent)
}

fn runtime_state() -> &'static Mutex<AgentRuntimeState> {
    AGENT_STATE.get_or_init(|| Mutex::new(AgentRuntimeState::default()))
}

#[cfg(not(test))]
fn save_api_key_to_keyring(provider: &str, api_key: &str) -> AppResult<()> {
    let entry = keyring::Entry::new("Siwei.PiAgent", provider)
        .map_err(|error| AppError::Validation(format!("创建系统钥匙串条目失败: {error}")))?;
    entry
        .set_password(api_key)
        .map_err(|error| AppError::Validation(format!("保存 API key 到系统钥匙串失败: {error}")))
}

#[cfg(test)]
fn save_api_key_to_keyring(_provider: &str, _api_key: &str) -> AppResult<()> {
    Ok(())
}

#[cfg(not(test))]
fn load_api_key_from_keyring(provider: &str) -> AppResult<String> {
    let entry = keyring::Entry::new("Siwei.PiAgent", provider)
        .map_err(|error| AppError::Validation(format!("创建系统钥匙串条目失败: {error}")))?;
    entry
        .get_password()
        .map_err(|error| AppError::Validation(format!("读取系统钥匙串 API key 失败: {error}")))
}

#[cfg(test)]
fn load_api_key_from_keyring(_provider: &str) -> AppResult<String> {
    Ok("test-api-key".to_string())
}

#[cfg(not(test))]
fn delete_api_key_from_keyring(provider: &str) -> AppResult<()> {
    let entry = keyring::Entry::new("Siwei.PiAgent", provider)
        .map_err(|error| AppError::Validation(format!("创建系统钥匙串条目失败: {error}")))?;
    entry
        .delete_credential()
        .map_err(|error| AppError::Validation(format!("从系统钥匙串删除 API key 失败: {error}")))
}

#[cfg(test)]
fn delete_api_key_from_keyring(_provider: &str) -> AppResult<()> {
    Ok(())
}

fn handle_sidecar_event(app: &tauri::AppHandle, event: CommandEvent) {
    match event {
        CommandEvent::Stdout(chunk) => {
            let mut events_to_emit = Vec::new();
            let mut errors_to_emit = Vec::new();

            if let Ok(mut state) = runtime_state().lock() {
                let lines = drain_jsonl_lines(&mut state.stdout_buffer, &chunk);
                for line in lines {
                    match parse_rpc_record(line.trim()) {
                        Ok(record) => {
                            match &record {
                                AgentRpcRecord::Event { event_type, .. }
                                    if event_type == "agent_end" =>
                                {
                                    state.status.streaming = false;
                                }
                                AgentRpcRecord::Response { success, error, .. } if !success => {
                                    state.status.streaming = false;
                                    state.status.error = error.clone();
                                }
                                AgentRpcRecord::ToolRequest { .. } => {}
                                _ => {}
                            }
                            match record {
                                AgentRpcRecord::ToolRequest { id, method, params } => {
                                    let response = handle_tool_request(app, id, method, params);
                                    if let Some(child) = state.child.as_mut() {
                                        let response_line = format!("{response}\n");
                                        if let Err(error) = child.write(response_line.as_bytes()) {
                                            state.status.streaming = false;
                                            state.status.error =
                                                Some(format!("写入 Agent 工具响应失败: {error}"));
                                        }
                                    }
                                }
                                _ => events_to_emit.push(line),
                            }
                        }
                        Err(error) => {
                            let message = error.to_string();
                            state.status.streaming = false;
                            state.status.error = Some(message.clone());
                            errors_to_emit.push(message);
                        }
                    }
                }
            }

            for line in events_to_emit {
                let _ = app.emit("agent://event", line);
            }
            for error in errors_to_emit {
                let _ = app.emit("agent://error", error);
            }
        }
        CommandEvent::Stderr(line) => {
            let error = String::from_utf8_lossy(&line).trim().to_string();
            if !error.is_empty() {
                if let Ok(mut state) = runtime_state().lock() {
                    state.status.error = Some(error.clone());
                }
                let _ = app.emit("agent://error", error);
            }
        }
        CommandEvent::Error(error) => {
            if let Ok(mut state) = runtime_state().lock() {
                state.status.running = false;
                state.status.streaming = false;
                state.status.error = Some(error.clone());
            }
            let _ = app.emit("agent://error", error);
        }
        CommandEvent::Terminated(payload) => {
            if let Ok(mut state) = runtime_state().lock() {
                state.status.running = false;
                state.status.streaming = false;
                state.child = None;
                state.status.error = payload
                    .code
                    .filter(|code| *code != 0)
                    .map(|code| format!("Pi sidecar 已退出，退出码: {code}"));
            }
            let _ = app.emit("agent://terminated", payload.code);
        }
        _ => {}
    }
}

fn handle_tool_request(app: &tauri::AppHandle, id: String, method: String, params: Value) -> Value {
    let result = match method.as_str() {
        "mindmap.insertNodes" => {
            emit_mindmap_insert_nodes(app, params);
            Ok(json!({
                "accepted": true,
            }))
        }
        "library.list" => app
            .path()
            .app_data_dir()
            .map_err(|source| AppError::Tauri {
                operation: "获取应用数据目录",
                source,
            })
            .and_then(|dir| {
                let limit = params
                    .get("limit")
                    .and_then(Value::as_u64)
                    .map(|value| value as u32);
                agent_tools_service::list_library_documents(&dir, limit)
            })
            .and_then(|value| {
                serde_json::to_value(value)
                    .map_err(|error| AppError::JsonParse(format!("序列化文档库索引失败: {error}")))
            }),
        "library.search" => app
            .path()
            .app_data_dir()
            .map_err(|source| AppError::Tauri {
                operation: "获取应用数据目录",
                source,
            })
            .and_then(|dir| {
                let query: AgentLibrarySearchToolQuery =
                    serde_json::from_value(params).map_err(|error| {
                        AppError::JsonParse(format!("解析文档库搜索参数失败: {error}"))
                    })?;
                agent_tools_service::search_library_references(&dir, query)
            })
            .and_then(|value| {
                serde_json::to_value(value).map_err(|error| {
                    AppError::JsonParse(format!("序列化文档库搜索结果失败: {error}"))
                })
            }),
        _ => Err(AppError::Validation(format!(
            "不支持的 Agent 工具方法: {method}"
        ))),
    };

    match result {
        Ok(result) => json!({
            "jsonrpc": "2.0",
            "id": id,
            "result": result,
        }),
        Err(error) => json!({
            "jsonrpc": "2.0",
            "id": id,
            "error": {
                "code": -32000,
                "message": error.user_message(),
            },
        }),
    }
}

fn emit_mindmap_insert_nodes(app: &tauri::AppHandle, params: Value) {
    let _ = app.emit(
        "agent://event",
        json!({
            "type": "tool_result",
            "toolName": "mindmap_insert_nodes",
            "params": params,
        })
        .to_string(),
    );
}

fn now_millis() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(1)
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use crate::models::{
        AgentContextScope as AgentDocumentContextScope, AgentDocumentContext,
        AgentDocumentNodeContext,
    };

    use crate::models::settings::{
        AgentContextScope as AgentSettingsContextScope, AgentSettings, AgentThinkingLevel,
    };

    use super::{
        build_configure_command, build_prompt_command, drain_jsonl_lines, parse_rpc_record,
        AgentRpcRecord,
    };

    fn context() -> AgentDocumentContext {
        AgentDocumentContext {
            schema_version: 1,
            context_scope: AgentDocumentContextScope::CurrentDocument,
            document_id: "doc-1".to_string(),
            title: "测试文档".to_string(),
            snapshot_key: "snapshot".to_string(),
            root: AgentDocumentNodeContext {
                node_id: "root".to_string(),
                text: "测试文档".to_string(),
                note: None,
                tags: None,
                checked: None,
                children: Vec::new(),
            },
        }
    }

    #[test]
    fn parses_rpc_response_records() {
        let record = parse_rpc_record(
            r#"{"type":"response","command":"prompt","success":false,"error":"bad"}"#,
        )
        .unwrap();

        assert_eq!(
            record,
            AgentRpcRecord::Response {
                id: None,
                command: "prompt".to_string(),
                success: false,
                error: Some("bad".to_string()),
            }
        );
    }

    #[test]
    fn parses_rpc_event_records() {
        let record = parse_rpc_record(
            r#"{"type":"message_update","assistantMessageEvent":{"type":"text_delta","delta":"hi"}}"#,
        )
        .unwrap();

        assert_eq!(
            record,
            AgentRpcRecord::Event {
                event_type: "message_update".to_string(),
                payload: json!({
                    "type": "message_update",
                    "assistantMessageEvent": {
                        "type": "text_delta",
                        "delta": "hi"
                    }
                }),
            }
        );
    }

    #[test]
    fn rejects_invalid_rpc_json() {
        let error = parse_rpc_record("{broken").unwrap_err().to_string();

        assert!(error.contains("Agent RPC 行解析失败"));
    }

    #[test]
    fn drains_jsonl_stdout_chunks_across_multiple_events() {
        let mut buffer = String::new();

        let first = drain_jsonl_lines(
            &mut buffer,
            br#"{"type":"response","command":"prompt","success":true}
{"type":"message_update""#,
        );
        let second = drain_jsonl_lines(
            &mut buffer,
            br#","assistantMessageEvent":{"type":"text_delta","delta":"hi"}}
"#,
        );

        assert_eq!(
            first,
            vec![r#"{"type":"response","command":"prompt","success":true}"#.to_string()]
        );
        assert_eq!(
            second,
            vec![
                r#"{"type":"message_update","assistantMessageEvent":{"type":"text_delta","delta":"hi"}}"#
                    .to_string()
            ]
        );
        assert!(buffer.is_empty());
    }

    #[test]
    fn builds_prompt_with_document_context() {
        let command = build_prompt_command("总结", &context());

        assert_eq!(command["method"], "agent.prompt");
        assert_eq!(command["params"]["message"], "总结");
        assert_eq!(command["params"]["documentContext"]["documentId"], "doc-1");
    }

    #[test]
    fn builds_configure_command_for_third_party_model() {
        let settings = AgentSettings {
            enabled: true,
            provider: "openai-compatible".to_string(),
            model: "gpt-4.1".to_string(),
            base_url: "https://api.openai.com/v1".to_string(),
            thinking_level: AgentThinkingLevel::Medium,
            context_scope: AgentSettingsContextScope::CurrentDocument,
        };

        let command = build_configure_command(&settings, "sk-test");

        assert_eq!(command["method"], "agent.configure");
        assert_eq!(command["params"]["provider"], "openai-compatible");
        assert_eq!(command["params"]["model"], "gpt-4.1");
        assert_eq!(command["params"]["baseUrl"], "https://api.openai.com/v1");
        assert_eq!(command["params"]["apiKey"], "sk-test");
    }

    #[test]
    fn parses_json_rpc_tool_requests() {
        let record = parse_rpc_record(
            r#"{"jsonrpc":"2.0","id":"tool-1","method":"library.search","params":{"query":"计划"}}"#,
        )
        .unwrap();

        assert_eq!(
            record,
            AgentRpcRecord::ToolRequest {
                id: "tool-1".to_string(),
                method: "library.search".to_string(),
                params: json!({ "query": "计划" }),
            }
        );
    }

    #[test]
    fn parses_mindmap_insert_tool_requests() {
        let record = parse_rpc_record(
            r#"{"jsonrpc":"2.0","id":"tool-2","method":"mindmap.insertNodes","params":{"documentId":"doc-1","parentNodeId":"root","nodes":[{"text":"节点"}]}}"#,
        )
        .unwrap();

        assert_eq!(
            record,
            AgentRpcRecord::ToolRequest {
                id: "tool-2".to_string(),
                method: "mindmap.insertNodes".to_string(),
                params: json!({
                    "documentId": "doc-1",
                    "parentNodeId": "root",
                    "nodes": [{ "text": "节点" }]
                }),
            }
        );
    }
}

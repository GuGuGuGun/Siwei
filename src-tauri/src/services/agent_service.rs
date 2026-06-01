use std::sync::{Mutex, OnceLock};

use serde_json::{json, Value};
use tauri::Emitter;
use tauri::Manager;

use crate::{
    models::{
        AgentDocumentContext, AgentDocumentNodeContext, AgentLibrarySearchToolQuery, AgentSettings,
        AgentStatus,
    },
    services::{
        agent::{runtime, runtime::AgentRuntimeRequest},
        agent_tools_service, settings_service,
    },
    utils::error::{AppError, AppResult},
};

static AGENT_STATE: OnceLock<Mutex<AgentRuntimeState>> = OnceLock::new();

#[derive(Debug, Default)]
struct AgentRuntimeState {
    status: AgentStatus,
    last_abort_requested: bool,
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

pub fn start_session(_app: tauri::AppHandle, session_key: String) -> AppResult<()> {
    let mut state = runtime_state()
        .lock()
        .map_err(|_| AppError::Validation("Agent 运行状态已损坏".to_string()))?;

    state.status.session_key = Some(session_key);
    state.status.available = true;
    state.status.running = true;
    state.status.streaming = false;
    state.status.error = None;
    state.last_abort_requested = false;

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

    let settings = load_agent_settings(&app)?;
    if !settings.enabled {
        return Err(AppError::Validation("文档助理尚未启用".to_string()));
    }
    let api_key = load_api_key_from_keyring(&settings.provider)?;

    {
        let mut state = runtime_state()
            .lock()
            .map_err(|_| AppError::Validation("Agent 运行状态已损坏".to_string()))?;
        if state.status.session_key.is_none() {
            state.status.error = Some("Agent 会话尚未启动".to_string());
            return Err(AppError::Validation("Agent 会话尚未启动".to_string()));
        }

        state.status.model = Some(format!("{}/{}", settings.provider, settings.model));
        state.status.streaming = true;
        state.status.error = None;
        state.last_abort_requested = false;
    }

    // 启动命令只登记状态并派发后台任务，避免阻塞 Tauri command 调用和前端交互。
    tauri::async_runtime::spawn(runtime::run_agent_turn(
        app,
        AgentRuntimeRequest {
            settings,
            api_key,
            message,
            document_context,
        },
    ));

    Ok(())
}

pub fn abort() -> AppResult<()> {
    let mut state = runtime_state()
        .lock()
        .map_err(|_| AppError::Validation("Agent 运行状态已损坏".to_string()))?;
    state.last_abort_requested = true;
    state.status.streaming = false;
    Ok(())
}

pub fn get_status() -> AppResult<AgentStatus> {
    runtime_state()
        .lock()
        .map(|state| state.status.clone())
        .map_err(|_| AppError::Validation("Agent 运行状态已损坏".to_string()))
}

pub fn finish_streaming() -> AppResult<()> {
    let mut state = runtime_state()
        .lock()
        .map_err(|_| AppError::Validation("Agent 运行状态已损坏".to_string()))?;
    state.status.streaming = false;
    Ok(())
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
        // JSON-RPC 里带 method 的记录是工具请求，不带 method 的记录是对前序调用的响应。
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

pub fn handle_tool_request(app: &tauri::AppHandle, id: String, method: String, params: Value) -> Value {
    let result = match method.as_str() {
        "mindmap.insertNodes" | "mindmap.insert_nodes" => {
            // 写操作只发给前端生成待确认计划，真正修改文档仍由前端按 snapshotKey 校验后执行。
            emit_mindmap_tool_result(app, "mindmap_insert_nodes", params);
            Ok(json!({
                "accepted": true,
            }))
        }
        "mindmap.updateNodes" | "mindmap.update_nodes" => {
            emit_mindmap_tool_result(app, "mindmap_update_nodes", params);
            Ok(json!({
                "accepted": true,
            }))
        }
        "mindmap.moveNodes" | "mindmap.move_nodes" => {
            emit_mindmap_tool_result(app, "mindmap_move_nodes", params);
            Ok(json!({
                "accepted": true,
            }))
        }
        "mindmap.deleteNodes" | "mindmap.delete_nodes" => {
            emit_mindmap_tool_result(app, "mindmap_delete_nodes", params);
            Ok(json!({
                "accepted": true,
            }))
        }
        "mindmap.readSubtree" | "mindmap.read_subtree" => read_subtree_from_params(params),
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
            "不支持的 Agent 工具方法: {}",
            if method.trim().is_empty() {
                "<空>"
            } else {
                method.as_str()
            }
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

fn emit_mindmap_tool_result(app: &tauri::AppHandle, tool_name: &str, params: Value) {
    let _ = app.emit(
        "agent://event",
        json!({
            "type": "tool_result",
            "toolName": tool_name,
            "params": params,
        })
        .to_string(),
    );
}

fn read_subtree_from_params(params: Value) -> AppResult<Value> {
    let document_context = params
        .get("documentContext")
        .cloned()
        .ok_or_else(|| AppError::Validation("读取子树缺少当前文档上下文".to_string()))
        .and_then(|value| {
            serde_json::from_value::<AgentDocumentContext>(value).map_err(|error| {
                AppError::JsonParse(format!("解析当前文档上下文失败: {error}"))
            })
        })?;
    let document_id = params
        .get("documentId")
        .and_then(Value::as_str)
        .ok_or_else(|| AppError::Validation("读取子树缺少 documentId".to_string()))?;
    let node_id = params
        .get("nodeId")
        .and_then(Value::as_str)
        .ok_or_else(|| AppError::Validation("读取子树缺少 nodeId".to_string()))?;

    if document_id != document_context.document_id {
        return Err(AppError::Validation(
            "读取子树请求不属于当前文档".to_string(),
        ));
    }

    let max_depth = params
        .get("maxDepth")
        .and_then(Value::as_u64)
        .map(|value| value as usize);
    let subtree = find_agent_node(&document_context.root, node_id)
        .ok_or_else(|| AppError::Validation(format!("节点不存在: {node_id}")))?;
    let clipped = clone_agent_node_with_depth(subtree, max_depth);
    serde_json::to_value(clipped)
        .map_err(|error| AppError::JsonParse(format!("序列化子树上下文失败: {error}")))
}

fn find_agent_node<'a>(
    node: &'a AgentDocumentNodeContext,
    node_id: &str,
) -> Option<&'a AgentDocumentNodeContext> {
    if node.node_id == node_id {
        return Some(node);
    }

    node.children
        .iter()
        .find_map(|child| find_agent_node(child, node_id))
}

fn clone_agent_node_with_depth(
    node: &AgentDocumentNodeContext,
    max_depth: Option<usize>,
) -> AgentDocumentNodeContext {
    let children = match max_depth {
        Some(0) => Vec::new(),
        Some(depth) => node
            .children
            .iter()
            .map(|child| clone_agent_node_with_depth(child, Some(depth - 1)))
            .collect(),
        None => node
            .children
            .iter()
            .map(|child| clone_agent_node_with_depth(child, None))
            .collect(),
    };

    AgentDocumentNodeContext {
        node_id: node.node_id.clone(),
        text: node.text.clone(),
        note: node.note.clone(),
        tags: node.tags.clone(),
        checked: node.checked,
        children,
    }
}

#[cfg(not(test))]
fn save_api_key_to_keyring(provider: &str, api_key: &str) -> AppResult<()> {
    let entry = keyring::Entry::new("Siwei.Agent", provider)
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
    let entry = keyring::Entry::new("Siwei.Agent", provider)
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
    let entry = keyring::Entry::new("Siwei.Agent", provider)
        .map_err(|error| AppError::Validation(format!("创建系统钥匙串条目失败: {error}")))?;
    entry
        .delete_credential()
        .map_err(|error| AppError::Validation(format!("从系统钥匙串删除 API key 失败: {error}")))
}

#[cfg(test)]
fn delete_api_key_from_keyring(_provider: &str) -> AppResult<()> {
    Ok(())
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::{parse_rpc_record, read_subtree_from_params, AgentRpcRecord};

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
            r#"{"jsonrpc":"2.0","id":"tool-2","method":"mindmap.insert_nodes","params":{"documentId":"doc-1","parentNodeId":"root","nodes":[{"text":"节点"}]}}"#,
        )
        .unwrap();

        assert_eq!(
            record,
            AgentRpcRecord::ToolRequest {
                id: "tool-2".to_string(),
                method: "mindmap.insert_nodes".to_string(),
                params: json!({
                    "documentId": "doc-1",
                    "parentNodeId": "root",
                    "nodes": [{ "text": "节点" }]
                }),
            }
        );
    }

    #[test]
    fn reads_subtree_from_current_document_context() {
        let result = read_subtree_from_params(json!({
            "documentId": "doc-1",
            "nodeId": "child",
            "maxDepth": 0,
            "documentContext": {
                "schemaVersion": 1,
                "contextScope": "currentDocument",
                "documentId": "doc-1",
                "title": "测试文档",
                "snapshotKey": "snap",
                "root": {
                    "nodeId": "root",
                    "text": "根节点",
                    "children": [
                        {
                            "nodeId": "child",
                            "text": "子节点",
                            "children": [
                                {
                                    "nodeId": "grandchild",
                                    "text": "孙节点",
                                    "children": []
                                }
                            ]
                        }
                    ]
                }
            }
        }))
        .unwrap();

        assert_eq!(result["nodeId"], "child");
        assert_eq!(result["text"], "子节点");
        assert_eq!(result["children"], json!([]));
    }
}

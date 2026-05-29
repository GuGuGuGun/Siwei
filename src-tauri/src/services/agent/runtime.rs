use futures_util::StreamExt;
use serde_json::{json, Value};
use tauri::Emitter;

use crate::{
    models::{AgentDocumentContext, AgentSettings},
    services::{
        agent::{
            prompt::SIWEI_AGENT_SYSTEM_PROMPT,
            providers::{
                claude::{to_claude_tools, ClaudeStreamParser},
                openai_compatible::{to_openai_tools, OpenAiStreamParser},
            },
            protocol::{AgentStreamEvent, AgentToolCall},
            tools::siwei_tool_definitions,
        },
        agent_service,
    },
    utils::error::{AppError, AppResult},
};

const MAX_AGENT_TOOL_ROUNDS: usize = 6;

#[derive(Debug, Clone)]
pub struct AgentRuntimeRequest {
    pub settings: AgentSettings,
    pub api_key: String,
    pub message: String,
    pub document_context: AgentDocumentContext,
}

pub async fn run_agent_turn(app: tauri::AppHandle, request: AgentRuntimeRequest) {
    let result = match request.settings.provider.as_str() {
        "claude" | "anthropic" => run_claude_turn(&app, request).await,
        "openai-compatible" | "openai" => run_openai_turn(&app, request).await,
        provider => Err(AppError::Validation(format!(
            "不支持的 Agent Provider: {provider}"
        ))),
    };

    if let Err(error) = result {
        let _ = app.emit("agent://error", error.user_message());
    }

    let _ = agent_service::finish_streaming();
    let _ = app.emit("agent://event", json!({ "type": "agent_end" }).to_string());
}

async fn run_openai_turn(app: &tauri::AppHandle, request: AgentRuntimeRequest) -> AppResult<()> {
    let url = join_url(&request.settings.base_url, "chat/completions");
    let client = reqwest::Client::new();
    let tools = to_openai_tools(&siwei_tool_definitions());
    let mut messages = vec![
        json!({ "role": "system", "content": SIWEI_AGENT_SYSTEM_PROMPT }),
        json!({ "role": "user", "content": build_user_prompt(&request.message, &request.document_context)? }),
    ];

    for _ in 0..MAX_AGENT_TOOL_ROUNDS {
        let body = json!({
            "model": request.settings.model,
            "stream": true,
            "tool_choice": "auto",
            "messages": messages,
            "tools": tools,
        });

        let outcome = stream_openai_request(app, &client, &url, &request.api_key, &body).await?;
        if outcome.tool_calls.is_empty() {
            return Ok(());
        }

        messages.push(openai_assistant_tool_call_message(&outcome.tool_calls));
        for call in outcome.tool_calls {
            let result = execute_tool_call(app, &call)?;
            messages.push(openai_tool_result_message(&call, result));
        }
    }

    Err(AppError::Validation(
        "Agent 工具调用轮数过多，已停止以避免无限循环".to_string(),
    ))
}

async fn stream_openai_request(
    app: &tauri::AppHandle,
    client: &reqwest::Client,
    url: &str,
    api_key: &str,
    body: &Value,
) -> AppResult<ProviderTurnOutcome> {
    let response = client
        .post(url)
        .bearer_auth(api_key)
        .json(body)
        .send()
        .await
        .map_err(|error| AppError::Validation(format!("OpenAI-compatible 请求失败: {error}")))?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        return Err(AppError::Validation(format!(
            "OpenAI-compatible 请求失败: HTTP {status} {text}"
        )));
    }

    let mut outcome = ProviderTurnOutcome::default();
    let mut parser = OpenAiStreamParser::default();
    let mut sse = SseDecoder::default();
    let mut stream = response.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|error| {
            AppError::Validation(format!("读取 OpenAI-compatible 流失败: {error}"))
        })?;
        for event in sse.push_chunk(&chunk)? {
            for agent_event in parser.push_sse_data(&event.data).map_err(AppError::Validation)? {
                collect_and_emit_stream_event(app, agent_event, &mut outcome)?;
            }
        }
    }

    Ok(outcome)
}

async fn run_claude_turn(app: &tauri::AppHandle, request: AgentRuntimeRequest) -> AppResult<()> {
    let url = join_url(&request.settings.base_url, "v1/messages");
    let client = reqwest::Client::new();
    let tools = to_claude_tools(&siwei_tool_definitions());
    let mut messages = vec![json!({
        "role": "user",
        "content": build_user_prompt(&request.message, &request.document_context)?
    })];

    for _ in 0..MAX_AGENT_TOOL_ROUNDS {
        let body = json!({
            "model": request.settings.model,
            "max_tokens": 8192,
            "stream": true,
            "system": SIWEI_AGENT_SYSTEM_PROMPT,
            "messages": messages,
            "tools": tools,
        });

        let outcome = stream_claude_request(app, &client, &url, &request.api_key, &body).await?;
        if outcome.tool_calls.is_empty() {
            return Ok(());
        }

        messages.push(claude_assistant_tool_call_message(&outcome.tool_calls));
        messages.push(claude_tool_result_message(app, &outcome.tool_calls)?);
    }

    Err(AppError::Validation(
        "Agent 工具调用轮数过多，已停止以避免无限循环".to_string(),
    ))
}

async fn stream_claude_request(
    app: &tauri::AppHandle,
    client: &reqwest::Client,
    url: &str,
    api_key: &str,
    body: &Value,
) -> AppResult<ProviderTurnOutcome> {
    let response = client
        .post(url)
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
        .json(body)
        .send()
        .await
        .map_err(|error| AppError::Validation(format!("Claude 请求失败: {error}")))?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        return Err(AppError::Validation(format!(
            "Claude 请求失败: HTTP {status} {text}"
        )));
    }

    let mut outcome = ProviderTurnOutcome::default();
    let mut parser = ClaudeStreamParser::default();
    let mut sse = SseDecoder::default();
    let mut stream = response.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk =
            chunk.map_err(|error| AppError::Validation(format!("读取 Claude 流失败: {error}")))?;
        for event in sse.push_chunk(&chunk)? {
            for agent_event in parser
                .push_sse_event(&event.event_name, &event.data)
                .map_err(AppError::Validation)?
            {
                collect_and_emit_stream_event(app, agent_event, &mut outcome)?;
            }
        }
    }

    Ok(outcome)
}

#[derive(Debug, Default)]
struct ProviderTurnOutcome {
    text: String,
    tool_calls: Vec<AgentToolCall>,
}

fn collect_and_emit_stream_event(
    app: &tauri::AppHandle,
    event: AgentStreamEvent,
    outcome: &mut ProviderTurnOutcome,
) -> AppResult<()> {
    match event {
        AgentStreamEvent::TextDelta { text } => {
            outcome.text.push_str(&text);
            let _ = app.emit(
                "agent://event",
                json!({
                    "type": "message_update",
                    "assistantMessageEvent": {
                        "type": "text_delta",
                        "delta": text,
                    }
                })
                .to_string(),
            );
        }
        AgentStreamEvent::ToolCallDone { call } => {
            outcome.tool_calls.push(call);
        }
        AgentStreamEvent::AgentEnd => {}
        AgentStreamEvent::MessageDone { .. }
        | AgentStreamEvent::ToolCallDelta { .. }
        | AgentStreamEvent::ToolResult { .. } => {}
    }

    Ok(())
}

fn execute_tool_call(app: &tauri::AppHandle, call: &AgentToolCall) -> AppResult<Value> {
    let method = match call.name.as_str() {
        "mindmap.insert_nodes" => "mindmap.insert_nodes",
        "library.list" => "library.list",
        "library.search" => "library.search",
        other => other,
    };
    let response = agent_service::handle_tool_request(
        app,
        call.id.clone(),
        method.to_string(),
        call.arguments.clone(),
    );

    if let Some(error) = response
        .get("error")
        .and_then(|error| error.get("message"))
        .and_then(Value::as_str)
    {
        return Err(AppError::Validation(error.to_string()));
    }

    Ok(response
        .get("result")
        .cloned()
        .unwrap_or_else(|| json!({ "accepted": true })))
}

fn openai_assistant_tool_call_message(tool_calls: &[AgentToolCall]) -> Value {
    json!({
        "role": "assistant",
        "content": null,
        "tool_calls": tool_calls
            .iter()
            .map(|call| {
                json!({
                    "id": call.id,
                    "type": "function",
                    "function": {
                        "name": call.name,
                        "arguments": call.arguments.to_string(),
                    }
                })
            })
            .collect::<Vec<_>>(),
    })
}

fn openai_tool_result_message(call: &AgentToolCall, result: Value) -> Value {
    json!({
        "role": "tool",
        "tool_call_id": call.id,
        "content": result.to_string(),
    })
}

fn claude_assistant_tool_call_message(tool_calls: &[AgentToolCall]) -> Value {
    json!({
        "role": "assistant",
        "content": tool_calls
            .iter()
            .map(|call| {
                json!({
                    "type": "tool_use",
                    "id": call.id,
                    "name": call.name,
                    "input": call.arguments,
                })
            })
            .collect::<Vec<_>>(),
    })
}

fn claude_tool_result_message(
    app: &tauri::AppHandle,
    tool_calls: &[AgentToolCall],
) -> AppResult<Value> {
    let mut content = Vec::new();

    for call in tool_calls {
        let result = execute_tool_call(app, call)?;
        content.push(json!({
            "type": "tool_result",
            "tool_use_id": call.id,
            "content": result.to_string(),
        }));
    }

    Ok(json!({
        "role": "user",
        "content": content,
    }))
}

fn build_user_prompt(message: &str, context: &AgentDocumentContext) -> AppResult<String> {
    let context_json = serde_json::to_string(context)
        .map_err(|error| AppError::JsonParse(format!("序列化 Agent 文档上下文失败: {error}")))?;
    Ok([
        message,
        "",
        "当前 Siwei 文档上下文如下。只能对该 JSON 中的 documentId 生成修改或调用工具。",
        "如果需要使用文档库信息，只能先调用 library.list 或 library.search 获取引用上下文。",
        &context_json,
    ]
    .join("\n"))
}

fn join_url(base_url: &str, path: &str) -> String {
    format!(
        "{}/{}",
        base_url.trim_end_matches('/'),
        path.trim_start_matches('/')
    )
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct SseEvent {
    event_name: String,
    data: String,
}

#[derive(Debug, Default)]
struct SseDecoder {
    buffer: String,
    event_name: String,
    data_lines: Vec<String>,
}

impl SseDecoder {
    fn push_chunk(&mut self, chunk: &[u8]) -> AppResult<Vec<SseEvent>> {
        self.buffer.push_str(&String::from_utf8_lossy(chunk));
        let mut events = Vec::new();

        while let Some(newline_index) = self.buffer.find('\n') {
            let mut line = self.buffer[..newline_index].to_string();
            if line.ends_with('\r') {
                line.pop();
            }
            self.buffer.replace_range(..=newline_index, "");

            if line.is_empty() {
                if !self.data_lines.is_empty() {
                    events.push(SseEvent {
                        event_name: if self.event_name.is_empty() {
                            "message".to_string()
                        } else {
                            std::mem::take(&mut self.event_name)
                        },
                        data: self.data_lines.join("\n"),
                    });
                    self.data_lines.clear();
                }
                continue;
            }

            if let Some(value) = line.strip_prefix("event:") {
                self.event_name = value.trim().to_string();
            } else if let Some(value) = line.strip_prefix("data:") {
                self.data_lines.push(value.trim_start().to_string());
            }
        }

        Ok(events)
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use crate::services::agent::protocol::AgentToolCall;

    use super::{
        claude_assistant_tool_call_message, join_url, openai_assistant_tool_call_message,
        openai_tool_result_message, SseDecoder,
    };

    #[test]
    fn joins_provider_url_without_double_slash() {
        assert_eq!(
            join_url("https://api.example.com/v1/", "/chat/completions"),
            "https://api.example.com/v1/chat/completions"
        );
    }

    #[test]
    fn decodes_sse_events_across_chunks() {
        let mut decoder = SseDecoder::default();

        assert!(decoder.push_chunk(b"event: message_delta\ndata: {\"a\"").unwrap().is_empty());
        let events = decoder.push_chunk(br#":1}

"#).unwrap();

        assert_eq!(events.len(), 1);
        assert_eq!(events[0].event_name, "message_delta");
        assert_eq!(events[0].data, r#"{"a":1}"#);
    }

    #[test]
    fn builds_openai_tool_messages_for_follow_up_round() {
        let call = AgentToolCall {
            id: "call_1".to_string(),
            name: "library.search".to_string(),
            arguments: json!({ "query": "计划" }),
        };

        let assistant_message = openai_assistant_tool_call_message(std::slice::from_ref(&call));
        let tool_message = openai_tool_result_message(&call, json!({ "matches": [] }));

        assert_eq!(assistant_message["role"], "assistant");
        assert_eq!(assistant_message["tool_calls"][0]["id"], "call_1");
        assert_eq!(
            assistant_message["tool_calls"][0]["function"]["arguments"],
            r#"{"query":"计划"}"#
        );
        assert_eq!(tool_message["role"], "tool");
        assert_eq!(tool_message["tool_call_id"], "call_1");
        assert_eq!(tool_message["content"], r#"{"matches":[]}"#);
    }

    #[test]
    fn builds_claude_tool_use_message_for_follow_up_round() {
        let call = AgentToolCall {
            id: "toolu_1".to_string(),
            name: "library.search".to_string(),
            arguments: json!({ "query": "计划" }),
        };

        let assistant_message = claude_assistant_tool_call_message(&[call]);

        assert_eq!(assistant_message["role"], "assistant");
        assert_eq!(assistant_message["content"][0]["type"], "tool_use");
        assert_eq!(assistant_message["content"][0]["id"], "toolu_1");
        assert_eq!(
            assistant_message["content"][0]["input"],
            json!({ "query": "计划" })
        );
    }
}

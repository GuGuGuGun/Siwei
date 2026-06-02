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
            sse::SseDecoder,
            tool_messages::{
                claude_assistant_tool_call_message, claude_tool_result_message,
                openai_assistant_tool_call_message, openai_tool_result_message,
            },
            tools::{canonical_tool_name, siwei_tool_definitions},
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

        // OpenAI 工具调用需要把 assistant tool_calls 与每个 tool 结果都写回历史，模型才能继续生成最终答复。
        messages.push(openai_assistant_tool_call_message(&outcome.tool_calls));
        for call in outcome.tool_calls {
            let result = execute_tool_call(app, &call, &request.document_context)?;
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

        // Claude 协议要求 tool_result 作为下一条 user 消息返回，因此与 OpenAI 的历史结构分开构造。
        messages.push(claude_assistant_tool_call_message(&outcome.tool_calls));
        messages.push(claude_tool_result_message(
            &outcome.tool_calls,
            &request.document_context,
            |call, document_context| execute_tool_call(app, call, document_context),
        )?);
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
            // 前端只接收增量文本事件，完整文本留在 outcome 中用于判断本轮是否还需要工具调用。
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

fn execute_tool_call(
    app: &tauri::AppHandle,
    call: &AgentToolCall,
    document_context: &AgentDocumentContext,
) -> AppResult<Value> {
    let canonical_name = canonical_tool_name(&call.name);
    let method = match canonical_name {
        "mindmap.insert_nodes" => "mindmap.insert_nodes",
        "mindmap.update_nodes" => "mindmap.update_nodes",
        "mindmap.move_nodes" => "mindmap.move_nodes",
        "mindmap.delete_nodes" => "mindmap.delete_nodes",
        "mindmap.read_subtree" => "mindmap.read_subtree",
        "library.list" => "library.list",
        "library.search" => "library.search",
        other => other,
    };
    let mut arguments = call.arguments.clone();
    if method == "mindmap.read_subtree" {
        if let Some(object) = arguments.as_object_mut() {
            object.insert(
                "documentContext".to_string(),
                serde_json::to_value(document_context).map_err(|error| {
                    AppError::JsonParse(format!("序列化当前文档上下文失败: {error}"))
                })?,
            );
        }
    }
    // Runtime 只负责桥接工具调用，具体只读文档库和脑图写入校验仍由 agent_service 统一处理。
    let response = agent_service::handle_tool_request(
        app,
        call.id.clone(),
        method.to_string(),
        arguments,
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

#[cfg(test)]
mod tests {
    use super::join_url;

    #[test]
    fn joins_provider_url_without_double_slash() {
        assert_eq!(
            join_url("https://api.example.com/v1/", "/chat/completions"),
            "https://api.example.com/v1/chat/completions"
        );
    }

}

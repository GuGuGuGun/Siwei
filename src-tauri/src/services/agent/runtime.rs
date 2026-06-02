use futures_util::StreamExt;
use serde_json::{json, Value};
use tauri::Emitter;

use crate::{
    models::{AgentDocumentContext, AgentSettings},
    services::{
        agent::{
            prompt::SIWEI_AGENT_SYSTEM_PROMPT,
            protocol::{AgentStreamEvent, AgentToolCall},
            providers::{
                claude::{to_claude_tools, ClaudeStreamParser},
                openai_compatible::{to_openai_tools, OpenAiStreamParser},
            },
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
        let message = error.user_message();
        let _ = agent_service::finish_streaming_with_error(message.clone());
        let _ = app.emit("agent://error", message);
    } else {
        let _ = agent_service::finish_streaming();
    }

    let _ = agent_service::publish_event(&app, json!({ "type": "agent_end" }));
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
            handle_no_tool_call_turn(app, &request, &outcome)?;
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
            for agent_event in parser
                .push_sse_data(&event.data)
                .map_err(AppError::Validation)?
            {
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
            "tool_choice": { "type": "auto" },
        });

        let outcome = stream_claude_request(app, &client, &url, &request.api_key, &body).await?;
        if outcome.tool_calls.is_empty() {
            handle_no_tool_call_turn(app, &request, &outcome)?;
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
            let _ = agent_service::publish_event(
                app,
                json!({
                    "type": "message_update",
                    "assistantMessageEvent": {
                        "type": "text_delta",
                        "delta": text,
                    }
                }),
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
    let response =
        agent_service::handle_tool_request(app, call.id.clone(), method.to_string(), arguments);

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

fn handle_no_tool_call_turn(
    app: &tauri::AppHandle,
    request: &AgentRuntimeRequest,
    outcome: &ProviderTurnOutcome,
) -> AppResult<()> {
    if should_fallback_to_local_mindmap_insert(&request.message) {
        let response = agent_service::handle_tool_request(
            app,
            "local-mindmap-insert-fallback".to_string(),
            "mindmap.insert_nodes".to_string(),
            local_mindmap_insert_params(&request.message, &request.document_context),
        );
        if let Some(error) = response
            .get("error")
            .and_then(|error| error.get("message"))
            .and_then(Value::as_str)
        {
            return Err(AppError::Validation(error.to_string()));
        }
        return Ok(());
    }

    if outcome.text.trim().is_empty() {
        return Err(AppError::Validation(
            "模型没有返回可显示内容，也没有调用可预览的思维导图工具。请重试，或换用支持工具调用的模型。".to_string(),
        ));
    }

    Ok(())
}

fn should_fallback_to_local_mindmap_insert(message: &str) -> bool {
    let normalized = message.to_lowercase();
    let asks_to_generate = [
        "生成",
        "创建",
        "新增",
        "做一个",
        "建立",
        "create",
        "generate",
    ]
    .iter()
    .any(|keyword| normalized.contains(keyword));
    let asks_for_mindmap = ["思维导图", "脑图", "mind map", "mindmap"]
        .iter()
        .any(|keyword| normalized.contains(keyword));

    asks_to_generate && asks_for_mindmap
}

fn local_mindmap_insert_params(message: &str, context: &AgentDocumentContext) -> Value {
    let normalized = message.to_lowercase();
    let is_kaoyan_data_structure = normalized.contains("408") && message.contains("数据结构");
    let (topic, children): (String, Vec<Value>) = if is_kaoyan_data_structure {
        (
            "408 数据结构".to_string(),
            vec![
                json!({ "text": "线性表", "children": [
                    { "text": "顺序表与链表" },
                    { "text": "插入、删除与查找" }
                ] }),
                json!({ "text": "栈、队列和数组", "children": [
                    { "text": "栈与递归" },
                    { "text": "循环队列与矩阵压缩存储" }
                ] }),
                json!({ "text": "树与二叉树", "children": [
                    { "text": "遍历与线索二叉树" },
                    { "text": "哈夫曼树、堆与并查集" }
                ] }),
                json!({ "text": "图", "children": [
                    { "text": "存储结构与遍历" },
                    { "text": "最短路径、生成树与拓扑排序" }
                ] }),
                json!({ "text": "查找", "children": [
                    { "text": "顺序、折半与分块查找" },
                    { "text": "B 树、散列表与冲突处理" }
                ] }),
                json!({ "text": "排序", "children": [
                    { "text": "插入、交换、选择和归并排序" },
                    { "text": "稳定性、复杂度与适用场景" }
                ] }),
            ],
        )
    } else {
        let requested_topic = message
            .replace("生成", "")
            .replace("创建", "")
            .replace("一个", "")
            .replace("思维导图", "")
            .trim()
            .to_string();
        (
            if requested_topic.is_empty() {
                "思维导图".to_string()
            } else {
                requested_topic
            },
            vec![
                json!({ "text": "核心概念" }),
                json!({ "text": "关键分支" }),
                json!({ "text": "后续整理" }),
            ],
        )
    };

    json!({
        "documentId": context.document_id,
        "snapshotKey": context.snapshot_key,
        "parentNodeId": context.root.node_id,
        "nodes": [
            {
                "text": topic,
                "children": children,
            }
        ],
    })
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
    use crate::models::{AgentContextScope, AgentDocumentContext, AgentDocumentNodeContext};

    use super::{join_url, local_mindmap_insert_params, should_fallback_to_local_mindmap_insert};

    #[test]
    fn joins_provider_url_without_double_slash() {
        assert_eq!(
            join_url("https://api.example.com/v1/", "/chat/completions"),
            "https://api.example.com/v1/chat/completions"
        );
    }

    #[test]
    fn creates_local_insert_plan_params_for_mind_map_generation_fallback() {
        assert!(should_fallback_to_local_mindmap_insert(
            "生成一个简易的 408 数据结构思维导图"
        ));
        assert!(!should_fallback_to_local_mindmap_insert("你好"));

        let context = AgentDocumentContext {
            schema_version: 1,
            context_scope: AgentContextScope::CurrentDocument,
            document_id: "doc-1".to_string(),
            title: "测试文档".to_string(),
            snapshot_key: "snapshot".to_string(),
            root: AgentDocumentNodeContext {
                node_id: "root".to_string(),
                text: "根节点".to_string(),
                note: None,
                tags: None,
                checked: None,
                children: Vec::new(),
            },
        };
        let params = local_mindmap_insert_params("生成一个简易的 408 数据结构思维导图", &context);

        assert_eq!(params["documentId"], "doc-1");
        assert_eq!(params["snapshotKey"], "snapshot");
        assert_eq!(params["parentNodeId"], "root");
        assert_eq!(params["nodes"][0]["text"], "408 数据结构");
        assert_eq!(params["nodes"][0]["children"][0]["text"], "线性表");
    }
}

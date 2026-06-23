use serde_json::{json, Value};

use crate::{
    models::AgentDocumentContext, services::agent::protocol::AgentToolCall, utils::error::AppResult,
};

pub(crate) fn openai_assistant_tool_call_message(tool_calls: &[AgentToolCall]) -> Value {
    json!({
        "role": "assistant",
        "content": null,
        "tool_calls": tool_calls
            .iter()
            .map(openai_tool_call_history_item)
            .collect::<Vec<_>>(),
    })
}

pub(crate) fn openai_tool_result_message(call: &AgentToolCall, result: Value) -> Value {
    json!({
        "role": "tool",
        "tool_call_id": call.id,
        "content": result.to_string(),
    })
}

pub(crate) fn claude_assistant_tool_call_message(tool_calls: &[AgentToolCall]) -> Value {
    json!({
        "role": "assistant",
        "content": tool_calls
            .iter()
            .map(|call| {
                json!({
                    "id": call.id,
                    "type": "tool_use",
                    "name": call.name,
                    "input": call.arguments,
                })
            })
            .collect::<Vec<_>>(),
    })
}

pub(crate) fn claude_tool_result_message(
    tool_calls: &[AgentToolCall],
    document_context: &AgentDocumentContext,
    execute_tool_call: impl Fn(&AgentToolCall, &AgentDocumentContext) -> AppResult<Value>,
) -> AppResult<Value> {
    let mut content = Vec::new();

    for call in tool_calls {
        let result = execute_tool_call(call, document_context)?;
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

fn openai_tool_call_history_item(call: &AgentToolCall) -> Value {
    let mut item = json!({
        "id": call.id,
        "type": "function",
        "function": {
            "name": call.name,
            "arguments": call.arguments.to_string(),
        }
    });

    if let Some(extra_content) = call.extra_content.clone() {
        item["extra_content"] = extra_content;
    }

    item
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use crate::services::agent::protocol::AgentToolCall;

    use super::{
        claude_assistant_tool_call_message, openai_assistant_tool_call_message,
        openai_tool_result_message,
    };

    #[test]
    fn builds_openai_tool_messages_for_follow_up_round() {
        let call = AgentToolCall {
            id: "call_1".to_string(),
            name: "library.search".to_string(),
            arguments: json!({ "query": "计划" }),
            extra_content: None,
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
    fn keeps_openai_provider_extra_content_in_tool_call_history() {
        let call = AgentToolCall {
            id: "call_1".to_string(),
            name: "mindmap.insert_nodes".to_string(),
            arguments: json!({ "documentId": "doc" }),
            extra_content: Some(json!({
                "google": {
                    "thought_signature": "sig-1"
                }
            })),
        };

        let assistant_message = openai_assistant_tool_call_message(&[call]);

        assert_eq!(
            assistant_message["tool_calls"][0]["extra_content"]["google"]["thought_signature"],
            "sig-1"
        );
    }

    #[test]
    fn builds_claude_tool_use_message_for_follow_up_round() {
        let call = AgentToolCall {
            id: "toolu_1".to_string(),
            name: "library.search".to_string(),
            arguments: json!({ "query": "计划" }),
            extra_content: None,
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

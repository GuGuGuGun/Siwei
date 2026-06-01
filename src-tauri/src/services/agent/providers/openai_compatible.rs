use std::collections::BTreeMap;

use serde_json::{json, Value};

use crate::services::agent::protocol::{AgentStopReason, AgentStreamEvent, PartialToolCall};
use crate::services::agent::tools::{openai_tool_name, AgentToolDefinition};

#[derive(Debug, Default)]
pub struct OpenAiStreamParser {
    tool_calls: BTreeMap<usize, PartialToolCall>,
}

impl OpenAiStreamParser {
    pub fn push_sse_data(&mut self, data: &str) -> Result<Vec<AgentStreamEvent>, String> {
        let trimmed = data.trim();
        if trimmed.is_empty() {
            return Ok(Vec::new());
        }
        if trimmed == "[DONE]" {
            return Ok(vec![AgentStreamEvent::AgentEnd]);
        }

        let value: Value = serde_json::from_str(trimmed)
            .map_err(|error| format!("OpenAI-compatible SSE JSON 解析失败: {error}"))?;
        let Some(choice) = value
            .get("choices")
            .and_then(Value::as_array)
            .and_then(|choices| choices.first())
        else {
            return Ok(Vec::new());
        };

        let mut events = Vec::new();
        if let Some(content) = choice
            .get("delta")
            .and_then(|delta| delta.get("content"))
            .and_then(Value::as_str)
        {
            if !content.is_empty() {
                events.push(AgentStreamEvent::TextDelta {
                    text: content.to_string(),
                });
            }
        }

        if let Some(tool_calls) = choice
            .get("delta")
            .and_then(|delta| delta.get("tool_calls"))
            .and_then(Value::as_array)
        {
            for tool_call in tool_calls {
                let index = tool_call
                    .get("index")
                    .and_then(Value::as_u64)
                    .unwrap_or(0) as usize;
                let id = tool_call
                    .get("id")
                    .and_then(Value::as_str)
                    .map(ToString::to_string)
                    .unwrap_or_else(|| format!("tool-{index}"));
                let entry = self
                    .tool_calls
                    .entry(index)
                    .or_insert_with(|| PartialToolCall::new(id.clone()));

                if entry.id.starts_with("tool-") && !id.starts_with("tool-") {
                    entry.id = id.clone();
                }

                let name = tool_call
                    .get("function")
                    .and_then(|function| function.get("name"))
                    .and_then(Value::as_str)
                    .map(ToString::to_string);
                if let Some(name) = name.clone().filter(|name| !name.trim().is_empty()) {
                    entry.name = Some(name);
                }

                let arguments_delta = tool_call
                    .get("function")
                    .and_then(|function| function.get("arguments"))
                    .and_then(Value::as_str)
                    .map(ToString::to_string);
                if let Some(delta) = arguments_delta.as_deref() {
                    entry.append_arguments(delta);
                }

                if let Some(extra_content) = tool_call.get("extra_content") {
                    entry.extra_content = Some(extra_content.clone());
                }

                events.push(AgentStreamEvent::ToolCallDelta {
                    id: entry.id.clone(),
                    name,
                    arguments_delta,
                });
            }
        }

        match choice.get("finish_reason").and_then(Value::as_str) {
            Some("tool_calls") => {
                let finished = std::mem::take(&mut self.tool_calls);
                for (_, call) in finished {
                    events.push(AgentStreamEvent::ToolCallDone {
                        call: call.finish()?,
                    });
                }
                events.push(AgentStreamEvent::MessageDone {
                    stop_reason: AgentStopReason::ToolUse,
                });
            }
            Some("stop") => events.push(AgentStreamEvent::MessageDone {
                stop_reason: AgentStopReason::EndTurn,
            }),
            Some(_) => events.push(AgentStreamEvent::MessageDone {
                stop_reason: AgentStopReason::EndTurn,
            }),
            None => {}
        }

        Ok(events)
    }
}

pub fn to_openai_tools(tools: &[AgentToolDefinition]) -> Vec<Value> {
    tools
        .iter()
        .map(|tool| {
            json!({
                "type": "function",
                "function": {
                    "name": openai_tool_name(tool.name),
                    "description": tool.description,
                    "parameters": tool.input_schema,
                }
            })
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use crate::services::agent::protocol::{AgentStopReason, AgentStreamEvent};
    use crate::services::agent::tools::{
        openai_tool_name, siwei_tool_definitions, TOOL_LIBRARY_SEARCH,
        TOOL_MINDMAP_DELETE_NODES, TOOL_MINDMAP_MOVE_NODES, TOOL_MINDMAP_READ_SUBTREE,
        TOOL_MINDMAP_UPDATE_NODES,
    };

    use super::{to_openai_tools, OpenAiStreamParser};

    #[test]
    fn parses_text_delta() {
        let mut parser = OpenAiStreamParser::default();
        let events = parser
            .push_sse_data(r#"{"choices":[{"delta":{"content":"你好"}}]}"#)
            .unwrap();

        assert_eq!(
            events,
            vec![AgentStreamEvent::TextDelta {
                text: "你好".to_string()
            }]
        );
    }

    #[test]
    fn parses_chunked_tool_call() {
        let mut parser = OpenAiStreamParser::default();

        parser
            .push_sse_data(
                r#"{"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"library.search","arguments":"{\"query\":"}}]}}]}"#,
            )
            .unwrap();
        let events = parser
            .push_sse_data(
                r#"{"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\"计划\"}"}}]},"finish_reason":"tool_calls"}]}"#,
            )
            .unwrap();

        assert_eq!(events.len(), 3);
        assert_eq!(
            events[1],
            AgentStreamEvent::ToolCallDone {
                call: crate::services::agent::protocol::AgentToolCall {
                    id: "call_1".to_string(),
                    name: "library.search".to_string(),
                    arguments: json!({ "query": "计划" }),
                    extra_content: None,
                }
            }
        );
        assert_eq!(
            events[2],
            AgentStreamEvent::MessageDone {
                stop_reason: AgentStopReason::ToolUse
            }
        );
    }

    #[test]
    fn parses_done_marker() {
        let mut parser = OpenAiStreamParser::default();

        assert_eq!(
            parser.push_sse_data("[DONE]").unwrap(),
            vec![AgentStreamEvent::AgentEnd]
        );
    }

    #[test]
    fn preserves_provider_tool_call_extra_content() {
        let mut parser = OpenAiStreamParser::default();

        let events = parser
            .push_sse_data(
                r#"{"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"mindmap.insert_nodes","arguments":"{\"documentId\":\"doc\"}"},"extra_content":{"google":{"thought_signature":"sig-1"}}}]},"finish_reason":"tool_calls"}]}"#,
            )
            .unwrap();

        assert_eq!(
            events[1],
            AgentStreamEvent::ToolCallDone {
                call: crate::services::agent::protocol::AgentToolCall {
                    id: "call_1".to_string(),
                    name: "mindmap.insert_nodes".to_string(),
                    arguments: json!({ "documentId": "doc" }),
                    extra_content: Some(json!({
                        "google": {
                            "thought_signature": "sig-1"
                        }
                    })),
                }
            }
        );
    }

    #[test]
    fn infers_missing_mindmap_tool_name_from_arguments() {
        let mut parser = OpenAiStreamParser::default();

        let events = parser
            .push_sse_data(
                r#"{"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"","arguments":"{\"documentId\":\"doc\",\"snapshotKey\":\"snap\",\"parentNodeId\":\"root\",\"nodes\":[{\"text\":\"节点\"}]}"} }]},"finish_reason":"tool_calls"}]}"#,
            )
            .unwrap();

        assert_eq!(
            events[1],
            AgentStreamEvent::ToolCallDone {
                call: crate::services::agent::protocol::AgentToolCall {
                    id: "call_1".to_string(),
                    name: "mindmap_insert_nodes".to_string(),
                    arguments: json!({
                        "documentId": "doc",
                        "snapshotKey": "snap",
                        "parentNodeId": "root",
                        "nodes": [{ "text": "节点" }]
                    }),
                    extra_content: None,
                }
            }
        );
    }

    #[test]
    fn converts_siwei_tools_to_openai_function_schema() {
        let tools = to_openai_tools(&siwei_tool_definitions());
        let library_search = tools
            .iter()
            .find(|tool| tool["function"]["name"] == openai_tool_name(TOOL_LIBRARY_SEARCH))
            .unwrap();

        assert_eq!(library_search["type"], "function");
        assert_eq!(library_search["function"]["name"], "library_search");
        assert_eq!(library_search["function"]["parameters"]["required"], json!(["query"]));
        assert!(tools.iter().all(|tool| {
            tool["function"]["name"]
                .as_str()
                .is_some_and(|name| name.chars().all(|ch| ch.is_ascii_alphanumeric() || ch == '_' || ch == '-'))
        }));
        assert!(tools.iter().any(|tool| {
            tool["function"]["name"] == "mindmap_insert_nodes"
                && tool["function"]["description"].as_str().is_some()
        }));
        for name in [
            TOOL_MINDMAP_UPDATE_NODES,
            TOOL_MINDMAP_MOVE_NODES,
            TOOL_MINDMAP_DELETE_NODES,
            TOOL_MINDMAP_READ_SUBTREE,
        ] {
            assert!(tools
                .iter()
                .any(|tool| tool["function"]["name"] == openai_tool_name(name)));
        }
    }
}

use std::collections::BTreeMap;

use serde_json::{json, Value};

use crate::services::agent::protocol::{AgentStopReason, AgentStreamEvent, PartialToolCall};
use crate::services::agent::tools::AgentToolDefinition;

#[derive(Debug, Default)]
pub struct ClaudeStreamParser {
    content_blocks: BTreeMap<usize, PartialToolCall>,
}

impl ClaudeStreamParser {
    pub fn push_sse_event(
        &mut self,
        event_name: &str,
        data: &str,
    ) -> Result<Vec<AgentStreamEvent>, String> {
        let trimmed = data.trim();
        if trimmed.is_empty() {
            return Ok(Vec::new());
        }

        let value: Value = serde_json::from_str(trimmed)
            .map_err(|error| format!("Claude SSE JSON 解析失败: {error}"))?;
        let mut events = Vec::new();

        match event_name {
            "content_block_start" => {
                let index = value.get("index").and_then(Value::as_u64).unwrap_or(0) as usize;
                if value
                    .get("content_block")
                    .and_then(|block| block.get("type"))
                    .and_then(Value::as_str)
                    == Some("tool_use")
                {
                    let block = value.get("content_block").unwrap_or(&Value::Null);
                    let id = block
                        .get("id")
                        .and_then(Value::as_str)
                        .unwrap_or("tool")
                        .to_string();
                    let mut call = PartialToolCall::new(id.clone());
                    call.name = block
                        .get("name")
                        .and_then(Value::as_str)
                        .map(ToString::to_string);
                    self.content_blocks.insert(index, call);
                    events.push(AgentStreamEvent::ToolCallDelta {
                        id,
                        name: block
                            .get("name")
                            .and_then(Value::as_str)
                            .map(ToString::to_string),
                        arguments_delta: None,
                    });
                }
            }
            "content_block_delta" => {
                let delta = value.get("delta").unwrap_or(&Value::Null);
                match delta.get("type").and_then(Value::as_str) {
                    Some("text_delta") => {
                        if let Some(text) = delta.get("text").and_then(Value::as_str) {
                            events.push(AgentStreamEvent::TextDelta {
                                text: text.to_string(),
                            });
                        }
                    }
                    Some("input_json_delta") => {
                        let index =
                            value.get("index").and_then(Value::as_u64).unwrap_or(0) as usize;
                        let partial_json = delta
                            .get("partial_json")
                            .and_then(Value::as_str)
                            .unwrap_or("");
                        if let Some(call) = self.content_blocks.get_mut(&index) {
                            call.append_arguments(partial_json);
                            events.push(AgentStreamEvent::ToolCallDelta {
                                id: call.id.clone(),
                                name: call.name.clone(),
                                arguments_delta: Some(partial_json.to_string()),
                            });
                        }
                    }
                    _ => {}
                }
            }
            "content_block_stop" => {
                let index = value.get("index").and_then(Value::as_u64).unwrap_or(0) as usize;
                if let Some(call) = self.content_blocks.remove(&index) {
                    events.push(AgentStreamEvent::ToolCallDone {
                        call: call.finish()?,
                    });
                }
            }
            "message_delta" => {
                if let Some(stop_reason) = value
                    .get("delta")
                    .and_then(|delta| delta.get("stop_reason"))
                    .and_then(Value::as_str)
                {
                    events.push(AgentStreamEvent::MessageDone {
                        stop_reason: match stop_reason {
                            "tool_use" => AgentStopReason::ToolUse,
                            _ => AgentStopReason::EndTurn,
                        },
                    });
                }
            }
            "message_stop" => events.push(AgentStreamEvent::AgentEnd),
            _ => {}
        }

        Ok(events)
    }
}

pub fn to_claude_tools(tools: &[AgentToolDefinition]) -> Vec<Value> {
    tools
        .iter()
        .map(|tool| {
            json!({
                "name": tool.name,
                "description": tool.description,
                "input_schema": tool.input_schema,
            })
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use crate::services::agent::tools::{siwei_tool_definitions, TOOL_MINDMAP_INSERT_NODES};
    use crate::services::agent::protocol::{AgentStopReason, AgentStreamEvent};

    use super::{to_claude_tools, ClaudeStreamParser};

    #[test]
    fn parses_text_delta() {
        let mut parser = ClaudeStreamParser::default();
        let events = parser
            .push_sse_event(
                "content_block_delta",
                r#"{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"你好"}}"#,
            )
            .unwrap();

        assert_eq!(
            events,
            vec![AgentStreamEvent::TextDelta {
                text: "你好".to_string()
            }]
        );
    }

    #[test]
    fn parses_tool_use_block() {
        let mut parser = ClaudeStreamParser::default();

        parser
            .push_sse_event(
                "content_block_start",
                r#"{"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"toolu_1","name":"library.search","input":{}}}"#,
            )
            .unwrap();
        parser
            .push_sse_event(
                "content_block_delta",
                r#"{"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"{\"query\":\"计划\"}"}}"#,
            )
            .unwrap();
        let events = parser
            .push_sse_event(
                "content_block_stop",
                r#"{"type":"content_block_stop","index":1}"#,
            )
            .unwrap();

        assert_eq!(
            events,
            vec![AgentStreamEvent::ToolCallDone {
                call: crate::services::agent::protocol::AgentToolCall {
                    id: "toolu_1".to_string(),
                    name: "library.search".to_string(),
                    arguments: json!({ "query": "计划" }),
                }
            }]
        );
    }

    #[test]
    fn maps_tool_use_stop_reason() {
        let mut parser = ClaudeStreamParser::default();

        assert_eq!(
            parser
                .push_sse_event(
                    "message_delta",
                    r#"{"type":"message_delta","delta":{"stop_reason":"tool_use"}}"#,
                )
                .unwrap(),
            vec![AgentStreamEvent::MessageDone {
                stop_reason: AgentStopReason::ToolUse
            }]
        );
    }

    #[test]
    fn converts_siwei_tools_to_claude_schema() {
        let tools = to_claude_tools(&siwei_tool_definitions());
        let insert_nodes = tools
            .iter()
            .find(|tool| tool["name"] == TOOL_MINDMAP_INSERT_NODES)
            .unwrap();

        assert!(insert_nodes.get("input_schema").is_some());
        assert_eq!(
            insert_nodes["input_schema"]["required"],
            json!(["documentId", "snapshotKey", "parentNodeId", "nodes"])
        );
    }
}

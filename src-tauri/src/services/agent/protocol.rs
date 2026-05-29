use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum AgentStopReason {
    EndTurn,
    ToolUse,
    Error,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentToolCall {
    pub id: String,
    pub name: String,
    pub arguments: Value,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "type")]
pub enum AgentStreamEvent {
    TextDelta {
        text: String,
    },
    ToolCallDelta {
        id: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        name: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        arguments_delta: Option<String>,
    },
    ToolCallDone {
        call: AgentToolCall,
    },
    ToolResult {
        id: String,
        name: String,
        result: Value,
    },
    MessageDone {
        stop_reason: AgentStopReason,
    },
    AgentEnd,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PartialToolCall {
    pub id: String,
    pub name: Option<String>,
    pub arguments_json: String,
}

impl PartialToolCall {
    pub fn new(id: String) -> Self {
        Self {
            id,
            name: None,
            arguments_json: String::new(),
        }
    }

    pub fn append_arguments(&mut self, delta: &str) {
        self.arguments_json.push_str(delta);
    }

    pub fn finish(self) -> Result<AgentToolCall, String> {
        let name = self
            .name
            .ok_or_else(|| format!("工具调用 {} 缺少名称", self.id))?;
        let arguments = if self.arguments_json.trim().is_empty() {
            Value::Object(Default::default())
        } else {
            serde_json::from_str(&self.arguments_json).map_err(|error| {
                format!("工具调用 {name} 参数不是合法 JSON: {error}")
            })?
        };

        Ok(AgentToolCall {
            id: self.id,
            name,
            arguments,
        })
    }
}

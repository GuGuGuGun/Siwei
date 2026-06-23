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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub extra_content: Option<Value>,
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
    pub extra_content: Option<Value>,
}

impl PartialToolCall {
    pub fn new(id: String) -> Self {
        Self {
            id,
            name: None,
            arguments_json: String::new(),
            extra_content: None,
        }
    }

    pub fn append_arguments(&mut self, delta: &str) {
        self.arguments_json.push_str(delta);
    }

    pub fn finish(self) -> Result<AgentToolCall, String> {
        let arguments = if self.arguments_json.trim().is_empty() {
            Value::Object(Default::default())
        } else {
            serde_json::from_str(&self.arguments_json)
                .map_err(|error| format!("工具调用 {} 参数不是合法 JSON: {error}", self.id))?
        };
        let name = self
            .name
            .filter(|name| !name.trim().is_empty())
            .or_else(|| infer_tool_name_from_arguments(&arguments).map(ToString::to_string))
            .ok_or_else(|| format!("工具调用 {} 缺少名称", self.id))?;

        Ok(AgentToolCall {
            id: self.id,
            name,
            arguments,
            extra_content: self.extra_content,
        })
    }
}

fn infer_tool_name_from_arguments(arguments: &Value) -> Option<&'static str> {
    let object = arguments.as_object()?;
    if object.contains_key("nodes")
        && object.contains_key("documentId")
        && object.contains_key("snapshotKey")
        && object.contains_key("parentNodeId")
    {
        return Some("mindmap_insert_nodes");
    }
    if object.contains_key("updates")
        && object.contains_key("documentId")
        && object.contains_key("snapshotKey")
    {
        return Some("mindmap_update_nodes");
    }
    if object.contains_key("moves")
        && object.contains_key("documentId")
        && object.contains_key("snapshotKey")
    {
        return Some("mindmap_move_nodes");
    }
    if object.contains_key("deletes")
        && object.contains_key("documentId")
        && object.contains_key("snapshotKey")
    {
        return Some("mindmap_delete_nodes");
    }
    if object.contains_key("nodeId") && object.contains_key("documentId") {
        return Some("mindmap_read_subtree");
    }
    if object.contains_key("query") {
        return Some("library_search");
    }
    if object.contains_key("limit") {
        return Some("library_list");
    }

    None
}

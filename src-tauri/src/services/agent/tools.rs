use serde_json::{json, Value};

pub const TOOL_LIBRARY_LIST: &str = "library.list";
pub const TOOL_LIBRARY_SEARCH: &str = "library.search";
pub const TOOL_MINDMAP_INSERT_NODES: &str = "mindmap.insert_nodes";

#[derive(Debug, Clone, PartialEq)]
pub struct AgentToolDefinition {
    pub name: &'static str,
    pub description: &'static str,
    pub input_schema: Value,
}

pub fn siwei_tool_definitions() -> Vec<AgentToolDefinition> {
    vec![
        AgentToolDefinition {
            name: TOOL_LIBRARY_LIST,
            description: "读取当前文档库中的轻量文档索引，只能作为引用上下文，不能修改文档。",
            input_schema: json!({
                "type": "object",
                "additionalProperties": false,
                "properties": {
                    "limit": {
                        "type": "number",
                        "description": "最多返回多少篇文档，默认 20，最大 50。"
                    }
                }
            }),
        },
        AgentToolDefinition {
            name: TOOL_LIBRARY_SEARCH,
            description: "搜索当前文档库，返回裁剪后的节点引用，只能作为当前文档编辑计划的引用来源。",
            input_schema: json!({
                "type": "object",
                "additionalProperties": false,
                "required": ["query"],
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "搜索关键词。"
                    },
                    "limit": {
                        "type": "number",
                        "description": "最多返回多少条引用，默认 8，最大 20。"
                    }
                }
            }),
        },
        AgentToolDefinition {
            name: TOOL_MINDMAP_INSERT_NODES,
            description: "向当前 Siwei 思维导图插入一个或多个节点。只能写入当前文档，插入后由宿主应用负责生成节点 ID、记录撤销历史和标记未保存。",
            input_schema: json!({
                "type": "object",
                "additionalProperties": false,
                "required": ["documentId", "snapshotKey", "parentNodeId", "nodes"],
                "properties": {
                    "documentId": { "type": "string" },
                    "snapshotKey": { "type": "string" },
                    "parentNodeId": { "type": "string" },
                    "index": { "type": "number" },
                    "nodes": {
                        "type": "array",
                        "minItems": 1,
                        "items": {
                            "type": "object",
                            "additionalProperties": false,
                            "required": ["text"],
                            "properties": {
                                "text": { "type": "string" },
                                "note": { "type": "string" },
                                "tags": {
                                    "type": "array",
                                    "items": { "type": "string" }
                                },
                                "checked": { "type": "boolean" },
                                "children": {
                                    "type": "array",
                                    "items": { "type": "object" }
                                }
                            }
                        }
                    }
                }
            }),
        },
    ]
}

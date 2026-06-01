use serde_json::{json, Value};

pub const TOOL_LIBRARY_LIST: &str = "library.list";
pub const TOOL_LIBRARY_SEARCH: &str = "library.search";
pub const TOOL_MINDMAP_INSERT_NODES: &str = "mindmap.insert_nodes";
pub const TOOL_MINDMAP_UPDATE_NODES: &str = "mindmap.update_nodes";
pub const TOOL_MINDMAP_MOVE_NODES: &str = "mindmap.move_nodes";
pub const TOOL_MINDMAP_DELETE_NODES: &str = "mindmap.delete_nodes";
pub const TOOL_MINDMAP_READ_SUBTREE: &str = "mindmap.read_subtree";

pub const OPENAI_TOOL_LIBRARY_LIST: &str = "library_list";
pub const OPENAI_TOOL_LIBRARY_SEARCH: &str = "library_search";
pub const OPENAI_TOOL_MINDMAP_INSERT_NODES: &str = "mindmap_insert_nodes";
pub const OPENAI_TOOL_MINDMAP_UPDATE_NODES: &str = "mindmap_update_nodes";
pub const OPENAI_TOOL_MINDMAP_MOVE_NODES: &str = "mindmap_move_nodes";
pub const OPENAI_TOOL_MINDMAP_DELETE_NODES: &str = "mindmap_delete_nodes";
pub const OPENAI_TOOL_MINDMAP_READ_SUBTREE: &str = "mindmap_read_subtree";

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
        AgentToolDefinition {
            name: TOOL_MINDMAP_UPDATE_NODES,
            description: "更新当前 Siwei 思维导图中一个或多个已有节点的标题、备注、标签或勾选状态。只能作用于当前文档，结果会先进入宿主应用的待确认修改计划。",
            input_schema: json!({
                "type": "object",
                "additionalProperties": false,
                "required": ["documentId", "snapshotKey", "updates"],
                "properties": {
                    "documentId": { "type": "string" },
                    "snapshotKey": { "type": "string" },
                    "updates": {
                        "type": "array",
                        "minItems": 1,
                        "items": {
                            "type": "object",
                            "additionalProperties": false,
                            "required": ["nodeId"],
                            "properties": {
                                "nodeId": { "type": "string" },
                                "text": { "type": "string" },
                                "note": { "type": ["string", "null"] },
                                "tags": {
                                    "type": "array",
                                    "items": { "type": "string" }
                                },
                                "checked": { "type": ["boolean", "null"] }
                            }
                        }
                    }
                }
            }),
        },
        AgentToolDefinition {
            name: TOOL_MINDMAP_MOVE_NODES,
            description: "移动当前 Siwei 思维导图中的一个或多个节点到新的父节点和顺序位置。只能作用于当前文档，结果会先进入宿主应用的待确认修改计划。",
            input_schema: json!({
                "type": "object",
                "additionalProperties": false,
                "required": ["documentId", "snapshotKey", "moves"],
                "properties": {
                    "documentId": { "type": "string" },
                    "snapshotKey": { "type": "string" },
                    "moves": {
                        "type": "array",
                        "minItems": 1,
                        "items": {
                            "type": "object",
                            "additionalProperties": false,
                            "required": ["nodeId", "targetParentNodeId", "index"],
                            "properties": {
                                "nodeId": { "type": "string" },
                                "targetParentNodeId": { "type": "string" },
                                "index": { "type": "number" }
                            }
                        }
                    }
                }
            }),
        },
        AgentToolDefinition {
            name: TOOL_MINDMAP_DELETE_NODES,
            description: "删除当前 Siwei 思维导图中的一个或多个节点。删除属于高风险操作，结果必须先进入宿主应用的待确认修改计划。",
            input_schema: json!({
                "type": "object",
                "additionalProperties": false,
                "required": ["documentId", "snapshotKey", "deletes"],
                "properties": {
                    "documentId": { "type": "string" },
                    "snapshotKey": { "type": "string" },
                    "deletes": {
                        "type": "array",
                        "minItems": 1,
                        "items": {
                            "type": "object",
                            "additionalProperties": false,
                            "required": ["nodeId"],
                            "properties": {
                                "nodeId": { "type": "string" },
                                "reason": { "type": "string" }
                            }
                        }
                    }
                }
            }),
        },
        AgentToolDefinition {
            name: TOOL_MINDMAP_READ_SUBTREE,
            description: "读取当前注入文档上下文中的指定节点及其子树，只能作为规划和回答的只读上下文。",
            input_schema: json!({
                "type": "object",
                "additionalProperties": false,
                "required": ["documentId", "nodeId"],
                "properties": {
                    "documentId": { "type": "string" },
                    "nodeId": { "type": "string" },
                    "maxDepth": {
                        "type": "number",
                        "description": "最多返回多少层子节点，默认返回完整子树。"
                    }
                }
            }),
        },
    ]
}

pub fn openai_tool_name(name: &'static str) -> &'static str {
    match name {
        TOOL_LIBRARY_LIST => OPENAI_TOOL_LIBRARY_LIST,
        TOOL_LIBRARY_SEARCH => OPENAI_TOOL_LIBRARY_SEARCH,
        TOOL_MINDMAP_INSERT_NODES => OPENAI_TOOL_MINDMAP_INSERT_NODES,
        TOOL_MINDMAP_UPDATE_NODES => OPENAI_TOOL_MINDMAP_UPDATE_NODES,
        TOOL_MINDMAP_MOVE_NODES => OPENAI_TOOL_MINDMAP_MOVE_NODES,
        TOOL_MINDMAP_DELETE_NODES => OPENAI_TOOL_MINDMAP_DELETE_NODES,
        TOOL_MINDMAP_READ_SUBTREE => OPENAI_TOOL_MINDMAP_READ_SUBTREE,
        _ => name,
    }
}

pub fn canonical_tool_name(name: &str) -> &str {
    match name {
        OPENAI_TOOL_LIBRARY_LIST => TOOL_LIBRARY_LIST,
        OPENAI_TOOL_LIBRARY_SEARCH => TOOL_LIBRARY_SEARCH,
        OPENAI_TOOL_MINDMAP_INSERT_NODES => TOOL_MINDMAP_INSERT_NODES,
        OPENAI_TOOL_MINDMAP_UPDATE_NODES => TOOL_MINDMAP_UPDATE_NODES,
        OPENAI_TOOL_MINDMAP_MOVE_NODES => TOOL_MINDMAP_MOVE_NODES,
        OPENAI_TOOL_MINDMAP_DELETE_NODES => TOOL_MINDMAP_DELETE_NODES,
        OPENAI_TOOL_MINDMAP_READ_SUBTREE => TOOL_MINDMAP_READ_SUBTREE,
        other => other,
    }
}

use serde_json::{json, Value};
use tauri::Manager;

use crate::{
    models::{AgentDocumentContext, AgentDocumentNodeContext, AgentLibrarySearchToolQuery},
    services::{agent_service, agent_tool_executor},
    utils::error::{AppError, AppResult},
};

pub fn handle_tool_request(
    app: &tauri::AppHandle,
    id: String,
    method: String,
    params: Value,
) -> Value {
    let result = match method.as_str() {
        "mindmap.insertNodes" | "mindmap.insert_nodes" => {
            // 写操作只发给前端生成待确认计划，真正修改文档仍由前端按 snapshotKey 校验后执行。
            emit_mindmap_tool_result(app, "mindmap_insert_nodes", params);
            Ok(json!({
                "accepted": true,
            }))
        }
        "mindmap.updateNodes" | "mindmap.update_nodes" => {
            emit_mindmap_tool_result(app, "mindmap_update_nodes", params);
            Ok(json!({
                "accepted": true,
            }))
        }
        "mindmap.moveNodes" | "mindmap.move_nodes" => {
            emit_mindmap_tool_result(app, "mindmap_move_nodes", params);
            Ok(json!({
                "accepted": true,
            }))
        }
        "mindmap.deleteNodes" | "mindmap.delete_nodes" => {
            emit_mindmap_tool_result(app, "mindmap_delete_nodes", params);
            Ok(json!({
                "accepted": true,
            }))
        }
        "mindmap.readSubtree" | "mindmap.read_subtree" => read_subtree_from_params(params),
        "library.list" => app
            .path()
            .app_data_dir()
            .map_err(|source| AppError::Tauri {
                operation: "获取应用数据目录",
                source,
            })
            .and_then(|dir| {
                let limit = params
                    .get("limit")
                    .and_then(Value::as_u64)
                    .map(|value| value as u32);
                agent_tool_executor::list_library_documents(&dir, limit)
            })
            .and_then(|value| {
                serde_json::to_value(value)
                    .map_err(|error| AppError::JsonParse(format!("序列化文档库索引失败: {error}")))
            }),
        "library.search" => app
            .path()
            .app_data_dir()
            .map_err(|source| AppError::Tauri {
                operation: "获取应用数据目录",
                source,
            })
            .and_then(|dir| {
                let query: AgentLibrarySearchToolQuery =
                    serde_json::from_value(params).map_err(|error| {
                        AppError::JsonParse(format!("解析文档库搜索参数失败: {error}"))
                    })?;
                agent_tool_executor::search_library_references(&dir, query)
            })
            .and_then(|value| {
                serde_json::to_value(value).map_err(|error| {
                    AppError::JsonParse(format!("序列化文档库搜索结果失败: {error}"))
                })
            }),
        _ => Err(AppError::Validation(format!(
            "不支持的 Agent 工具方法: {}",
            if method.trim().is_empty() {
                "<空>"
            } else {
                method.as_str()
            }
        ))),
    };

    match result {
        Ok(result) => json!({
            "jsonrpc": "2.0",
            "id": id,
            "result": result,
        }),
        Err(error) => json!({
            "jsonrpc": "2.0",
            "id": id,
            "error": {
                "code": -32000,
                "message": error.user_message(),
            },
        }),
    }
}

fn emit_mindmap_tool_result(app: &tauri::AppHandle, tool_name: &str, params: Value) {
    let _ = agent_service::publish_event(
        app,
        json!({
            "type": "tool_result",
            "toolName": tool_name,
            "params": params,
        }),
    );
}

fn read_subtree_from_params(params: Value) -> AppResult<Value> {
    let document_context = params
        .get("documentContext")
        .cloned()
        .ok_or_else(|| AppError::Validation("读取子树缺少当前文档上下文".to_string()))
        .and_then(|value| {
            serde_json::from_value::<AgentDocumentContext>(value)
                .map_err(|error| AppError::JsonParse(format!("解析当前文档上下文失败: {error}")))
        })?;
    let document_id = params
        .get("documentId")
        .and_then(Value::as_str)
        .ok_or_else(|| AppError::Validation("读取子树缺少 documentId".to_string()))?;
    let node_id = params
        .get("nodeId")
        .and_then(Value::as_str)
        .ok_or_else(|| AppError::Validation("读取子树缺少 nodeId".to_string()))?;

    if document_id != document_context.document_id {
        return Err(AppError::Validation(
            "读取子树请求不属于当前文档".to_string(),
        ));
    }

    let max_depth = params
        .get("maxDepth")
        .and_then(Value::as_u64)
        .map(|value| value as usize);
    let subtree = find_agent_node(&document_context.root, node_id)
        .ok_or_else(|| AppError::Validation(format!("节点不存在: {node_id}")))?;
    let clipped = clone_agent_node_with_depth(subtree, max_depth);
    serde_json::to_value(clipped)
        .map_err(|error| AppError::JsonParse(format!("序列化子树上下文失败: {error}")))
}

fn find_agent_node<'a>(
    node: &'a AgentDocumentNodeContext,
    node_id: &str,
) -> Option<&'a AgentDocumentNodeContext> {
    if node.node_id == node_id {
        return Some(node);
    }

    node.children
        .iter()
        .find_map(|child| find_agent_node(child, node_id))
}

fn clone_agent_node_with_depth(
    node: &AgentDocumentNodeContext,
    max_depth: Option<usize>,
) -> AgentDocumentNodeContext {
    let children = match max_depth {
        Some(0) => Vec::new(),
        Some(depth) => node
            .children
            .iter()
            .map(|child| clone_agent_node_with_depth(child, Some(depth - 1)))
            .collect(),
        None => node
            .children
            .iter()
            .map(|child| clone_agent_node_with_depth(child, None))
            .collect(),
    };

    AgentDocumentNodeContext {
        node_id: node.node_id.clone(),
        text: node.text.clone(),
        note: node.note.clone(),
        tags: node.tags.clone(),
        checked: node.checked,
        children,
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::read_subtree_from_params;

    #[test]
    fn reads_subtree_from_current_document_context() {
        let result = read_subtree_from_params(json!({
            "documentId": "doc-1",
            "nodeId": "child",
            "maxDepth": 0,
            "documentContext": {
                "schemaVersion": 1,
                "contextScope": "currentDocument",
                "documentId": "doc-1",
                "title": "测试文档",
                "snapshotKey": "snap",
                "root": {
                    "nodeId": "root",
                    "text": "根节点",
                    "children": [
                        {
                            "nodeId": "child",
                            "text": "子节点",
                            "children": [
                                {
                                    "nodeId": "grandchild",
                                    "text": "孙节点",
                                    "children": []
                                }
                            ]
                        }
                    ]
                }
            }
        }))
        .unwrap();

        assert_eq!(result["nodeId"], "child");
        assert_eq!(result["text"], "子节点");
        assert_eq!(result["children"], json!([]));
    }
}

use std::path::Path;

use crate::{
    models::{
        AgentLibraryDocumentRef, AgentLibrarySearchRef, AgentLibrarySearchToolQuery,
        LibraryDocumentQuery, LibrarySearchQuery,
    },
    services::library_service,
    utils::error::AppResult,
};

const DEFAULT_DOC_LIMIT: u32 = 20;
const MAX_DOC_LIMIT: u32 = 50;
const DEFAULT_SEARCH_LIMIT: u32 = 8;
const MAX_SEARCH_LIMIT: u32 = 20;
const MAX_SNIPPET_CHARS: usize = 160;

pub fn list_library_documents(
    app_data_dir: impl AsRef<Path>,
    limit: Option<u32>,
) -> AppResult<Vec<AgentLibraryDocumentRef>> {
    let limit = normalize_limit(limit, DEFAULT_DOC_LIMIT, MAX_DOC_LIMIT);
    let page = library_service::query_library_docs(
        app_data_dir,
        LibraryDocumentQuery {
            limit: Some(limit),
            offset: Some(0),
            sort_by: None,
            sort_direction: None,
            status: Some("ready".to_string()),
            keyword: None,
        },
    )?;

    Ok(page
        .items
        .into_iter()
        .map(|item| AgentLibraryDocumentRef {
            document_id: item.document_id,
            title: item.title,
            updated_at: item.updated_at,
            node_count: item.node_count,
            task_count: item.task_count,
            tags: item.tags,
        })
        .collect())
}

pub fn search_library_references(
    app_data_dir: impl AsRef<Path>,
    query: AgentLibrarySearchToolQuery,
) -> AppResult<Vec<AgentLibrarySearchRef>> {
    let limit = normalize_limit(query.limit, DEFAULT_SEARCH_LIMIT, MAX_SEARCH_LIMIT);
    let page = library_service::query_library_search(
        app_data_dir,
        LibrarySearchQuery {
            query: query.query,
            limit: Some(limit),
            offset: Some(0),
            document_status: Some("ready".to_string()),
            matched_field: None,
        },
    )?;

    Ok(page
        .items
        .into_iter()
        .map(|item| {
            let snippet = item.snippet.unwrap_or(item.text);
            AgentLibrarySearchRef {
                document_id: item.document_id,
                document_title: item.document_title,
                node_id: item.node_id,
                path: item.path,
                snippet: truncate_chars(&snippet, MAX_SNIPPET_CHARS),
                matched_fields: item
                    .matched_fields
                    .unwrap_or(item.match_sources)
                    .into_iter()
                    .map(|field| {
                        serde_json::to_value(field)
                            .ok()
                            .and_then(|value| value.as_str().map(ToString::to_string))
                            .unwrap_or_else(|| "content".to_string())
                    })
                    .collect(),
            }
        })
        .collect())
}

fn normalize_limit(limit: Option<u32>, default_limit: u32, max_limit: u32) -> u32 {
    limit.unwrap_or(default_limit).clamp(1, max_limit)
}

fn truncate_chars(value: &str, max_chars: usize) -> String {
    let mut output = value.chars().take(max_chars).collect::<String>();
    if value.chars().count() > max_chars {
        output.push('…');
    }
    output
}

#[cfg(test)]
mod tests {
    use tempfile::tempdir;

    use crate::{
        models::{OutlineDocument, OutlineNode},
        services::{agent_tools_service, file_service, library_service},
    };

    fn node(id: &str, text: &str, children: Vec<OutlineNode>) -> OutlineNode {
        OutlineNode {
            id: id.to_string(),
            text: text.to_string(),
            note: None,
            collapsed: None,
            checked: None,
            tags: None,
            created_at: 1,
            updated_at: 1,
            children,
        }
    }

    fn sample_doc(id: &str, title: &str) -> OutlineDocument {
        let mut child = node(
            "task",
            "这是一段用于 AI 搜索引用的较长节点内容，包含项目计划、风险控制和验收标准。",
            Vec::new(),
        );
        child.tags = Some(vec!["AI".to_string(), "计划".to_string()]);
        OutlineDocument {
            id: id.to_string(),
            title: title.to_string(),
            version: 1,
            created_at: 1,
            updated_at: 10,
            mind_map_layout: None,
            root: node("root", title, vec![child]),
        }
    }

    #[test]
    fn lists_library_documents_with_ai_safe_fields_only() {
        let app_dir = tempdir().unwrap();
        let doc_path = app_dir.path().join("doc.siwei.json");
        file_service::save_document(&doc_path, &sample_doc("doc-1", "项目文档")).unwrap();
        library_service::add_library_doc(app_dir.path(), &doc_path).unwrap();

        let docs = agent_tools_service::list_library_documents(app_dir.path(), Some(10)).unwrap();

        assert_eq!(docs.len(), 1);
        assert_eq!(docs[0].document_id, "doc-1");
        assert_eq!(docs[0].title, "项目文档");
        assert_eq!(docs[0].tags, vec!["AI".to_string(), "计划".to_string()]);
    }

    #[test]
    fn searches_library_references_with_limited_snippets() {
        let app_dir = tempdir().unwrap();
        let doc_path = app_dir.path().join("doc.siwei.json");
        file_service::save_document(&doc_path, &sample_doc("doc-1", "项目文档")).unwrap();
        library_service::add_library_doc(app_dir.path(), &doc_path).unwrap();

        let refs = agent_tools_service::search_library_references(
            app_dir.path(),
            crate::models::AgentLibrarySearchToolQuery {
                query: "项目计划".to_string(),
                limit: Some(50),
            },
        )
        .unwrap();

        assert_eq!(refs.len(), 1);
        assert_eq!(refs[0].document_id, "doc-1");
        assert_eq!(refs[0].node_id.as_deref(), Some("task"));
        assert!(refs[0].snippet.chars().count() <= 161);
        assert!(refs[0].matched_fields.contains(&"content".to_string()));
    }
}

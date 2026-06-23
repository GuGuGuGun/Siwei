use std::{fs, path::Path};

use rusqlite::{params, Connection};

use crate::{
    models::{
        LibraryDocumentItem, LibraryDocumentQuery, LibraryDocumentStatus, LibraryPage,
        LibraryRefreshFailureReason, LibraryRefreshStatus, LibrarySearchQuery, LibrarySearchResult,
        LibraryTagQuery, LibraryTagSummary, LibraryTaskQuery, LibraryTaskSummary,
    },
    services::{
        file_service,
        library::{
            aggregator, codec::*, indexer, query as library_query, refresh_job, refresh_worker,
            repository, search_repo, tree::set_node_checked,
        },
    },
    utils::error::{AppError, AppResult},
};

pub fn get_library_docs(app_data_dir: impl AsRef<Path>) -> AppResult<Vec<LibraryDocumentItem>> {
    let conn = open_database(app_data_dir.as_ref())?;
    repository::list_documents(&conn)
}

pub fn query_library_docs(
    app_data_dir: impl AsRef<Path>,
    query: LibraryDocumentQuery,
) -> AppResult<LibraryPage<LibraryDocumentItem>> {
    let conn = open_database(app_data_dir.as_ref())?;
    library_query::query_library_docs(&conn, query)
}

pub fn add_library_doc(
    app_data_dir: impl AsRef<Path>,
    path: impl AsRef<Path>,
) -> AppResult<LibraryDocumentItem> {
    let mut conn = open_database(app_data_dir.as_ref())?;
    indexer::index_document(&mut conn, path.as_ref())
}

pub fn remove_library_doc(app_data_dir: impl AsRef<Path>, path: &str) -> AppResult<()> {
    let conn = open_database(app_data_dir.as_ref())?;
    conn.execute(
        "DELETE FROM library_documents WHERE path = ?1",
        params![path],
    )
    .map_err(db_error)?;
    Ok(())
}

pub fn refresh_library_doc(
    app_data_dir: impl AsRef<Path>,
    path: &str,
) -> AppResult<LibraryDocumentItem> {
    let mut conn = open_database(app_data_dir.as_ref())?;
    indexer::refresh_document_by_path(&mut conn, path)
}

pub fn refresh_library(app_data_dir: impl AsRef<Path>) -> AppResult<Vec<LibraryDocumentItem>> {
    let mut conn = open_database(app_data_dir.as_ref())?;
    let paths = repository::all_document_paths(&conn)?;
    for path in paths {
        let _ = indexer::refresh_document_by_path(&mut conn, &path);
    }
    repository::list_documents(&conn)
}

pub fn search_library(
    app_data_dir: impl AsRef<Path>,
    query: &str,
) -> AppResult<Vec<LibrarySearchResult>> {
    let normalized_query = query.trim();
    if normalized_query.is_empty() {
        return Ok(Vec::new());
    }

    let conn = open_database(app_data_dir.as_ref())?;
    search_repo::search_library_items(&conn, normalized_query)
}

pub fn query_library_search(
    app_data_dir: impl AsRef<Path>,
    query: LibrarySearchQuery,
) -> AppResult<LibraryPage<LibrarySearchResult>> {
    let conn = open_database(app_data_dir.as_ref())?;
    search_repo::query_library_search_page(&conn, query)
}

pub fn get_library_tags(app_data_dir: impl AsRef<Path>) -> AppResult<Vec<LibraryTagSummary>> {
    let conn = open_database(app_data_dir.as_ref())?;
    aggregator::list_tags(&conn)
}

pub fn query_library_tags(
    app_data_dir: impl AsRef<Path>,
    query: LibraryTagQuery,
) -> AppResult<LibraryPage<LibraryTagSummary>> {
    let conn = open_database(app_data_dir.as_ref())?;
    library_query::query_library_tags(&conn, query)
}

pub fn get_library_tasks(app_data_dir: impl AsRef<Path>) -> AppResult<Vec<LibraryTaskSummary>> {
    let conn = open_database(app_data_dir.as_ref())?;
    aggregator::query_tasks(&conn, None, None)
}

pub fn query_library_tasks(
    app_data_dir: impl AsRef<Path>,
    query: LibraryTaskQuery,
) -> AppResult<LibraryPage<LibraryTaskSummary>> {
    let conn = open_database(app_data_dir.as_ref())?;
    library_query::query_library_tasks(&conn, query)
}

pub fn rebuild_library_index(
    app_data_dir: impl AsRef<Path>,
) -> AppResult<Vec<LibraryDocumentItem>> {
    let app_data_dir = app_data_dir.as_ref();
    let conn = open_database(app_data_dir)?;
    let paths = repository::all_document_paths(&conn)?;
    drop(conn);

    let db_path = repository::database_path(app_data_dir);
    if db_path.exists() {
        fs::remove_file(&db_path).map_err(|source| AppError::Io {
            operation: "重建索引库",
            source,
        })?;
    }

    let mut conn = open_database(app_data_dir)?;
    for path in paths {
        let _ = indexer::refresh_document_by_path(&mut conn, &path);
    }
    repository::list_documents(&conn)
}

pub fn toggle_library_task(
    app_data_dir: impl AsRef<Path>,
    document_path: &str,
    node_id: &str,
    checked: bool,
) -> AppResult<LibraryTaskSummary> {
    let mut conn = open_database(app_data_dir.as_ref())?;
    let mut doc = file_service::load_document(document_path)?;
    let now = now_millis();
    let updated = set_node_checked(&mut doc.root, node_id, checked, now);
    if !updated {
        repository::mark_document_status(
            &conn,
            document_path,
            LibraryDocumentStatus::Stale,
            Some(format!("节点不存在: {node_id}")),
            Some(LibraryRefreshFailureReason::Unknown),
            Some(now),
            Some(0),
        )?;
        return Err(AppError::Validation(format!("节点不存在: {node_id}")));
    }

    doc.updated_at = now;
    if let Err(error) = file_service::save_document(document_path, &doc) {
        repository::mark_document_status(
            &conn,
            document_path,
            LibraryDocumentStatus::Error,
            Some(error.user_message()),
            Some(LibraryRefreshFailureReason::PermissionDenied),
            Some(now),
            Some(0),
        )?;
        return Err(error);
    }
    let _ = indexer::refresh_document_by_path(&mut conn, document_path)?;

    aggregator::query_tasks(&conn, Some((document_path, node_id)), None)?
        .into_iter()
        .next()
        .ok_or_else(|| AppError::Validation(format!("任务不存在: {node_id}")))
}

pub fn remove_missing_library_docs(
    app_data_dir: impl AsRef<Path>,
) -> AppResult<Vec<LibraryDocumentItem>> {
    let conn = open_database(app_data_dir.as_ref())?;
    conn.execute("DELETE FROM library_documents WHERE status = 'missing'", [])
        .map_err(db_error)?;
    repository::list_documents(&conn)
}

pub fn start_library_refresh(app_data_dir: impl AsRef<Path>) -> AppResult<String> {
    let app_data_dir = app_data_dir.as_ref().to_path_buf();
    let conn = open_database(&app_data_dir)?;
    let paths = repository::all_document_paths(&conn)?;
    drop(conn);

    if let Some(job_id) = refresh_job::active_job_id()? {
        return Ok(job_id);
    }

    let job_id = format!("library-refresh-{}", now_millis());
    let started_at = now_millis();
    refresh_job::create_refresh_job(job_id.clone(), paths.len() as u32, started_at)?;

    if let Err(error) = refresh_worker::spawn_refresh_worker(app_data_dir, job_id.clone(), paths) {
        refresh_job::increment_refresh_task_failure(&job_id, error.user_message(), now_millis())?;
        return Err(error);
    }
    Ok(job_id)
}

pub fn get_library_refresh_status(
    _app_data_dir: impl AsRef<Path>,
    job_id: &str,
) -> AppResult<LibraryRefreshStatus> {
    refresh_job::get_refresh_status(job_id)
}

pub fn cancel_library_refresh(
    _app_data_dir: impl AsRef<Path>,
    job_id: &str,
) -> AppResult<LibraryRefreshStatus> {
    refresh_job::cancel_refresh(job_id, now_millis())
}

fn open_database(app_data_dir: &Path) -> AppResult<Connection> {
    repository::open_database(app_data_dir)
}

#[cfg(test)]
mod tests {
    use std::fs;

    use tempfile::tempdir;

    use crate::{
        models::{LibraryDocumentStatus, LibrarySearchMatchSource, OutlineDocument, OutlineNode},
        services::{file_service, library_service},
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
        let mut task = node("task", "完成中文检索", Vec::new());
        task.checked = Some(false);
        task.tags = Some(vec!["搜索".to_string(), "后端".to_string()]);
        task.note = Some("FTS 默认分词不足时使用 LIKE 兜底".to_string());

        OutlineDocument {
            id: id.to_string(),
            title: title.to_string(),
            version: 1,
            created_at: 1,
            updated_at: 10,
            mind_map_layout: None,
            root: node("root", title, vec![task]),
        }
    }

    #[test]
    fn initializes_database_and_indexes_document() {
        let app_dir = tempdir().unwrap();
        let doc_path = app_dir.path().join("doc.siwei.json");
        file_service::save_document(&doc_path, &sample_doc("doc-1", "项目文档")).unwrap();

        let item = library_service::add_library_doc(app_dir.path(), &doc_path).unwrap();
        let docs = library_service::get_library_docs(app_dir.path()).unwrap();

        assert_eq!(item.document_id, "doc-1");
        assert_eq!(item.node_count, 2);
        assert_eq!(item.task_count, 1);
        assert_eq!(item.unchecked_task_count, 1);
        assert_eq!(item.tags, vec!["后端".to_string(), "搜索".to_string()]);
        assert_eq!(docs[0].status, LibraryDocumentStatus::Ready);
    }

    #[test]
    fn adding_same_document_id_updates_path() {
        let app_dir = tempdir().unwrap();
        let first_path = app_dir.path().join("first.siwei.json");
        let second_path = app_dir.path().join("second.siwei.json");
        file_service::save_document(&first_path, &sample_doc("doc-1", "旧路径")).unwrap();
        file_service::save_document(&second_path, &sample_doc("doc-1", "新路径")).unwrap();

        library_service::add_library_doc(app_dir.path(), &first_path).unwrap();
        library_service::add_library_doc(app_dir.path(), &second_path).unwrap();
        let docs = library_service::get_library_docs(app_dir.path()).unwrap();

        assert_eq!(docs.len(), 1);
        assert_eq!(docs[0].path, second_path.to_string_lossy());
        assert_eq!(docs[0].title, "新路径");
    }

    #[test]
    fn search_uses_fts_and_like_fallback_with_deduped_sources() {
        let app_dir = tempdir().unwrap();
        let doc_path = app_dir.path().join("doc.siwei.json");
        file_service::save_document(&doc_path, &sample_doc("doc-1", "Alpha Roadmap")).unwrap();
        library_service::add_library_doc(app_dir.path(), &doc_path).unwrap();

        let english = library_service::search_library(app_dir.path(), "Alpha").unwrap();
        let chinese = library_service::search_library(app_dir.path(), "中文检索").unwrap();
        let tag = library_service::search_library(app_dir.path(), "后端").unwrap();

        assert_eq!(
            english[0].match_sources,
            vec![LibrarySearchMatchSource::Title]
        );
        assert_eq!(chinese[0].node_id.as_deref(), Some("task"));
        assert!(tag[0]
            .match_sources
            .contains(&LibrarySearchMatchSource::Tag));
    }

    #[test]
    fn query_documents_supports_paging_filtering_and_sorting() {
        let app_dir = tempdir().unwrap();
        let first_path = app_dir.path().join("first.siwei.json");
        let second_path = app_dir.path().join("second.siwei.json");
        file_service::save_document(&first_path, &sample_doc("doc-1", "Alpha 文档")).unwrap();
        file_service::save_document(&second_path, &sample_doc("doc-2", "Beta 文档")).unwrap();
        library_service::add_library_doc(app_dir.path(), &first_path).unwrap();
        library_service::add_library_doc(app_dir.path(), &second_path).unwrap();

        let page = library_service::query_library_docs(
            app_dir.path(),
            crate::models::LibraryDocumentQuery {
                limit: Some(1),
                offset: Some(0),
                sort_by: Some(crate::models::LibrarySortBy::Title),
                sort_direction: Some(crate::models::LibrarySortDirection::Asc),
                status: Some("ready".to_string()),
                keyword: Some("文档".to_string()),
            },
        )
        .unwrap();

        assert_eq!(page.items.len(), 1);
        assert!(page.has_more);
        assert_eq!(page.total, Some(2));
        assert_eq!(page.items[0].title, "Alpha 文档");
    }

    #[test]
    fn query_search_returns_snippet_highlight_and_location() {
        let app_dir = tempdir().unwrap();
        let doc_path = app_dir.path().join("doc.siwei.json");
        file_service::save_document(&doc_path, &sample_doc("doc-1", "项目文档")).unwrap();
        library_service::add_library_doc(app_dir.path(), &doc_path).unwrap();

        let page = library_service::query_library_search(
            app_dir.path(),
            crate::models::LibrarySearchQuery {
                query: "中文检索".to_string(),
                limit: Some(50),
                offset: Some(0),
                document_status: None,
                matched_field: Some("content".to_string()),
            },
        )
        .unwrap();

        assert_eq!(
            page.items[0].matched_fields.as_ref().unwrap(),
            &vec![LibrarySearchMatchSource::Content]
        );
        assert_eq!(page.items[0].highlight_ranges.as_ref().unwrap()[0].start, 2);
        assert_eq!(
            page.items[0].location.as_ref().unwrap().node_id.as_deref(),
            Some("task")
        );
    }

    #[test]
    fn aggregates_tags_and_tasks() {
        let app_dir = tempdir().unwrap();
        let doc_path = app_dir.path().join("doc.siwei.json");
        file_service::save_document(&doc_path, &sample_doc("doc-1", "项目文档")).unwrap();
        library_service::add_library_doc(app_dir.path(), &doc_path).unwrap();

        let tags = library_service::get_library_tags(app_dir.path()).unwrap();
        let tasks = library_service::get_library_tasks(app_dir.path()).unwrap();

        assert_eq!(
            tags.iter()
                .find(|tag| tag.tag == "后端")
                .unwrap()
                .node_count,
            1
        );
        assert_eq!(tasks.len(), 1);
        assert_eq!(tasks[0].node_id, "task");
        assert!(!tasks[0].checked);
    }

    #[test]
    fn toggles_task_by_reloading_source_document_and_refreshing_index() {
        let app_dir = tempdir().unwrap();
        let doc_path = app_dir.path().join("doc.siwei.json");
        file_service::save_document(&doc_path, &sample_doc("doc-1", "项目文档")).unwrap();
        library_service::add_library_doc(app_dir.path(), &doc_path).unwrap();

        let task = library_service::toggle_library_task(
            app_dir.path(),
            &doc_path.to_string_lossy(),
            "task",
            true,
        )
        .unwrap();
        let loaded = file_service::load_document(&doc_path).unwrap();

        assert!(task.checked);
        assert_eq!(loaded.root.children[0].checked, Some(true));
        assert_eq!(
            library_service::get_library_docs(app_dir.path()).unwrap()[0].unchecked_task_count,
            0
        );
    }

    #[test]
    fn refresh_marks_missing_and_invalid_documents_without_removing_record() {
        let app_dir = tempdir().unwrap();
        let doc_path = app_dir.path().join("doc.siwei.json");
        file_service::save_document(&doc_path, &sample_doc("doc-1", "项目文档")).unwrap();
        library_service::add_library_doc(app_dir.path(), &doc_path).unwrap();

        fs::remove_file(&doc_path).unwrap();
        let missing =
            library_service::refresh_library_doc(app_dir.path(), &doc_path.to_string_lossy())
                .unwrap();
        assert_eq!(missing.status, LibraryDocumentStatus::Missing);

        fs::write(&doc_path, "{ broken").unwrap();
        let invalid =
            library_service::refresh_library_doc(app_dir.path(), &doc_path.to_string_lossy())
                .unwrap();
        assert_eq!(invalid.status, LibraryDocumentStatus::Invalid);
    }

    #[test]
    fn refresh_job_returns_before_completion_and_can_be_cancelled() {
        let app_dir = tempdir().unwrap();
        for index in 0..20 {
            let doc_path = app_dir.path().join(format!("doc-{index}.siwei.json"));
            file_service::save_document(
                &doc_path,
                &sample_doc(&format!("doc-{index}"), &format!("项目文档 {index}")),
            )
            .unwrap();
            library_service::add_library_doc(app_dir.path(), &doc_path).unwrap();
        }

        let job_id = library_service::start_library_refresh(app_dir.path()).unwrap();
        let initial = library_service::get_library_refresh_status(app_dir.path(), &job_id).unwrap();

        assert!(matches!(
            initial.status,
            crate::models::LibraryRefreshJobStatus::Queued
                | crate::models::LibraryRefreshJobStatus::Running
        ));
        assert!(initial.processed < initial.total);

        let cancelled = library_service::cancel_library_refresh(app_dir.path(), &job_id).unwrap();
        assert!(matches!(
            cancelled.status,
            crate::models::LibraryRefreshJobStatus::CancelRequested
                | crate::models::LibraryRefreshJobStatus::Completed
        ));
    }
}

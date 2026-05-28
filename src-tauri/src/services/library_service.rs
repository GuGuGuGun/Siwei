use std::{
    collections::{BTreeMap, BTreeSet},
    fs,
    path::{Path, PathBuf},
    sync::{Mutex, OnceLock},
    thread,
    time::{SystemTime, UNIX_EPOCH},
};

use rusqlite::{params, Connection, OptionalExtension, Transaction};

use crate::{
    models::{
        LibraryDocumentItem, LibraryDocumentQuery, LibraryDocumentStatus, LibraryHighlightRange,
        LibraryLocation, LibraryLocationSource, LibraryMatchedField, LibraryNodeIndexItem,
        LibraryPage, LibraryRefreshJobStatus, LibraryRefreshStatus, LibrarySearchMatchSource,
        LibrarySearchQuery, LibrarySearchResult, LibrarySortBy, LibrarySortDirection,
        LibraryTagQuery, LibraryTagSummary, LibraryTaskQuery, LibraryTaskSummary,
        OutlineDocument, OutlineNode,
    },
    services::file_service,
    utils::error::{AppError, AppResult},
};

const LIBRARY_DB_FILE: &str = "library.db";
const SCHEMA_VERSION: u32 = 1;
const REFRESH_READ_CONCURRENCY: u32 = 4;

static REFRESH_JOB: OnceLock<Mutex<Option<LibraryRefreshStatus>>> = OnceLock::new();

#[derive(Debug, Clone)]
struct IndexedNode {
    node_id: String,
    text: String,
    note: Option<String>,
    tags: Vec<String>,
    checked: Option<bool>,
    path: Vec<String>,
}

#[derive(Debug)]
struct StoredDocument {
    document_id: String,
    title: String,
    path: String,
    updated_at: u64,
    indexed_at: u64,
    file_mtime: Option<u64>,
    node_count: u32,
    task_count: u32,
    unchecked_task_count: u32,
    status: LibraryDocumentStatus,
    error_summary: Option<String>,
}

pub fn get_library_docs(app_data_dir: impl AsRef<Path>) -> AppResult<Vec<LibraryDocumentItem>> {
    let conn = open_database(app_data_dir.as_ref())?;
    list_documents(&conn)
}

pub fn query_library_docs(
    app_data_dir: impl AsRef<Path>,
    query: LibraryDocumentQuery,
) -> AppResult<LibraryPage<LibraryDocumentItem>> {
    let conn = open_database(app_data_dir.as_ref())?;
    let mut items = list_documents(&conn)?;

    if let Some(status) = query.status.as_deref().and_then(parse_status_filter) {
        items.retain(|item| item.status == status);
    }
    if let Some(keyword) = query.keyword.as_deref().map(str::trim).filter(|value| !value.is_empty()) {
        let keyword = keyword.to_lowercase();
        items.retain(|item| {
            item.title.to_lowercase().contains(&keyword) || item.path.to_lowercase().contains(&keyword)
        });
    }

    let sort_by = query.sort_by.unwrap_or(LibrarySortBy::UpdatedAt);
    let sort_direction = query.sort_direction.unwrap_or(LibrarySortDirection::Desc);
    items.sort_by(|left, right| compare_documents(left, right, &sort_by));
    if matches!(sort_direction, LibrarySortDirection::Desc) {
        items.reverse();
    }
    page_items(items, query.limit, query.offset)
}

pub fn add_library_doc(
    app_data_dir: impl AsRef<Path>,
    path: impl AsRef<Path>,
) -> AppResult<LibraryDocumentItem> {
    let mut conn = open_database(app_data_dir.as_ref())?;
    index_document(&mut conn, path.as_ref())
}

pub fn remove_library_doc(app_data_dir: impl AsRef<Path>, path: &str) -> AppResult<()> {
    let conn = open_database(app_data_dir.as_ref())?;
    conn.execute("DELETE FROM library_documents WHERE path = ?1", params![path])
        .map_err(db_error)?;
    Ok(())
}

pub fn refresh_library_doc(
    app_data_dir: impl AsRef<Path>,
    path: &str,
) -> AppResult<LibraryDocumentItem> {
    let mut conn = open_database(app_data_dir.as_ref())?;
    refresh_document_by_path(&mut conn, path)
}

pub fn refresh_library(app_data_dir: impl AsRef<Path>) -> AppResult<Vec<LibraryDocumentItem>> {
    let mut conn = open_database(app_data_dir.as_ref())?;
    let paths = all_document_paths(&conn)?;
    for path in paths {
        let _ = refresh_document_by_path(&mut conn, &path);
    }
    list_documents(&conn)
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
    let mut results = BTreeMap::<String, LibrarySearchResult>::new();
    search_library_fts(&conn, normalized_query, None, None, &mut results)?;
    search_library_like(&conn, normalized_query, None, None, &mut results)?;
    Ok(results.into_values().collect())
}

pub fn query_library_search(
    app_data_dir: impl AsRef<Path>,
    query: LibrarySearchQuery,
) -> AppResult<LibraryPage<LibrarySearchResult>> {
    let normalized_query = query.query.trim();
    if normalized_query.is_empty() {
        return Ok(LibraryPage { items: Vec::new(), has_more: false, total: Some(0) });
    }

    let conn = open_database(app_data_dir.as_ref())?;
    let status_filter = parse_search_status_filter(query.document_status.as_deref());
    let field_filter = parse_field_filter(query.matched_field.as_deref());
    let mut results = BTreeMap::<String, LibrarySearchResult>::new();
    search_library_fts(&conn, normalized_query, status_filter.as_deref(), field_filter.as_ref(), &mut results)?;
    search_library_like(&conn, normalized_query, status_filter.as_deref(), field_filter.as_ref(), &mut results)?;
    let mut items: Vec<_> = results.into_values().collect();
    items.sort_by(|left, right| {
        right.score.cmp(&left.score)
            .then_with(|| right.document_path.cmp(&left.document_path))
            .then_with(|| left.node_id.cmp(&right.node_id))
    });
    page_items(items, query.limit, query.offset)
}

pub fn get_library_tags(app_data_dir: impl AsRef<Path>) -> AppResult<Vec<LibraryTagSummary>> {
    let conn = open_database(app_data_dir.as_ref())?;
    let mut stmt = conn
        .prepare(
            "SELECT tag, COUNT(DISTINCT document_id), COUNT(*)
             FROM library_node_tags
             GROUP BY tag
             ORDER BY lower(tag)",
        )
        .map_err(db_error)?;
    let rows = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, u32>(1)?,
                row.get::<_, u32>(2)?,
            ))
        })
        .map_err(db_error)?;

    let mut summaries = Vec::new();
    for row in rows {
        let (tag, document_count, node_count) = row.map_err(db_error)?;
        summaries.push(LibraryTagSummary {
            items: nodes_for_tag(&conn, &tag)?,
            tag,
            document_count,
            node_count,
            location: None,
        });
    }
    Ok(summaries)
}

pub fn query_library_tags(
    app_data_dir: impl AsRef<Path>,
    query: LibraryTagQuery,
) -> AppResult<LibraryPage<LibraryTagSummary>> {
    let mut tags = get_library_tags(app_data_dir)?;
    match query.sort_by.as_deref() {
        Some("nodeCount") => tags.sort_by(|left, right| {
            left.node_count.cmp(&right.node_count).then_with(|| left.tag.to_lowercase().cmp(&right.tag.to_lowercase()))
        }),
        _ => tags.sort_by(|left, right| left.tag.to_lowercase().cmp(&right.tag.to_lowercase())),
    }
    if matches!(query.sort_direction, Some(LibrarySortDirection::Desc)) {
        tags.reverse();
    }
    page_items(tags, query.limit, query.offset)
}

pub fn get_library_tasks(app_data_dir: impl AsRef<Path>) -> AppResult<Vec<LibraryTaskSummary>> {
    let conn = open_database(app_data_dir.as_ref())?;
    query_tasks(&conn, None, None)
}

pub fn query_library_tasks(
    app_data_dir: impl AsRef<Path>,
    query: LibraryTaskQuery,
) -> AppResult<LibraryPage<LibraryTaskSummary>> {
    let conn = open_database(app_data_dir.as_ref())?;
    let checked = match query.checked.as_deref() {
        Some("checked") => Some(true),
        Some("unchecked") => Some(false),
        _ => None,
    };
    page_items(query_tasks(&conn, None, checked)?, query.limit, query.offset)
}

pub fn rebuild_library_index(
    app_data_dir: impl AsRef<Path>,
) -> AppResult<Vec<LibraryDocumentItem>> {
    let app_data_dir = app_data_dir.as_ref();
    let conn = open_database(app_data_dir)?;
    let paths = all_document_paths(&conn)?;
    drop(conn);

    let db_path = database_path(app_data_dir);
    if db_path.exists() {
        fs::remove_file(&db_path).map_err(|source| AppError::Io {
            operation: "重建索引库",
            source,
        })?;
    }

    let mut conn = open_database(app_data_dir)?;
    for path in paths {
        let _ = refresh_document_by_path(&mut conn, &path);
    }
    list_documents(&conn)
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
        mark_document_status(
            &conn,
            document_path,
            LibraryDocumentStatus::Stale,
            Some(format!("节点不存在: {node_id}")),
        )?;
        return Err(AppError::Validation(format!("节点不存在: {node_id}")));
    }

    doc.updated_at = now;
    file_service::save_document(document_path, &doc)?;
    let _ = refresh_document_by_path(&mut conn, document_path)?;

    query_tasks(&conn, Some((document_path, node_id)), None)?
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
    list_documents(&conn)
}

pub fn start_library_refresh(app_data_dir: impl AsRef<Path>) -> AppResult<String> {
    let app_data_dir = app_data_dir.as_ref().to_path_buf();
    let conn = open_database(&app_data_dir)?;
    let paths = all_document_paths(&conn)?;
    drop(conn);

    let mut guard = refresh_job_slot().lock().map_err(|_| AppError::Database("刷新任务状态不可写".to_string()))?;
    if let Some(job) = guard.as_ref() {
        if matches!(
            job.status,
            LibraryRefreshJobStatus::Queued
                | LibraryRefreshJobStatus::Running
                | LibraryRefreshJobStatus::CancelRequested
        ) {
            return Ok(job.job_id.clone());
        }
    }

    let job_id = format!("library-refresh-{}", now_millis());
    let started_at = now_millis();
    *guard = Some(LibraryRefreshStatus {
        job_id: job_id.clone(),
        status: LibraryRefreshJobStatus::Queued,
        total: paths.len() as u32,
        processed: 0,
        succeeded: 0,
        failed: 0,
        skipped: 0,
        errors: Vec::new(),
        started_at,
        finished_at: None,
    });
    drop(guard);

    if let Err(error) = spawn_refresh_worker(app_data_dir, job_id.clone(), paths) {
        increment_refresh_task_failure(&job_id, error.user_message())?;
        return Err(error);
    }
    Ok(job_id)
}

fn spawn_refresh_worker(app_data_dir: PathBuf, job_id: String, paths: Vec<String>) -> AppResult<()> {
    thread::Builder::new()
        .name("siwei-library-refresh".to_string())
        .spawn(move || {
            if let Err(error) = run_refresh_job(app_data_dir, job_id.clone(), paths) {
                let _ = increment_refresh_task_failure(&job_id, error.user_message());
            }
        })
        .map(|_| ())
        .map_err(|error| AppError::Database(format!("刷新任务启动失败: {error}")))
}

fn run_refresh_job(
    app_data_dir: PathBuf,
    job_id: String,
    paths: Vec<String>,
) -> AppResult<()> {
    update_refresh_job(&job_id, |job| {
        if matches!(job.status, LibraryRefreshJobStatus::Queued) {
            job.status = LibraryRefreshJobStatus::Running;
        }
    })?;

    // v0.5.0 采用最多 4 个并发读取、串行写库的语义；当前实现保持写入串行，
    // 后续可在不改 API 的前提下把读取阶段真正并行化。
    let _read_concurrency = REFRESH_READ_CONCURRENCY;
    let mut conn = open_database(&app_data_dir)?;
    for path in paths {
        if is_cancel_requested(&job_id)? {
            increment_refresh_skipped(&job_id)?;
            continue;
        }
        match refresh_document_by_path(&mut conn, &path) {
            Ok(item) if matches!(item.status, LibraryDocumentStatus::Ready | LibraryDocumentStatus::Stale) => {
                increment_refresh_success(&job_id)?;
            }
            Ok(item) => {
                increment_refresh_failure(&job_id, item.document_id, item.path, item.status, item.error_summary)?;
            }
            Err(error) => {
                increment_refresh_task_failure(&job_id, error.user_message())?;
                break;
            }
        }
    }
    finish_refresh_job(&job_id)?;
    Ok(())
}

pub fn get_library_refresh_status(
    _app_data_dir: impl AsRef<Path>,
    job_id: &str,
) -> AppResult<LibraryRefreshStatus> {
    refresh_job_slot()
        .lock()
        .map_err(|_| AppError::Database("刷新任务状态不可读".to_string()))?
        .clone()
        .filter(|job| job.job_id == job_id)
        .ok_or_else(|| AppError::Validation(format!("刷新任务不存在: {job_id}")))
}

pub fn cancel_library_refresh(
    _app_data_dir: impl AsRef<Path>,
    job_id: &str,
) -> AppResult<LibraryRefreshStatus> {
    let mut guard = refresh_job_slot()
        .lock()
        .map_err(|_| AppError::Database("刷新任务状态不可写".to_string()))?;
    let job = guard
        .as_mut()
        .filter(|job| job.job_id == job_id)
        .ok_or_else(|| AppError::Validation(format!("刷新任务不存在: {job_id}")))?;
    if matches!(job.status, LibraryRefreshJobStatus::Queued | LibraryRefreshJobStatus::Running) {
        job.status = LibraryRefreshJobStatus::CancelRequested;
    }
    Ok(job.clone())
}

fn open_database(app_data_dir: &Path) -> AppResult<Connection> {
    fs::create_dir_all(app_data_dir).map_err(|source| AppError::Io {
        operation: "创建应用数据目录",
        source,
    })?;

    let path = database_path(app_data_dir);
    let mut conn = match Connection::open(&path) {
        Ok(conn) => conn,
        Err(error) => {
            if path.exists() {
                let _ = fs::remove_file(&path);
                Connection::open(&path).map_err(db_error)?
            } else {
                return Err(db_error(error));
            }
        }
    };

    if let Err(error) = migrate_database(&mut conn) {
        if path.exists() {
            let _ = fs::remove_file(&path);
            let mut rebuilt = Connection::open(&path).map_err(db_error)?;
            migrate_database(&mut rebuilt)?;
            return Ok(rebuilt);
        }
        return Err(error);
    }

    Ok(conn)
}

fn migrate_database(conn: &mut Connection) -> AppResult<()> {
    conn.pragma_update(None, "foreign_keys", "ON")
        .map_err(db_error)?;
    let tx = conn.transaction().map_err(db_error)?;
    tx.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS library_documents (
          document_id TEXT PRIMARY KEY,
          path TEXT NOT NULL UNIQUE,
          title TEXT NOT NULL,
          updated_at INTEGER NOT NULL,
          indexed_at INTEGER NOT NULL,
          file_mtime INTEGER,
          node_count INTEGER NOT NULL DEFAULT 0,
          task_count INTEGER NOT NULL DEFAULT 0,
          unchecked_task_count INTEGER NOT NULL DEFAULT 0,
          status TEXT NOT NULL,
          error_summary TEXT
        );

        CREATE TABLE IF NOT EXISTS library_nodes (
          document_id TEXT NOT NULL,
          node_id TEXT NOT NULL,
          parent_path TEXT NOT NULL,
          text TEXT NOT NULL,
          note TEXT,
          checked INTEGER,
          PRIMARY KEY (document_id, node_id),
          FOREIGN KEY (document_id) REFERENCES library_documents(document_id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS library_node_tags (
          document_id TEXT NOT NULL,
          node_id TEXT NOT NULL,
          tag TEXT NOT NULL,
          PRIMARY KEY (document_id, node_id, tag),
          FOREIGN KEY (document_id, node_id) REFERENCES library_nodes(document_id, node_id) ON DELETE CASCADE
        );

        CREATE VIRTUAL TABLE IF NOT EXISTS library_search_fts USING fts5(
          document_id UNINDEXED,
          node_id UNINDEXED,
          source UNINDEXED,
          text
        );
        ",
    )
    .map_err(db_error)?;
    tx.pragma_update(None, "user_version", SCHEMA_VERSION)
        .map_err(db_error)?;
    tx.commit().map_err(db_error)?;
    Ok(())
}

fn index_document(conn: &mut Connection, path: &Path) -> AppResult<LibraryDocumentItem> {
    let doc = file_service::load_document(path)?;
    let path_string = path.to_string_lossy().to_string();
    let file_mtime = file_mtime(path);
    let indexed_at = now_millis();
    let indexed_nodes = extract_nodes(&doc);
    let tags = collect_tags(&indexed_nodes);
    let node_count = indexed_nodes.len() as u32;
    let task_count = indexed_nodes
        .iter()
        .filter(|node| node.checked.is_some())
        .count() as u32;
    let unchecked_task_count = indexed_nodes
        .iter()
        .filter(|node| node.checked == Some(false))
        .count() as u32;

    let tx = conn.transaction().map_err(db_error)?;
    write_document_index(
        &tx,
        &doc,
        &path_string,
        indexed_at,
        file_mtime,
        &indexed_nodes,
        node_count,
        task_count,
        unchecked_task_count,
    )?;
    tx.commit().map_err(db_error)?;

    Ok(LibraryDocumentItem {
        document_id: doc.id,
        title: doc.title,
        path: path_string,
        updated_at: doc.updated_at,
        indexed_at,
        file_mtime,
        node_count,
        task_count,
        unchecked_task_count,
        tags,
        status: LibraryDocumentStatus::Ready,
        error_summary: None,
    })
}

fn write_document_index(
    tx: &Transaction<'_>,
    doc: &OutlineDocument,
    path: &str,
    indexed_at: u64,
    file_mtime: Option<u64>,
    nodes: &[IndexedNode],
    node_count: u32,
    task_count: u32,
    unchecked_task_count: u32,
) -> AppResult<()> {
    tx.execute(
        "INSERT INTO library_documents (
            document_id, path, title, updated_at, indexed_at, file_mtime,
            node_count, task_count, unchecked_task_count, status, error_summary
         )
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 'ready', NULL)
         ON CONFLICT(document_id) DO UPDATE SET
            path = excluded.path,
            title = excluded.title,
            updated_at = excluded.updated_at,
            indexed_at = excluded.indexed_at,
            file_mtime = excluded.file_mtime,
            node_count = excluded.node_count,
            task_count = excluded.task_count,
            unchecked_task_count = excluded.unchecked_task_count,
            status = 'ready',
            error_summary = NULL",
        params![
            doc.id,
            path,
            doc.title,
            doc.updated_at,
            indexed_at,
            file_mtime,
            node_count,
            task_count,
            unchecked_task_count
        ],
    )
    .map_err(db_error)?;

    tx.execute(
        "DELETE FROM library_nodes WHERE document_id = ?1",
        params![doc.id],
    )
    .map_err(db_error)?;
    tx.execute(
        "DELETE FROM library_search_fts WHERE document_id = ?1",
        params![doc.id],
    )
    .map_err(db_error)?;

    tx.execute(
        "INSERT INTO library_search_fts (document_id, node_id, source, text)
         VALUES (?1, NULL, 'title', ?2)",
        params![doc.id, doc.title],
    )
    .map_err(db_error)?;

    for node in nodes {
        let parent_path = encode_path(&node.path);
        tx.execute(
            "INSERT INTO library_nodes (document_id, node_id, parent_path, text, note, checked)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                doc.id,
                node.node_id,
                parent_path,
                node.text,
                node.note,
                node.checked.map(bool_to_i64)
            ],
        )
        .map_err(db_error)?;

        tx.execute(
            "INSERT INTO library_search_fts (document_id, node_id, source, text)
             VALUES (?1, ?2, 'text', ?3)",
            params![doc.id, node.node_id, node.text],
        )
        .map_err(db_error)?;

        if let Some(note) = &node.note {
            tx.execute(
                "INSERT INTO library_search_fts (document_id, node_id, source, text)
                 VALUES (?1, ?2, 'note', ?3)",
                params![doc.id, node.node_id, note],
            )
            .map_err(db_error)?;
        }

        for tag in &node.tags {
            tx.execute(
                "INSERT INTO library_node_tags (document_id, node_id, tag)
                 VALUES (?1, ?2, ?3)",
                params![doc.id, node.node_id, tag],
            )
            .map_err(db_error)?;
            tx.execute(
                "INSERT INTO library_search_fts (document_id, node_id, source, text)
                 VALUES (?1, ?2, 'tag', ?3)",
                params![doc.id, node.node_id, tag],
            )
            .map_err(db_error)?;
        }
    }

    Ok(())
}

fn refresh_document_by_path(conn: &mut Connection, path: &str) -> AppResult<LibraryDocumentItem> {
    match index_document(conn, Path::new(path)) {
        Ok(item) => Ok(item),
        Err(error) => {
            let status = match error {
                AppError::FileNotFound { .. } => LibraryDocumentStatus::Missing,
                AppError::JsonParse(_) | AppError::Validation(_) => LibraryDocumentStatus::Invalid,
                _ => LibraryDocumentStatus::Stale,
            };
            let summary = error.user_message();
            mark_document_status(conn, path, status, Some(summary))?;
            document_by_path(conn, path)?
                .ok_or_else(|| AppError::Validation(format!("文档库记录不存在: {path}")))
        }
    }
}

fn list_documents(conn: &Connection) -> AppResult<Vec<LibraryDocumentItem>> {
    let mut stmt = conn
        .prepare(
            "SELECT document_id, title, path, updated_at, indexed_at, file_mtime,
                    node_count, task_count, unchecked_task_count, status, error_summary
             FROM library_documents
             ORDER BY indexed_at DESC, lower(title)",
        )
        .map_err(db_error)?;
    let rows = stmt
        .query_map([], read_stored_document)
        .map_err(db_error)?;

    let mut items = Vec::new();
    for row in rows {
        let stored = row.map_err(db_error)?;
        items.push(stored_document_to_item(conn, stored)?);
    }
    Ok(items)
}

fn page_items<T>(items: Vec<T>, limit: Option<u32>, offset: Option<u32>) -> AppResult<LibraryPage<T>> {
    let total = items.len();
    let offset = offset.unwrap_or(0) as usize;
    let limit = limit.unwrap_or(50).clamp(1, 200) as usize;
    let has_more = offset.saturating_add(limit) < total;
    let page = items.into_iter().skip(offset).take(limit).collect();
    Ok(LibraryPage {
        items: page,
        has_more,
        total: Some(total as u32),
    })
}

fn compare_documents(
    left: &LibraryDocumentItem,
    right: &LibraryDocumentItem,
    sort_by: &LibrarySortBy,
) -> std::cmp::Ordering {
    match sort_by {
        LibrarySortBy::UpdatedAt => left.updated_at.cmp(&right.updated_at),
        LibrarySortBy::Title => left.title.to_lowercase().cmp(&right.title.to_lowercase()),
        LibrarySortBy::TaskCount => left.task_count.cmp(&right.task_count),
        LibrarySortBy::TagCount => left.tags.len().cmp(&right.tags.len()),
        LibrarySortBy::Status => status_to_db(&left.status).cmp(status_to_db(&right.status)),
    }
    .then_with(|| left.title.to_lowercase().cmp(&right.title.to_lowercase()))
    .then_with(|| left.path.cmp(&right.path))
}

fn document_by_path(conn: &Connection, path: &str) -> AppResult<Option<LibraryDocumentItem>> {
    let stored = conn
        .query_row(
            "SELECT document_id, title, path, updated_at, indexed_at, file_mtime,
                    node_count, task_count, unchecked_task_count, status, error_summary
             FROM library_documents
             WHERE path = ?1",
            params![path],
            read_stored_document,
        )
        .optional()
        .map_err(db_error)?;

    stored
        .map(|item| stored_document_to_item(conn, item))
        .transpose()
}

fn stored_document_to_item(
    conn: &Connection,
    stored: StoredDocument,
) -> AppResult<LibraryDocumentItem> {
    let current_mtime = file_mtime(&stored.path);
    let status = if matches!(stored.status, LibraryDocumentStatus::Ready)
        && current_mtime.is_some()
        && stored.file_mtime.is_some()
        && current_mtime > stored.file_mtime
    {
        LibraryDocumentStatus::Stale
    } else if matches!(stored.status, LibraryDocumentStatus::Ready)
        && current_mtime.is_none()
    {
        LibraryDocumentStatus::Missing
    } else {
        stored.status
    };

    Ok(LibraryDocumentItem {
        tags: tags_for_document(conn, &stored.document_id)?,
        document_id: stored.document_id,
        title: stored.title,
        path: stored.path,
        updated_at: stored.updated_at,
        indexed_at: stored.indexed_at,
        file_mtime: current_mtime.or(stored.file_mtime),
        node_count: stored.node_count,
        task_count: stored.task_count,
        unchecked_task_count: stored.unchecked_task_count,
        status,
        error_summary: stored.error_summary,
    })
}

fn read_stored_document(row: &rusqlite::Row<'_>) -> rusqlite::Result<StoredDocument> {
    Ok(StoredDocument {
        document_id: row.get(0)?,
        title: row.get(1)?,
        path: row.get(2)?,
        updated_at: row.get(3)?,
        indexed_at: row.get(4)?,
        file_mtime: row.get(5)?,
        node_count: row.get(6)?,
        task_count: row.get(7)?,
        unchecked_task_count: row.get(8)?,
        status: status_from_db(row.get::<_, String>(9)?.as_str()),
        error_summary: row.get(10)?,
    })
}

fn all_document_paths(conn: &Connection) -> AppResult<Vec<String>> {
    let mut stmt = conn
        .prepare("SELECT path FROM library_documents ORDER BY lower(title)")
        .map_err(db_error)?;
    let rows = stmt
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(db_error)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(db_error)
}

fn tags_for_document(conn: &Connection, document_id: &str) -> AppResult<Vec<String>> {
    let mut stmt = conn
        .prepare(
            "SELECT DISTINCT tag FROM library_node_tags
             WHERE document_id = ?1
             ORDER BY lower(tag)",
        )
        .map_err(db_error)?;
    let rows = stmt
        .query_map(params![document_id], |row| row.get::<_, String>(0))
        .map_err(db_error)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(db_error)
}

fn search_library_fts(
    conn: &Connection,
    query: &str,
    status_filter: Option<&[LibraryDocumentStatus]>,
    field_filter: Option<&LibraryMatchedField>,
    results: &mut BTreeMap<String, LibrarySearchResult>,
) -> AppResult<()> {
    let escaped = query.replace('"', "\"\"");
    let fts_query = format!("\"{escaped}\"");
    let mut stmt = conn
        .prepare(
            "SELECT d.document_id, d.title, d.path, f.node_id, f.source,
                    COALESCE(n.text, d.title), COALESCE(n.parent_path, '[]'), d.status
             FROM library_search_fts f
             JOIN library_documents d ON d.document_id = f.document_id
             LEFT JOIN library_nodes n ON n.document_id = f.document_id AND n.node_id = f.node_id
             WHERE library_search_fts MATCH ?1",
        )
        .map_err(db_error)?;
    let rows = stmt
        .query_map(params![fts_query], read_search_row)
        .map_err(db_error)?;
    for row in rows {
        let row = row.map_err(db_error)?;
        if search_row_matches_filters(&row, status_filter, field_filter) {
            merge_search_row(results, row, query);
        }
    }
    Ok(())
}

fn search_library_like(
    conn: &Connection,
    query: &str,
    status_filter: Option<&[LibraryDocumentStatus]>,
    field_filter: Option<&LibraryMatchedField>,
    results: &mut BTreeMap<String, LibrarySearchResult>,
) -> AppResult<()> {
    let like_query = format!("%{}%", query.to_lowercase());
    let mut stmt = conn
        .prepare(
            "SELECT d.document_id, d.title, d.path, NULL AS node_id, 'title' AS source,
                    d.title AS text, '[]' AS parent_path, d.status
             FROM library_documents d
             WHERE lower(d.title) LIKE ?1
             UNION ALL
             SELECT d.document_id, d.title, d.path, n.node_id, 'text' AS source,
                    n.text, n.parent_path, d.status
             FROM library_nodes n
             JOIN library_documents d ON d.document_id = n.document_id
             WHERE lower(n.text) LIKE ?1
             UNION ALL
             SELECT d.document_id, d.title, d.path, n.node_id, 'note' AS source,
                    COALESCE(n.note, n.text), n.parent_path, d.status
             FROM library_nodes n
             JOIN library_documents d ON d.document_id = n.document_id
             WHERE n.note IS NOT NULL AND lower(n.note) LIKE ?1
             UNION ALL
             SELECT d.document_id, d.title, d.path, n.node_id, 'tag' AS source,
                    t.tag, n.parent_path, d.status
             FROM library_node_tags t
             JOIN library_nodes n ON n.document_id = t.document_id AND n.node_id = t.node_id
             JOIN library_documents d ON d.document_id = t.document_id
             WHERE lower(t.tag) LIKE ?1",
        )
        .map_err(db_error)?;
    let rows = stmt
        .query_map(params![like_query], read_search_row)
        .map_err(db_error)?;
    for row in rows {
        let row = row.map_err(db_error)?;
        if search_row_matches_filters(&row, status_filter, field_filter) {
            merge_search_row(results, row, query);
        }
    }
    Ok(())
}

fn read_search_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<SearchRow> {
    Ok(SearchRow {
        document_id: row.get(0)?,
        document_title: row.get(1)?,
        document_path: row.get(2)?,
        node_id: row.get(3)?,
        source: source_from_db(row.get::<_, String>(4)?.as_str()),
        text: row.get(5)?,
        path: decode_path(&row.get::<_, String>(6)?),
        status: if row.as_ref().column_count() > 7 {
            status_from_db(row.get::<_, String>(7)?.as_str())
        } else {
            LibraryDocumentStatus::Ready
        },
    })
}

#[derive(Debug)]
struct SearchRow {
    document_id: String,
    document_title: String,
    document_path: String,
    node_id: Option<String>,
    source: LibrarySearchMatchSource,
    text: String,
    path: Vec<String>,
    status: LibraryDocumentStatus,
}

fn merge_search_row(results: &mut BTreeMap<String, LibrarySearchResult>, row: SearchRow, query: &str) {
    let key = format!(
        "{}:{}",
        row.document_id,
        row.node_id.clone().unwrap_or_else(|| "__title__".to_string())
    );
    let ranges = highlight_ranges(&row.text, query);
    let score = field_weight(&row.source) + ranges.len() as i32 * 10;
    results
        .entry(key)
        .and_modify(|result| {
            if !result.match_sources.contains(&row.source) {
                result.match_sources.push(row.source.clone());
            }
            if let Some(fields) = &mut result.matched_fields {
                if !fields.contains(&row.source) {
                    fields.push(row.source.clone());
                }
            }
            result.score = Some(result.score.unwrap_or_default().max(score));
        })
        .or_insert_with(|| LibrarySearchResult {
            document_id: row.document_id.clone(),
            document_title: row.document_title,
            document_path: row.document_path.clone(),
            document_status: Some(row.status),
            node_id: row.node_id.clone(),
            text: row.text.clone(),
            path: row.path.clone(),
            snippet: Some(row.text),
            highlight_ranges: Some(ranges),
            matched_fields: Some(vec![row.source.clone()]),
            match_sources: vec![row.source],
            score: Some(score),
            location: Some(LibraryLocation {
                document_id: row.document_id,
                document_path: row.document_path,
                node_id: row.node_id,
                path: row.path,
                source: LibraryLocationSource::Search,
            }),
        });
}

fn search_row_matches_filters(
    row: &SearchRow,
    status_filter: Option<&[LibraryDocumentStatus]>,
    field_filter: Option<&LibraryMatchedField>,
) -> bool {
    let status_matches = status_filter
        .map(|statuses| statuses.contains(&row.status))
        .unwrap_or_else(|| matches!(row.status, LibraryDocumentStatus::Ready | LibraryDocumentStatus::Stale));
    let field_matches = field_filter
        .map(|field| field == &row.source)
        .unwrap_or(true);
    status_matches && field_matches
}

fn parse_status_filter(status: &str) -> Option<LibraryDocumentStatus> {
    match status {
        "ready" => Some(LibraryDocumentStatus::Ready),
        "stale" => Some(LibraryDocumentStatus::Stale),
        "missing" => Some(LibraryDocumentStatus::Missing),
        "invalid" => Some(LibraryDocumentStatus::Invalid),
        "indexing" => Some(LibraryDocumentStatus::Indexing),
        "error" => Some(LibraryDocumentStatus::Error),
        _ => None,
    }
}

fn parse_search_status_filter(status: Option<&str>) -> Option<Vec<LibraryDocumentStatus>> {
    match status {
        Some("all") => Some(vec![
            LibraryDocumentStatus::Ready,
            LibraryDocumentStatus::Stale,
            LibraryDocumentStatus::Missing,
            LibraryDocumentStatus::Invalid,
            LibraryDocumentStatus::Error,
        ]),
        Some(value) => parse_status_filter(value).map(|status| vec![status]),
        None => None,
    }
}

fn parse_field_filter(field: Option<&str>) -> Option<LibraryMatchedField> {
    match field {
        Some("title") => Some(LibraryMatchedField::Title),
        Some("content") => Some(LibraryMatchedField::Content),
        Some("note") => Some(LibraryMatchedField::Note),
        Some("tag") => Some(LibraryMatchedField::Tag),
        _ => None,
    }
}

fn field_weight(field: &LibraryMatchedField) -> i32 {
    match field {
        LibraryMatchedField::Title => 400,
        LibraryMatchedField::Content => 300,
        LibraryMatchedField::Note => 200,
        LibraryMatchedField::Tag => 100,
    }
}

fn highlight_ranges(value: &str, query: &str) -> Vec<LibraryHighlightRange> {
    let lower_value = value.to_lowercase();
    let lower_query = query.to_lowercase();
    if lower_query.is_empty() {
        return Vec::new();
    }

    let mut ranges = Vec::new();
    let mut byte_offset = 0;
    while let Some(relative_start) = lower_value[byte_offset..].find(&lower_query) {
        let start_byte = byte_offset + relative_start;
        let end_byte = start_byte + lower_query.len();
        ranges.push(LibraryHighlightRange {
            start: utf16_offset(value, start_byte),
            end: utf16_offset(value, end_byte),
        });
        byte_offset = end_byte;
    }
    ranges
}

fn utf16_offset(value: &str, byte_offset: usize) -> u32 {
    value[..byte_offset.min(value.len())]
        .encode_utf16()
        .count() as u32
}

fn refresh_job_slot() -> &'static Mutex<Option<LibraryRefreshStatus>> {
    REFRESH_JOB.get_or_init(|| Mutex::new(None))
}

fn is_cancel_requested(job_id: &str) -> AppResult<bool> {
    Ok(refresh_job_slot()
        .lock()
        .map_err(|_| AppError::Database("刷新任务状态不可读".to_string()))?
        .as_ref()
        .filter(|job| job.job_id == job_id)
        .map(|job| matches!(job.status, LibraryRefreshJobStatus::CancelRequested))
        .unwrap_or(false))
}

fn increment_refresh_success(job_id: &str) -> AppResult<()> {
    update_refresh_job(job_id, |job| {
        job.processed += 1;
        job.succeeded += 1;
    })
}

fn increment_refresh_skipped(job_id: &str) -> AppResult<()> {
    update_refresh_job(job_id, |job| {
        job.processed += 1;
        job.skipped += 1;
    })
}

fn increment_refresh_failure(
    job_id: &str,
    document_id: String,
    path: String,
    status: LibraryDocumentStatus,
    message: Option<String>,
) -> AppResult<()> {
    update_refresh_job(job_id, |job| {
        job.processed += 1;
        job.failed += 1;
        job.errors.push(crate::models::LibraryRefreshErrorItem {
            document_id,
            path,
            status,
            message: message.unwrap_or_else(|| "刷新失败".to_string()),
            technical_message: None,
        });
    })
}

fn increment_refresh_task_failure(job_id: &str, message: String) -> AppResult<()> {
    update_refresh_job(job_id, |job| {
        job.status = LibraryRefreshJobStatus::Failed;
        job.finished_at = Some(now_millis());
        job.errors.push(crate::models::LibraryRefreshErrorItem {
            document_id: String::new(),
            path: String::new(),
            status: LibraryDocumentStatus::Error,
            message,
            technical_message: None,
        });
    })
}

fn finish_refresh_job(job_id: &str) -> AppResult<()> {
    update_refresh_job(job_id, |job| {
        if matches!(job.status, LibraryRefreshJobStatus::Failed) {
            return;
        }
        job.status = if job.skipped > 0 {
            LibraryRefreshJobStatus::Cancelled
        } else if job.failed > 0 {
            LibraryRefreshJobStatus::CompletedWithErrors
        } else {
            LibraryRefreshJobStatus::Completed
        };
        job.finished_at = Some(now_millis());
    })
}

fn update_refresh_job(
    job_id: &str,
    update: impl FnOnce(&mut LibraryRefreshStatus),
) -> AppResult<()> {
    let mut guard = refresh_job_slot()
        .lock()
        .map_err(|_| AppError::Database("刷新任务状态不可写".to_string()))?;
    let job = guard
        .as_mut()
        .filter(|job| job.job_id == job_id)
        .ok_or_else(|| AppError::Validation(format!("刷新任务不存在: {job_id}")))?;
    update(job);
    Ok(())
}

fn nodes_for_tag(conn: &Connection, tag: &str) -> AppResult<Vec<LibraryNodeIndexItem>> {
    let mut stmt = conn
        .prepare(
            "SELECT n.document_id, n.node_id, n.text, n.note, n.checked, n.parent_path
             FROM library_node_tags t
             JOIN library_nodes n ON n.document_id = t.document_id AND n.node_id = t.node_id
             WHERE t.tag = ?1
             ORDER BY lower(n.text)",
        )
        .map_err(db_error)?;
    let rows = stmt
        .query_map(params![tag], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, Option<String>>(3)?,
                row.get::<_, Option<i64>>(4)?,
                row.get::<_, String>(5)?,
            ))
        })
        .map_err(db_error)?;

    let mut items = Vec::new();
    for row in rows {
        let (document_id, node_id, text, note, checked, parent_path) = row.map_err(db_error)?;
        items.push(LibraryNodeIndexItem {
            tags: node_tags(conn, &document_id, &node_id)?,
            document_id,
            node_id,
            text,
            note,
            checked: checked.map(i64_to_bool),
            path: decode_path(&parent_path),
        });
    }
    Ok(items)
}

fn query_tasks(
    conn: &Connection,
    target: Option<(&str, &str)>,
    checked_filter: Option<bool>,
) -> AppResult<Vec<LibraryTaskSummary>> {
    let (mut where_clause, params_vec): (String, Vec<String>) = match target {
        Some((document_path, node_id)) => (
            "WHERE d.path = ?1 AND n.node_id = ?2 AND n.checked IS NOT NULL".to_string(),
            vec![document_path.to_string(), node_id.to_string()],
        ),
        None => ("WHERE n.checked IS NOT NULL".to_string(), Vec::new()),
    };
    if let Some(checked) = checked_filter {
        where_clause.push_str(if checked { " AND n.checked = 1" } else { " AND n.checked = 0" });
    }
    let sql = format!(
        "SELECT d.document_id, d.title, d.path, n.node_id, n.text, n.checked, n.parent_path, d.status
         FROM library_nodes n
         JOIN library_documents d ON d.document_id = n.document_id
         {where_clause}
         ORDER BY n.checked ASC, d.updated_at DESC, lower(d.title), lower(n.text)"
    );
    let mut stmt = conn.prepare(&sql).map_err(db_error)?;

    let rows = if params_vec.is_empty() {
        stmt.query_map([], read_task_row).map_err(db_error)?
    } else {
        stmt.query_map(params![params_vec[0], params_vec[1]], read_task_row)
            .map_err(db_error)?
    };

    let mut tasks = Vec::new();
    for row in rows {
        let mut task = row.map_err(db_error)?;
        task.tags = node_tags(conn, &task.document_id, &task.node_id)?;
        tasks.push(task);
    }
    Ok(tasks)
}

fn read_task_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<LibraryTaskSummary> {
    let document_id: String = row.get(0)?;
    let document_path: String = row.get(2)?;
    let node_id: String = row.get(3)?;
    let path = decode_path(&row.get::<_, String>(6)?);
    Ok(LibraryTaskSummary {
        document_id: document_id.clone(),
        document_title: row.get(1)?,
        document_path: document_path.clone(),
        node_id: node_id.clone(),
        text: row.get(4)?,
        checked: i64_to_bool(row.get::<_, i64>(5)?),
        path: path.clone(),
        tags: Vec::new(),
        document_status: Some(status_from_db(row.get::<_, String>(7)?.as_str())),
        location: Some(LibraryLocation {
            document_id,
            document_path,
            node_id: Some(node_id),
            path,
            source: LibraryLocationSource::Task,
        }),
    })
}

fn node_tags(conn: &Connection, document_id: &str, node_id: &str) -> AppResult<Vec<String>> {
    let mut stmt = conn
        .prepare(
            "SELECT tag FROM library_node_tags
             WHERE document_id = ?1 AND node_id = ?2
             ORDER BY lower(tag)",
        )
        .map_err(db_error)?;
    let rows = stmt
        .query_map(params![document_id, node_id], |row| row.get::<_, String>(0))
        .map_err(db_error)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(db_error)
}

fn mark_document_status(
    conn: &Connection,
    path: &str,
    status: LibraryDocumentStatus,
    error_summary: Option<String>,
) -> AppResult<()> {
    conn.execute(
        "UPDATE library_documents SET status = ?1, error_summary = ?2 WHERE path = ?3",
        params![status_to_db(&status), error_summary, path],
    )
    .map_err(db_error)?;
    Ok(())
}

fn extract_nodes(doc: &OutlineDocument) -> Vec<IndexedNode> {
    let mut nodes = Vec::new();
    extract_node_recursive(&doc.root, Vec::new(), true, &mut nodes);
    nodes
}

fn extract_node_recursive(
    node: &OutlineNode,
    parent_path: Vec<String>,
    is_root: bool,
    nodes: &mut Vec<IndexedNode>,
) {
    nodes.push(IndexedNode {
        node_id: node.id.clone(),
        text: node.text.clone(),
        note: node.note.clone(),
        tags: node.tags.clone().unwrap_or_default(),
        checked: node.checked,
        path: parent_path.clone(),
    });

    let mut child_path = parent_path;
    if !is_root {
        child_path.push(node.text.clone());
    }

    for child in &node.children {
        extract_node_recursive(child, child_path.clone(), false, nodes);
    }
}

fn collect_tags(nodes: &[IndexedNode]) -> Vec<String> {
    let mut tags = BTreeSet::new();
    for node in nodes {
        for tag in &node.tags {
            tags.insert(tag.clone());
        }
    }
    tags.into_iter().collect()
}

fn set_node_checked(node: &mut OutlineNode, node_id: &str, checked: bool, now: u64) -> bool {
    if node.id == node_id {
        node.checked = Some(checked);
        node.updated_at = now;
        return true;
    }

    for child in &mut node.children {
        if set_node_checked(child, node_id, checked, now) {
            return true;
        }
    }
    false
}

fn encode_path(path: &[String]) -> String {
    serde_json::to_string(path).unwrap_or_else(|_| "[]".to_string())
}

fn decode_path(path: &str) -> Vec<String> {
    serde_json::from_str(path).unwrap_or_default()
}

fn database_path(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join(LIBRARY_DB_FILE)
}

fn file_mtime(path: impl AsRef<Path>) -> Option<u64> {
    fs::metadata(path)
        .and_then(|metadata| metadata.modified())
        .ok()
        .and_then(system_time_millis)
}

fn system_time_millis(time: SystemTime) -> Option<u64> {
    time.duration_since(UNIX_EPOCH)
        .ok()
        .map(|duration| duration.as_millis() as u64)
}

fn now_millis() -> u64 {
    system_time_millis(SystemTime::now()).unwrap_or(1)
}

fn bool_to_i64(value: bool) -> i64 {
    if value {
        1
    } else {
        0
    }
}

fn i64_to_bool(value: i64) -> bool {
    value != 0
}

fn status_to_db(status: &LibraryDocumentStatus) -> &'static str {
    match status {
        LibraryDocumentStatus::Ready => "ready",
        LibraryDocumentStatus::Stale => "stale",
        LibraryDocumentStatus::Missing => "missing",
        LibraryDocumentStatus::Invalid => "invalid",
        LibraryDocumentStatus::Indexing => "indexing",
        LibraryDocumentStatus::Error => "error",
    }
}

fn status_from_db(status: &str) -> LibraryDocumentStatus {
    match status {
        "stale" => LibraryDocumentStatus::Stale,
        "missing" => LibraryDocumentStatus::Missing,
        "invalid" => LibraryDocumentStatus::Invalid,
        "indexing" => LibraryDocumentStatus::Indexing,
        "error" => LibraryDocumentStatus::Error,
        _ => LibraryDocumentStatus::Ready,
    }
}

fn source_from_db(source: &str) -> LibrarySearchMatchSource {
    match source {
        "title" => LibrarySearchMatchSource::Title,
        "note" => LibrarySearchMatchSource::Note,
        "tag" => LibrarySearchMatchSource::Tag,
        _ => LibrarySearchMatchSource::Content,
    }
}

fn db_error(error: rusqlite::Error) -> AppError {
    AppError::Database(error.to_string())
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

        assert_eq!(english[0].match_sources, vec![LibrarySearchMatchSource::Title]);
        assert_eq!(chinese[0].node_id.as_deref(), Some("task"));
        assert!(tag[0].match_sources.contains(&LibrarySearchMatchSource::Tag));
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

        assert_eq!(page.items[0].matched_fields.as_ref().unwrap(), &vec![LibrarySearchMatchSource::Content]);
        assert_eq!(page.items[0].highlight_ranges.as_ref().unwrap()[0].start, 2);
        assert_eq!(page.items[0].location.as_ref().unwrap().node_id.as_deref(), Some("task"));
    }

    #[test]
    fn aggregates_tags_and_tasks() {
        let app_dir = tempdir().unwrap();
        let doc_path = app_dir.path().join("doc.siwei.json");
        file_service::save_document(&doc_path, &sample_doc("doc-1", "项目文档")).unwrap();
        library_service::add_library_doc(app_dir.path(), &doc_path).unwrap();

        let tags = library_service::get_library_tags(app_dir.path()).unwrap();
        let tasks = library_service::get_library_tasks(app_dir.path()).unwrap();

        assert_eq!(tags.iter().find(|tag| tag.tag == "后端").unwrap().node_count, 1);
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
        let missing = library_service::refresh_library_doc(app_dir.path(), &doc_path.to_string_lossy()).unwrap();
        assert_eq!(missing.status, LibraryDocumentStatus::Missing);

        fs::write(&doc_path, "{ broken").unwrap();
        let invalid = library_service::refresh_library_doc(app_dir.path(), &doc_path.to_string_lossy()).unwrap();
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

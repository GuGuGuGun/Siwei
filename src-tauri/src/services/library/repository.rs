use std::{fs, path::{Path, PathBuf}};

use rusqlite::{params, Connection, OptionalExtension, Transaction};

use crate::{
    models::{LibraryDocumentItem, LibraryDocumentStatus, OutlineDocument},
    utils::error::{AppError, AppResult},
};

use super::{
    codec::{bool_to_i64, db_error, encode_path, failure_reason_to_db, status_to_db},
    document_mapper::{read_stored_document, stored_document_to_item},
    migration,
    models::IndexedNode,
};

const LIBRARY_DB_FILE: &str = "library.db";

pub(crate) fn open_database(app_data_dir: &Path) -> AppResult<Connection> {
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

    if let Err(error) = migration::migrate_database(&mut conn) {
        if path.exists() {
            let _ = fs::remove_file(&path);
            let mut rebuilt = Connection::open(&path).map_err(db_error)?;
            migration::migrate_database(&mut rebuilt)?;
            return Ok(rebuilt);
        }
        return Err(error);
    }

    Ok(conn)
}

pub(crate) fn database_path(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join(LIBRARY_DB_FILE)
}

pub(crate) fn list_documents(conn: &Connection) -> AppResult<Vec<LibraryDocumentItem>> {
    let mut stmt = conn
        .prepare(
            "SELECT document_id, title, path, updated_at, indexed_at, file_mtime,
                    node_count, task_count, unchecked_task_count, status, error_summary,
                    last_refresh_at, last_refresh_duration_ms, last_refresh_status, failure_reason
             FROM library_documents
             ORDER BY indexed_at DESC, lower(title)",
        )
        .map_err(db_error)?;
    let rows = stmt.query_map([], read_stored_document).map_err(db_error)?;

    let mut items = Vec::new();
    for row in rows {
        let stored = row.map_err(db_error)?;
        items.push(stored_document_to_item(conn, stored)?);
    }
    Ok(items)
}

pub(crate) fn document_by_path(
    conn: &Connection,
    path: &str,
) -> AppResult<Option<LibraryDocumentItem>> {
    let stored = conn
        .query_row(
            "SELECT document_id, title, path, updated_at, indexed_at, file_mtime,
                    node_count, task_count, unchecked_task_count, status, error_summary,
                    last_refresh_at, last_refresh_duration_ms, last_refresh_status, failure_reason
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

pub(crate) fn all_document_paths(conn: &Connection) -> AppResult<Vec<String>> {
    let mut stmt = conn
        .prepare("SELECT path FROM library_documents ORDER BY lower(title)")
        .map_err(db_error)?;
    let rows = stmt
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(db_error)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(db_error)
}

pub(crate) fn write_document_index(
    tx: &Transaction<'_>,
    doc: &OutlineDocument,
    path: &str,
    indexed_at: u64,
    file_mtime: Option<u64>,
    refresh_duration_ms: u64,
    nodes: &[IndexedNode],
    node_count: u32,
    task_count: u32,
    unchecked_task_count: u32,
) -> AppResult<()> {
    tx.execute(
        "INSERT INTO library_documents (
            document_id, path, title, updated_at, indexed_at, file_mtime,
            node_count, task_count, unchecked_task_count, status, error_summary,
            last_refresh_at, last_refresh_duration_ms, last_refresh_status, failure_reason
         )
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 'ready', NULL, ?10, ?11, 'ready', NULL)
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
            error_summary = NULL,
            last_refresh_at = excluded.last_refresh_at,
            last_refresh_duration_ms = excluded.last_refresh_duration_ms,
            last_refresh_status = 'ready',
            failure_reason = NULL",
        params![
            doc.id,
            path,
            doc.title,
            doc.updated_at,
            indexed_at,
            file_mtime,
            node_count,
            task_count,
            unchecked_task_count,
            indexed_at,
            refresh_duration_ms
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

pub(crate) fn mark_document_status(
    conn: &Connection,
    path: &str,
    status: LibraryDocumentStatus,
    error_summary: Option<String>,
    failure_reason: Option<crate::models::LibraryRefreshFailureReason>,
    last_refresh_at: Option<u64>,
    last_refresh_duration_ms: Option<u64>,
) -> AppResult<()> {
    conn.execute(
        "UPDATE library_documents
         SET status = ?1,
             error_summary = ?2,
             failure_reason = ?3,
             last_refresh_at = ?4,
             last_refresh_duration_ms = ?5,
             last_refresh_status = ?1
         WHERE path = ?6",
        params![
            status_to_db(&status),
            error_summary,
            failure_reason.as_ref().map(failure_reason_to_db),
            last_refresh_at,
            last_refresh_duration_ms,
            path,
        ],
    )
    .map_err(db_error)?;
    Ok(())
}

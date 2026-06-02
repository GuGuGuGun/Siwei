use std::path::Path;

use rusqlite::{params, Connection};

use crate::{
    models::{LibraryDocumentItem, LibraryDocumentStatus},
    utils::error::AppResult,
};

use super::{
    codec::{db_error, failure_reason_from_db, status_from_db, system_time_millis},
    models::StoredDocument,
};

pub(crate) fn stored_document_to_item(
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
    } else if matches!(stored.status, LibraryDocumentStatus::Ready) && current_mtime.is_none() {
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
        last_refresh_at: stored.last_refresh_at,
        last_refresh_duration_ms: stored.last_refresh_duration_ms,
        last_refresh_status: stored.last_refresh_status,
        failure_reason: stored.failure_reason,
    })
}

pub(crate) fn read_stored_document(row: &rusqlite::Row<'_>) -> rusqlite::Result<StoredDocument> {
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
        last_refresh_at: row.get(11)?,
        last_refresh_duration_ms: row.get(12)?,
        last_refresh_status: row
            .get::<_, Option<String>>(13)?
            .as_deref()
            .map(status_from_db),
        failure_reason: row
            .get::<_, Option<String>>(14)?
            .as_deref()
            .and_then(failure_reason_from_db),
    })
}

pub(crate) fn file_mtime(path: impl AsRef<Path>) -> Option<u64> {
    std::fs::metadata(path)
        .and_then(|metadata| metadata.modified())
        .ok()
        .and_then(system_time_millis)
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

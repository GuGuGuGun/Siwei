use std::path::Path;

use rusqlite::Connection;

use crate::{
    models::{LibraryDocumentItem, LibraryDocumentStatus, LibraryRefreshFailureReason},
    services::{
        file_service,
        library::{
            codec::*,
            document_mapper, repository,
            tree::{collect_tags, extract_nodes},
        },
    },
    utils::error::{AppError, AppResult},
};

pub(crate) fn index_document(conn: &mut Connection, path: &Path) -> AppResult<LibraryDocumentItem> {
    let refresh_started_at = now_millis();
    let doc = file_service::load_document(path)?;
    let path_string = path.to_string_lossy().to_string();
    let file_mtime = document_mapper::file_mtime(path);
    let indexed_at = now_millis();
    let duration_ms = indexed_at.saturating_sub(refresh_started_at);
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
    repository::write_document_index(
        &tx,
        &doc,
        &path_string,
        indexed_at,
        file_mtime,
        duration_ms,
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
        last_refresh_at: Some(indexed_at),
        last_refresh_duration_ms: Some(duration_ms),
        last_refresh_status: Some(LibraryDocumentStatus::Ready),
        failure_reason: None,
    })
}

pub(crate) fn refresh_document_by_path(
    conn: &mut Connection,
    path: &str,
) -> AppResult<LibraryDocumentItem> {
    let refresh_started_at = now_millis();
    match index_document(conn, Path::new(path)) {
        Ok(item) => Ok(item),
        Err(error) => {
            let reason = classify_refresh_failure(&error);
            let status = document_status_for_failure(&reason);
            let summary = error.user_message();
            repository::mark_document_status(
                conn,
                path,
                status,
                Some(summary),
                Some(reason),
                Some(refresh_started_at),
                Some(now_millis().saturating_sub(refresh_started_at)),
            )?;
            repository::document_by_path(conn, path)?
                .ok_or_else(|| AppError::Validation(format!("文档库记录不存在: {path}")))
        }
    }
}

fn classify_refresh_failure(error: &AppError) -> LibraryRefreshFailureReason {
    match error {
        AppError::FileNotFound { .. } => LibraryRefreshFailureReason::MissingFile,
        AppError::JsonParse(_) => LibraryRefreshFailureReason::InvalidJson,
        AppError::Validation(message) if message.contains("版本") => {
            LibraryRefreshFailureReason::UnsupportedVersion
        }
        AppError::Validation(_) => LibraryRefreshFailureReason::InvalidJson,
        AppError::Io { source, .. }
            if matches!(
                source.kind(),
                std::io::ErrorKind::PermissionDenied
                    | std::io::ErrorKind::AlreadyExists
                    | std::io::ErrorKind::ExecutableFileBusy
            ) =>
        {
            LibraryRefreshFailureReason::PermissionDenied
        }
        AppError::Database(_) => LibraryRefreshFailureReason::IndexWriteFailed,
        _ => LibraryRefreshFailureReason::Unknown,
    }
}

fn document_status_for_failure(reason: &LibraryRefreshFailureReason) -> LibraryDocumentStatus {
    match reason {
        LibraryRefreshFailureReason::MissingFile => LibraryDocumentStatus::Missing,
        LibraryRefreshFailureReason::InvalidJson
        | LibraryRefreshFailureReason::UnsupportedVersion => LibraryDocumentStatus::Invalid,
        LibraryRefreshFailureReason::PermissionDenied
        | LibraryRefreshFailureReason::IndexWriteFailed
        | LibraryRefreshFailureReason::Unknown => LibraryDocumentStatus::Error,
    }
}

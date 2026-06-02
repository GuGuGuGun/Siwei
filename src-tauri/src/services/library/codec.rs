use std::time::{SystemTime, UNIX_EPOCH};

use crate::{
    models::{
        LibraryDocumentStatus, LibraryRefreshFailureReason, LibrarySearchMatchSource,
    },
    utils::error::AppError,
};

pub(crate) fn encode_path(path: &[String]) -> String {
    serde_json::to_string(path).unwrap_or_else(|_| "[]".to_string())
}

pub(crate) fn decode_path(path: &str) -> Vec<String> {
    serde_json::from_str(path).unwrap_or_default()
}

pub(crate) fn system_time_millis(time: SystemTime) -> Option<u64> {
    time.duration_since(UNIX_EPOCH)
        .ok()
        .map(|duration| duration.as_millis() as u64)
}

pub(crate) fn now_millis() -> u64 {
    system_time_millis(SystemTime::now()).unwrap_or(1)
}

pub(crate) fn bool_to_i64(value: bool) -> i64 {
    if value {
        1
    } else {
        0
    }
}

pub(crate) fn i64_to_bool(value: i64) -> bool {
    value != 0
}

pub(crate) fn status_to_db(status: &LibraryDocumentStatus) -> &'static str {
    match status {
        LibraryDocumentStatus::Ready => "ready",
        LibraryDocumentStatus::Stale => "stale",
        LibraryDocumentStatus::Missing => "missing",
        LibraryDocumentStatus::Invalid => "invalid",
        LibraryDocumentStatus::Indexing => "indexing",
        LibraryDocumentStatus::Error => "error",
    }
}

pub(crate) fn status_from_db(status: &str) -> LibraryDocumentStatus {
    match status {
        "stale" => LibraryDocumentStatus::Stale,
        "missing" => LibraryDocumentStatus::Missing,
        "invalid" => LibraryDocumentStatus::Invalid,
        "indexing" => LibraryDocumentStatus::Indexing,
        "error" => LibraryDocumentStatus::Error,
        _ => LibraryDocumentStatus::Ready,
    }
}

pub(crate) fn failure_reason_to_db(reason: &LibraryRefreshFailureReason) -> &'static str {
    match reason {
        LibraryRefreshFailureReason::MissingFile => "missingFile",
        LibraryRefreshFailureReason::InvalidJson => "invalidJson",
        LibraryRefreshFailureReason::UnsupportedVersion => "unsupportedVersion",
        LibraryRefreshFailureReason::PermissionDenied => "permissionDenied",
        LibraryRefreshFailureReason::IndexWriteFailed => "indexWriteFailed",
        LibraryRefreshFailureReason::Unknown => "unknown",
    }
}

pub(crate) fn failure_reason_from_db(reason: &str) -> Option<LibraryRefreshFailureReason> {
    match reason {
        "missingFile" => Some(LibraryRefreshFailureReason::MissingFile),
        "invalidJson" => Some(LibraryRefreshFailureReason::InvalidJson),
        "unsupportedVersion" => Some(LibraryRefreshFailureReason::UnsupportedVersion),
        "permissionDenied" => Some(LibraryRefreshFailureReason::PermissionDenied),
        "indexWriteFailed" => Some(LibraryRefreshFailureReason::IndexWriteFailed),
        "unknown" => Some(LibraryRefreshFailureReason::Unknown),
        _ => None,
    }
}

pub(crate) fn source_from_db(source: &str) -> LibrarySearchMatchSource {
    match source {
        "title" => LibrarySearchMatchSource::Title,
        "note" => LibrarySearchMatchSource::Note,
        "tag" => LibrarySearchMatchSource::Tag,
        _ => LibrarySearchMatchSource::Content,
    }
}

pub(crate) fn db_error(error: rusqlite::Error) -> AppError {
    AppError::Database(error.to_string())
}

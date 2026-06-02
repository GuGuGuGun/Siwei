use crate::models::{
    LibraryDocumentStatus, LibraryRefreshFailureReason, LibrarySearchMatchSource,
};

#[derive(Debug, Clone)]
pub(crate) struct IndexedNode {
    pub(crate) node_id: String,
    pub(crate) text: String,
    pub(crate) note: Option<String>,
    pub(crate) tags: Vec<String>,
    pub(crate) checked: Option<bool>,
    pub(crate) path: Vec<String>,
}

#[derive(Debug)]
pub(crate) struct StoredDocument {
    pub(crate) document_id: String,
    pub(crate) title: String,
    pub(crate) path: String,
    pub(crate) updated_at: u64,
    pub(crate) indexed_at: u64,
    pub(crate) file_mtime: Option<u64>,
    pub(crate) node_count: u32,
    pub(crate) task_count: u32,
    pub(crate) unchecked_task_count: u32,
    pub(crate) status: LibraryDocumentStatus,
    pub(crate) error_summary: Option<String>,
    pub(crate) last_refresh_at: Option<u64>,
    pub(crate) last_refresh_duration_ms: Option<u64>,
    pub(crate) last_refresh_status: Option<LibraryDocumentStatus>,
    pub(crate) failure_reason: Option<LibraryRefreshFailureReason>,
}

#[derive(Debug)]
pub(crate) struct SearchRow {
    pub(crate) document_id: String,
    pub(crate) document_title: String,
    pub(crate) document_path: String,
    pub(crate) node_id: Option<String>,
    pub(crate) source: LibrarySearchMatchSource,
    pub(crate) text: String,
    pub(crate) path: Vec<String>,
    pub(crate) status: LibraryDocumentStatus,
}

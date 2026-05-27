use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum LibraryDocumentStatus {
    Ready,
    Missing,
    Invalid,
    Stale,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LibraryDocumentItem {
    pub document_id: String,
    pub title: String,
    pub path: String,
    pub updated_at: u64,
    pub indexed_at: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file_mtime: Option<u64>,
    pub node_count: u32,
    pub task_count: u32,
    pub unchecked_task_count: u32,
    pub tags: Vec<String>,
    pub status: LibraryDocumentStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error_summary: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LibraryNodeIndexItem {
    pub document_id: String,
    pub node_id: String,
    pub text: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
    pub tags: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub checked: Option<bool>,
    pub path: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum LibrarySearchMatchSource {
    Title,
    Text,
    Note,
    Tag,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LibrarySearchResult {
    pub document_id: String,
    pub document_title: String,
    pub document_path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub node_id: Option<String>,
    pub text: String,
    pub path: Vec<String>,
    pub match_sources: Vec<LibrarySearchMatchSource>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LibraryTagSummary {
    pub tag: String,
    pub document_count: u32,
    pub node_count: u32,
    pub items: Vec<LibraryNodeIndexItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LibraryTaskSummary {
    pub document_id: String,
    pub document_title: String,
    pub document_path: String,
    pub node_id: String,
    pub text: String,
    pub checked: bool,
    pub path: Vec<String>,
    pub tags: Vec<String>,
}

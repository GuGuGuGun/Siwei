use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum AgentContextScope {
    CurrentDocument,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentDocumentContext {
    pub schema_version: u32,
    pub context_scope: AgentContextScope,
    pub document_id: String,
    pub title: String,
    pub snapshot_key: String,
    pub root: AgentDocumentNodeContext,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentDocumentNodeContext {
    pub node_id: String,
    pub text: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tags: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub checked: Option<bool>,
    pub children: Vec<AgentDocumentNodeContext>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentStatus {
    pub available: bool,
    pub running: bool,
    pub streaming: bool,
    pub session_key: Option<String>,
    pub model: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentLibraryDocumentRef {
    pub document_id: String,
    pub title: String,
    pub updated_at: u64,
    pub node_count: u32,
    pub task_count: u32,
    pub tags: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentLibrarySearchRef {
    pub document_id: String,
    pub document_title: String,
    pub node_id: Option<String>,
    pub path: Vec<String>,
    pub snippet: String,
    pub matched_fields: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentLibrarySearchToolQuery {
    pub query: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub limit: Option<u32>,
}

impl Default for AgentStatus {
    fn default() -> Self {
        Self {
            available: false,
            running: false,
            streaming: false,
            session_key: None,
            model: None,
            error: None,
        }
    }
}

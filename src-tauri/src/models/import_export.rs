use serde::{Deserialize, Serialize};

use super::OutlineDocument;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ImportPreview {
    pub document: OutlineDocument,
    pub summary: ImportSummary,
    pub report: ImportReport,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ImportSummary {
    pub title: String,
    pub node_count: usize,
    pub max_depth: usize,
    pub task_count: usize,
    pub tag_count: usize,
    pub note_count: usize,
    pub warning_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct ImportReport {
    pub items: Vec<ImportReportItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ImportReportItem {
    pub severity: ImportReportSeverity,
    pub node_path: Vec<String>,
    pub field: String,
    pub value: String,
    pub action: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum ImportReportSeverity {
    Info,
    Warning,
}

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RecentDocItem {
    pub path: String,
    pub title: String,
    pub last_opened_at: u64,
}

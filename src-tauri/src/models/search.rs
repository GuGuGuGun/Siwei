use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SearchResult {
    pub node_id: String,
    pub text: String,
    pub path: Vec<String>,
    pub match_indices: Vec<(usize, usize)>,
}

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum SearchMatchSource {
    Text,
    Note,
    Tag,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SearchMatch {
    pub source: SearchMatchSource,
    pub value: String,
    pub match_indices: Vec<(usize, usize)>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SearchResult {
    pub node_id: String,
    pub text: String,
    pub path: Vec<String>,
    pub match_indices: Vec<(usize, usize)>,
    pub match_sources: Vec<SearchMatchSource>,
    pub matches: Vec<SearchMatch>,
}

use crate::{
    models::{OutlineDocument, SearchResult},
    services::search_service,
};

#[tauri::command]
pub fn search_document(doc: OutlineDocument, query: String) -> Vec<SearchResult> {
    search_service::search_document(&doc, &query)
}

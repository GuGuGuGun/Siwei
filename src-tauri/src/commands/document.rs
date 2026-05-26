use crate::{models::OutlineDocument, services::file_service, utils::error::CommandResult};

#[tauri::command]
pub fn new_document() -> OutlineDocument {
    OutlineDocument::new_untitled()
}

#[tauri::command]
pub fn save_document(path: String, doc: OutlineDocument) -> Result<(), String> {
    file_service::save_document(path, &doc).into_command_result()
}

#[tauri::command]
pub fn load_document(path: String) -> Result<OutlineDocument, String> {
    file_service::load_document(path).into_command_result()
}

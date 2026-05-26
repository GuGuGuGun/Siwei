pub mod dialogs;
pub mod document;
pub mod import_export;
pub mod recent;
pub mod search;

pub fn handlers() -> impl Fn(tauri::ipc::Invoke<tauri::Wry>) -> bool + Send + Sync + 'static {
    tauri::generate_handler![
        document::new_document,
        document::save_document,
        document::load_document,
        import_export::export_markdown,
        import_export::import_markdown,
        import_export::export_json,
        import_export::import_json,
        recent::get_recent_docs,
        recent::add_recent_doc,
        recent::remove_recent_doc,
        dialogs::open_file_dialog,
        dialogs::save_file_dialog,
        search::search_document
    ]
}

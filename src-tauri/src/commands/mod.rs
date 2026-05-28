pub mod dialogs;
pub mod document;
pub mod import_export;
pub mod library;
pub mod recent;
pub mod search;
pub mod settings;

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
        library::get_library_docs,
        library::query_library_docs,
        library::add_library_doc,
        library::remove_library_doc,
        library::refresh_library_doc,
        library::refresh_library,
        library::search_library,
        library::query_library_search,
        library::get_library_tags,
        library::query_library_tags,
        library::get_library_tasks,
        library::query_library_tasks,
        library::rebuild_library_index,
        library::start_library_refresh,
        library::get_library_refresh_status,
        library::cancel_library_refresh,
        library::remove_missing_library_docs,
        library::toggle_library_task,
        dialogs::open_file_dialog,
        dialogs::save_file_dialog,
        search::search_document,
        settings::get_settings,
        settings::update_settings
    ]
}

use tauri_plugin_dialog::DialogExt;

#[tauri::command]
pub fn open_file_dialog(app: tauri::AppHandle, filters: Vec<String>) -> Option<String> {
    let mut dialog = app.dialog().file();
    if !filters.is_empty() {
        let extensions: Vec<&str> = filters.iter().map(String::as_str).collect();
        dialog = dialog.add_filter("Supported files", &extensions);
    }

    dialog
        .blocking_pick_file()
        .and_then(|path| path.as_path().map(|path| path.display().to_string()))
}

#[tauri::command]
pub fn save_file_dialog(app: tauri::AppHandle, default_name: String) -> Option<String> {
    app.dialog()
        .file()
        .set_file_name(&default_name)
        .blocking_save_file()
        .and_then(|path| path.as_path().map(|path| path.display().to_string()))
}

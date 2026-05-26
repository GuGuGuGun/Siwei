use tauri::Manager;

use crate::{
    models::RecentDocItem,
    services::recent_service,
    utils::error::{AppError, CommandResult},
};

#[tauri::command]
pub fn get_recent_docs(app: tauri::AppHandle) -> Result<Vec<RecentDocItem>, String> {
    app_data_dir(&app)
        .and_then(recent_service::get_recent_docs)
        .into_command_result()
}

#[tauri::command]
pub fn add_recent_doc(app: tauri::AppHandle, item: RecentDocItem) -> Result<(), String> {
    app_data_dir(&app)
        .and_then(|dir| recent_service::add_recent_doc(dir, item))
        .into_command_result()
}

#[tauri::command]
pub fn remove_recent_doc(app: tauri::AppHandle, path: String) -> Result<(), String> {
    app_data_dir(&app)
        .and_then(|dir| recent_service::remove_recent_doc(dir, &path))
        .into_command_result()
}

fn app_data_dir(app: &tauri::AppHandle) -> Result<std::path::PathBuf, AppError> {
    app.path().app_data_dir().map_err(|source| AppError::Tauri {
        operation: "获取应用数据目录",
        source,
    })
}

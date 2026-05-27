use tauri::Manager;

use crate::{
    models::{
        LibraryDocumentItem, LibraryDocumentQuery, LibraryPage, LibraryRefreshStatus,
        LibrarySearchQuery, LibrarySearchResult, LibraryTagQuery, LibraryTagSummary,
        LibraryTaskQuery, LibraryTaskSummary,
    },
    services::library_service,
    utils::error::{AppError, CommandResult},
};

#[tauri::command]
pub fn get_library_docs(app: tauri::AppHandle) -> Result<Vec<LibraryDocumentItem>, String> {
    app_data_dir(&app)
        .and_then(|dir| library_service::get_library_docs(&dir))
        .into_command_result()
}

#[tauri::command]
pub fn query_library_docs(
    app: tauri::AppHandle,
    query: LibraryDocumentQuery,
) -> Result<LibraryPage<LibraryDocumentItem>, String> {
    app_data_dir(&app)
        .and_then(|dir| library_service::query_library_docs(&dir, query))
        .into_command_result()
}

#[tauri::command]
pub fn add_library_doc(app: tauri::AppHandle, path: String) -> Result<LibraryDocumentItem, String> {
    app_data_dir(&app)
        .and_then(|dir| library_service::add_library_doc(&dir, &path))
        .into_command_result()
}

#[tauri::command]
pub fn remove_library_doc(app: tauri::AppHandle, path: String) -> Result<(), String> {
    app_data_dir(&app)
        .and_then(|dir| library_service::remove_library_doc(&dir, &path))
        .into_command_result()
}

#[tauri::command]
pub fn refresh_library_doc(
    app: tauri::AppHandle,
    path: String,
) -> Result<LibraryDocumentItem, String> {
    app_data_dir(&app)
        .and_then(|dir| library_service::refresh_library_doc(&dir, &path))
        .into_command_result()
}

#[tauri::command]
pub fn refresh_library(app: tauri::AppHandle) -> Result<Vec<LibraryDocumentItem>, String> {
    app_data_dir(&app)
        .and_then(|dir| library_service::refresh_library(&dir))
        .into_command_result()
}

#[tauri::command]
pub fn search_library(
    app: tauri::AppHandle,
    query: String,
) -> Result<Vec<LibrarySearchResult>, String> {
    app_data_dir(&app)
        .and_then(|dir| library_service::search_library(&dir, &query))
        .into_command_result()
}

#[tauri::command]
pub fn query_library_search(
    app: tauri::AppHandle,
    query: LibrarySearchQuery,
) -> Result<LibraryPage<LibrarySearchResult>, String> {
    app_data_dir(&app)
        .and_then(|dir| library_service::query_library_search(&dir, query))
        .into_command_result()
}

#[tauri::command]
pub fn get_library_tags(app: tauri::AppHandle) -> Result<Vec<LibraryTagSummary>, String> {
    app_data_dir(&app)
        .and_then(|dir| library_service::get_library_tags(&dir))
        .into_command_result()
}

#[tauri::command]
pub fn query_library_tags(
    app: tauri::AppHandle,
    query: LibraryTagQuery,
) -> Result<LibraryPage<LibraryTagSummary>, String> {
    app_data_dir(&app)
        .and_then(|dir| library_service::query_library_tags(&dir, query))
        .into_command_result()
}

#[tauri::command]
pub fn get_library_tasks(app: tauri::AppHandle) -> Result<Vec<LibraryTaskSummary>, String> {
    app_data_dir(&app)
        .and_then(|dir| library_service::get_library_tasks(&dir))
        .into_command_result()
}

#[tauri::command]
pub fn query_library_tasks(
    app: tauri::AppHandle,
    query: LibraryTaskQuery,
) -> Result<LibraryPage<LibraryTaskSummary>, String> {
    app_data_dir(&app)
        .and_then(|dir| library_service::query_library_tasks(&dir, query))
        .into_command_result()
}

#[tauri::command]
pub fn rebuild_library_index(app: tauri::AppHandle) -> Result<Vec<LibraryDocumentItem>, String> {
    app_data_dir(&app)
        .and_then(|dir| library_service::rebuild_library_index(&dir))
        .into_command_result()
}

#[tauri::command]
pub fn start_library_refresh(app: tauri::AppHandle) -> Result<String, String> {
    app_data_dir(&app)
        .and_then(|dir| library_service::start_library_refresh(&dir))
        .into_command_result()
}

#[tauri::command]
pub fn get_library_refresh_status(
    app: tauri::AppHandle,
    job_id: String,
) -> Result<LibraryRefreshStatus, String> {
    app_data_dir(&app)
        .and_then(|dir| library_service::get_library_refresh_status(&dir, &job_id))
        .into_command_result()
}

#[tauri::command]
pub fn cancel_library_refresh(
    app: tauri::AppHandle,
    job_id: String,
) -> Result<LibraryRefreshStatus, String> {
    app_data_dir(&app)
        .and_then(|dir| library_service::cancel_library_refresh(&dir, &job_id))
        .into_command_result()
}

#[tauri::command]
pub fn remove_missing_library_docs(
    app: tauri::AppHandle,
) -> Result<Vec<LibraryDocumentItem>, String> {
    app_data_dir(&app)
        .and_then(|dir| library_service::remove_missing_library_docs(&dir))
        .into_command_result()
}

#[tauri::command]
pub fn toggle_library_task(
    app: tauri::AppHandle,
    document_path: String,
    node_id: String,
    checked: bool,
) -> Result<LibraryTaskSummary, String> {
    app_data_dir(&app)
        .and_then(|dir| {
            library_service::toggle_library_task(&dir, &document_path, &node_id, checked)
        })
        .into_command_result()
}

fn app_data_dir(app: &tauri::AppHandle) -> Result<std::path::PathBuf, AppError> {
    app.path().app_data_dir().map_err(|source| AppError::Tauri {
        operation: "获取应用数据目录",
        source,
    })
}

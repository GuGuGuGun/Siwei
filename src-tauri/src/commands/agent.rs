use crate::{
    models::{AgentDocumentContext, AgentStatus},
    services::agent_service,
    utils::error::CommandResult,
};

#[tauri::command]
pub fn agent_start_session(app: tauri::AppHandle, session_key: String) -> Result<(), String> {
    agent_service::start_session(app, session_key).into_command_result()
}

#[tauri::command]
pub fn agent_send_message(
    app: tauri::AppHandle,
    message: String,
    document_context: AgentDocumentContext,
) -> Result<(), String> {
    agent_service::send_message(app, message, document_context).into_command_result()
}

#[tauri::command]
pub fn agent_abort() -> Result<(), String> {
    agent_service::abort().into_command_result()
}

#[tauri::command]
pub fn agent_get_status() -> Result<AgentStatus, String> {
    agent_service::get_status().into_command_result()
}

#[tauri::command]
pub fn agent_save_api_key(provider: String, api_key: String) -> Result<(), String> {
    agent_service::save_api_key(provider, api_key).into_command_result()
}

#[tauri::command]
pub fn agent_delete_api_key(provider: String) -> Result<(), String> {
    agent_service::delete_api_key(provider).into_command_result()
}

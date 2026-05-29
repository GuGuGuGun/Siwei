pub mod commands;
pub mod models;
pub mod services;
pub mod utils;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(commands::handlers())
        .run(tauri::generate_context!())
        .expect("failed to run Siwei application");
}

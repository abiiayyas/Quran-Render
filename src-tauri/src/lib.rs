mod db;
mod commands;
mod render;

use tauri::Manager;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let conn = db::init_db(app).expect("Failed to initialize database");
            app.manage(db::AppState {
                db: std::sync::Mutex::new(conn),
            });
            render::init_background_worker(app);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            commands::get_projects,
            commands::save_project,
            commands::get_quran_ayah,
            commands::save_quran_ayah,
            commands::fetch_quran_verses,
            commands::download_audio,
            render::enqueue_render
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

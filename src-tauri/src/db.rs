use rusqlite::{Connection, Result};
use std::sync::Mutex;
use tauri::{App, Manager};

pub struct AppState {
    pub db: Mutex<Connection>,
}

pub fn init_db(app: &mut App) -> Result<Connection> {
    let app_dir = app.path().app_data_dir().expect("Failed to get app data dir");
    std::fs::create_dir_all(&app_dir).expect("Failed to create app data dir");
    
    let db_path = app_dir.join("murottal.db");
    let conn = Connection::open(db_path)?;

    // Setup schema
    conn.execute(
        "CREATE TABLE IF NOT EXISTS projects (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            settings TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS quran_cache (
            surah INTEGER,
            ayah INTEGER,
            arabic TEXT NOT NULL,
            translation TEXT NOT NULL,
            words_json TEXT,
            translation_en TEXT,
            PRIMARY KEY (surah, ayah)
        )",
        [],
    )?;

    Ok(conn)
}

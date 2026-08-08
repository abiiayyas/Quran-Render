use crate::db::AppState;
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Serialize, Deserialize)]
pub struct Project {
    pub id: String,
    pub name: String,
    pub settings: String,
    pub created_at: String,
}

#[tauri::command]
pub fn get_projects(state: State<'_, AppState>) -> Result<Vec<Project>, String> {
    let db = state.db.lock().unwrap();
    let mut stmt = db.prepare("SELECT id, name, settings, created_at FROM projects ORDER BY created_at DESC").map_err(|e| e.to_string())?;
    
    let projects_iter = stmt.query_map([], |row| {
        Ok(Project {
            id: row.get(0)?,
            name: row.get(1)?,
            settings: row.get(2)?,
            created_at: row.get(3)?,
        })
    }).map_err(|e| e.to_string())?;

    let mut projects = Vec::new();
    for p in projects_iter {
        projects.push(p.map_err(|e| e.to_string())?);
    }
    
    Ok(projects)
}

#[tauri::command]
pub fn save_project(state: State<'_, AppState>, id: String, name: String, settings: String) -> Result<(), String> {
    let db = state.db.lock().unwrap();
    db.execute(
        "INSERT INTO projects (id, name, settings) VALUES (?1, ?2, ?3)
         ON CONFLICT(id) DO UPDATE SET name=excluded.name, settings=excluded.settings",
        (&id, &name, &settings),
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[derive(Serialize, Deserialize, Clone)]
pub struct QuranWord {
    pub position: u32,
    pub arabic: String,
    pub start_ms: Option<u32>,
    pub end_ms: Option<u32>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct QuranAyah {
    pub surah: u32,
    pub ayah: u32,
    pub arabic: String,
    pub translation: String,
    pub words: Vec<QuranWord>,
}

#[tauri::command]
pub fn get_quran_ayah(state: State<'_, AppState>, surah: u32, ayah: u32) -> Result<Option<QuranAyah>, String> {
    let db = state.db.lock().unwrap();
    let mut stmt = db.prepare("SELECT arabic, translation, words_json FROM quran_cache WHERE surah = ?1 AND ayah = ?2").map_err(|e| e.to_string())?;
    let mut rows = stmt.query([surah, ayah]).map_err(|e| e.to_string())?;

    if let Some(row) = rows.next().map_err(|e| e.to_string())? {
        let words_str: Option<String> = row.get(2).unwrap_or(None);
        let words = if let Some(s) = words_str {
            serde_json::from_str(&s).unwrap_or_default()
        } else {
            Vec::new()
        };
        Ok(Some(QuranAyah {
            surah,
            ayah,
            arabic: row.get(0).map_err(|e| e.to_string())?,
            translation: row.get(1).map_err(|e| e.to_string())?,
            words,
        }))
    } else {
        Ok(None)
    }
}

#[tauri::command]
pub fn save_quran_ayah(state: State<'_, AppState>, ayah: QuranAyah) -> Result<(), String> {
    let db = state.db.lock().unwrap();
    let words_json = serde_json::to_string(&ayah.words).unwrap_or_default();
    db.execute(
        "INSERT OR REPLACE INTO quran_cache (surah, ayah, arabic, translation, words_json) VALUES (?1, ?2, ?3, ?4, ?5)",
        (ayah.surah, ayah.ayah, &ayah.arabic, &ayah.translation, &words_json),
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn fetch_quran_verses(state: State<'_, AppState>, surah: u32, ayat_start: u32, ayat_end: u32, reciter_id: u32) -> Result<Vec<QuranAyah>, String> {
    // Check cache first (skipping cache for now to ensure we get words)
    // We can re-enable cache later if words_json is populated

    #[derive(Deserialize)]
    struct TranslationObj {
        text: String,
    }
    #[derive(Deserialize)]
    struct AudioSegment {
        segments: Option<Vec<Vec<u32>>>, // [word_index, something, start_ms, end_ms]
    }
    #[derive(Deserialize)]
    struct WordObj {
        position: u32,
        code_v1: Option<String>, 
        text: Option<String>,
        text_uthmani: Option<String>,
    }
    #[derive(Deserialize)]
    struct VerseObj {
        verse_number: u32,
        text_uthmani: String,
        translations: Vec<TranslationObj>,
        words: Vec<WordObj>,
        audio: Option<AudioSegment>,
    }
    #[derive(Deserialize)]
    struct ApiResponse {
        verses: Vec<VerseObj>,
    }

    let mut fetched_results: Vec<QuranAyah> = Vec::new();
    
    // Attempt to add words_json column if missing (ignore error)
    {
        let db = state.db.lock().unwrap();
        let _ = db.execute("ALTER TABLE quran_cache ADD COLUMN words_json TEXT", []);
    }

    let start_page = (ayat_start.saturating_sub(1)) / 50 + 1;
    let end_page = (ayat_end.saturating_sub(1)) / 50 + 1;

    for page in start_page..=end_page {
        let url = format!("https://api.quran.com/api/v4/verses/by_chapter/{}?language=id&words=true&word_fields=text_uthmani&audio={}&translations=33&fields=text_uthmani&page={}&per_page=50", surah, reciter_id, page);
        let response = reqwest::get(&url).await.map_err(|e| e.to_string())?;
        
        let api_data: ApiResponse = response.json().await.map_err(|e| e.to_string())?;

        for v in api_data.verses {
        if v.verse_number < ayat_start || v.verse_number > ayat_end {
            continue;
        }

        let mut translation = v.translations.first().map(|t| t.text.clone()).unwrap_or_default();
        if let Some(idx) = translation.find("<sup") {
            translation.truncate(idx);
        }

        let mut words = Vec::new();
        let segments = v.audio.and_then(|a| a.segments).unwrap_or_default();

        for (i, w) in v.words.iter().enumerate() {
            let mut start_ms = None;
            let mut end_ms = None;
            
            // Segments are usually matched by index
            if i < segments.len() {
                let seg = &segments[i];
                if seg.len() >= 4 {
                    start_ms = Some(seg[2]);
                    end_ms = Some(seg[3]);
                }
            }

            let arabic_text = w.text_uthmani.clone()
                .or_else(|| w.text.clone())
                .or_else(|| w.code_v1.clone())
                .unwrap_or_default();

            words.push(QuranWord {
                position: w.position,
                arabic: arabic_text,
                start_ms,
                end_ms,
            });
        }

        let words_json = serde_json::to_string(&words).unwrap_or_default();

        // Save to cache
        {
            let db = state.db.lock().unwrap();
            let _ = db.execute(
                "INSERT OR REPLACE INTO quran_cache (surah, ayah, arabic, translation, words_json) VALUES (?1, ?2, ?3, ?4, ?5)",
                (surah, v.verse_number, &v.text_uthmani, &translation, &words_json),
            );
        }
        
            fetched_results.push(QuranAyah {
                surah,
                ayah: v.verse_number,
                arabic: v.text_uthmani.clone(),
                translation: translation.clone(),
                words,
            });
        }
    }

    Ok(fetched_results)
}

#[tauri::command]
pub async fn download_audio(url: String, filename: String) -> Result<String, String> {
    let temp_dir = std::env::temp_dir();
    let file_path = temp_dir.join(filename);
    
    // Check if it already exists (very basic caching)
    if file_path.exists() {
        return Ok(file_path.to_string_lossy().to_string());
    }

    let response = reqwest::get(&url).await.map_err(|e| e.to_string())?;
    
    if !response.status().is_success() {
        return Err(format!("Failed to download audio. Status: {}", response.status()));
    }
    
    let bytes = response.bytes().await.map_err(|e| e.to_string())?;
    std::fs::write(&file_path, bytes).map_err(|e| e.to_string())?;
    
    Ok(file_path.to_string_lossy().to_string())
}

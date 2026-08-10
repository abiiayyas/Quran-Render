use std::process::Command as ProcessCommand;
use serde::{Deserialize, Serialize};
use std::sync::mpsc::{self, Sender, Receiver};
use std::thread;
use tauri::Emitter;
use std::fs;
use base64::Engine;

#[derive(Serialize, Deserialize, Clone)]
pub struct OverlayFrame {
    pub base64: String,
    pub start_ms: u32,
    pub end_ms: u32,
    pub fade_in: Option<bool>,
    pub fade_out: Option<bool>,
}

#[derive(Serialize, Clone)]
pub struct RenderStatusEvent {
    pub job_id: String,
    pub status: String,
    pub progress: u8,
    pub error: Option<String>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct RenderJob {
    pub id: String,
    pub title: String,
    pub audio_paths: Vec<String>,
    pub bg_path: String,
    pub output_path: String,
    pub overlay_base64: Option<String>,
    pub overlay_sequence: Option<Vec<OverlayFrame>>,
    pub thumbnail_path: Option<String>,
    pub animation_style: Option<String>,
}

static mut WORKER_TX: Option<Sender<RenderJob>> = None;

pub fn init_background_worker(app: &mut tauri::App) {
    let (tx, rx): (Sender<RenderJob>, Receiver<RenderJob>) = mpsc::channel();
    
    unsafe {
        WORKER_TX = Some(tx);
    }
    
    let app_handle = app.handle().clone();
    
    thread::spawn(move || {
        loop {
            if let Ok(job) = rx.recv() {
                let _ = app_handle.emit("render-status", RenderStatusEvent {
                    job_id: job.id.clone(),
                    status: "processing".to_string(),
                    progress: 0,
                    error: None,
                });
                match execute_ffmpeg(&job) {
                    Ok(_) => {
                        let _ = app_handle.emit("render-status", RenderStatusEvent {
                            job_id: job.id.clone(),
                            status: "done".to_string(),
                            progress: 100,
                            error: None,
                        });
                    },
                    Err(e) => {
                        let _ = app_handle.emit("render-status", RenderStatusEvent {
                            job_id: job.id.clone(),
                            status: "error".to_string(),
                            progress: 0,
                            error: Some(e),
                        });
                    }
                }
            }
        }
    });
}

#[tauri::command]
#[allow(static_mut_refs)]
pub fn enqueue_render(app_handle: tauri::AppHandle, job: RenderJob) -> Result<String, String> {
    unsafe {
        if let Some(tx) = WORKER_TX.clone() {
            tx.send(job.clone()).map_err(|e| format!("Failed to enqueue job: {}", e))?;
            
            let _ = app_handle.emit("render-status", RenderStatusEvent {
                job_id: job.id.clone(),
                status: "pending".to_string(),
                progress: 0,
                error: None,
            });

            Ok(format!("Job {} added to queue", job.id))
        } else {
            Err("Worker not initialized".to_string())
        }
    }
}

fn get_ffmpeg_path() -> String {
    let paths = ["ffmpeg", "/opt/homebrew/bin/ffmpeg", "/usr/local/bin/ffmpeg"];
    for path in paths {
        if let Ok(_) = ProcessCommand::new(path).arg("-version").output() {
            return path.to_string();
        }
    }
    "ffmpeg".to_string()
}

fn execute_ffmpeg(job: &RenderJob) -> Result<(), String> {
    println!("Starting render job: {}", job.id);
    
    let temp_dir = std::env::temp_dir();
    
    let is_image = job.bg_path.to_lowercase().ends_with(".png") 
                || job.bg_path.to_lowercase().ends_with(".jpg") 
                || job.bg_path.to_lowercase().ends_with(".jpeg");
    let is_video = job.bg_path.to_lowercase().ends_with(".mp4") 
                || job.bg_path.to_lowercase().ends_with(".mov") 
                || job.bg_path.to_lowercase().ends_with(".webm");

    let mut args = vec!["-y".to_string()];
    
    if is_image {
        args.push("-loop".to_string());
        args.push("1".to_string());
    } else if is_video {
        args.push("-stream_loop".to_string());
        args.push("-1".to_string());
    }
    
    args.push("-i".to_string());
    args.push(job.bg_path.clone());
    
    for audio_path in &job.audio_paths {
        args.push("-i".to_string());
        args.push(audio_path.clone());
    }

    let mut filter_complex = String::new();
    let audio_map = if job.audio_paths.len() > 1 {
        for i in 0..job.audio_paths.len() {
            filter_complex.push_str(&format!("[{}:a]", i + 1));
        }
        filter_complex.push_str(&format!("concat=n={}:v=0:a=1[outa];", job.audio_paths.len()));
        "[outa]".to_string()
    } else {
        "1:a".to_string()
    };

    filter_complex.push_str("[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920[bg];");
    let mut current_bg = "bg".to_string();
    let mut temp_paths = Vec::new();

    if let Some(ref seq) = job.overlay_sequence {
        for (i, frame) in seq.iter().enumerate() {
            let temp_overlay_path = temp_dir.join(format!("{}_overlay_{}.png", job.id, i));
            let decoded = base64::engine::general_purpose::STANDARD.decode(&frame.base64).map_err(|e| format!("Base64 decode error: {}", e))?;
            fs::write(&temp_overlay_path, decoded).map_err(|e| format!("Failed to write temp overlay: {}", e))?;
            temp_paths.push(temp_overlay_path.clone());
            
            let start_sec = frame.start_ms as f32 / 1000.0;
            let end_sec = frame.end_ms as f32 / 1000.0;
            
            let do_fade_in = job.animation_style.as_deref() == Some("fade") && frame.fade_in.unwrap_or(true);
            let do_fade_out = job.animation_style.as_deref() == Some("fade") && frame.fade_out.unwrap_or(true);
            
            let input_index = 1 + job.audio_paths.len() + i;
            args.push("-i".to_string());
            args.push(temp_overlay_path.to_str().unwrap().to_string());

            let out_node = format!("v{}", i);

            if do_fade_in || do_fade_out {
                let fade_out_start = (end_sec - 0.5).max(start_sec);
                let mut filter = format!("[{}:v]loop=-1:1:0,setpts=N/25/TB,format=yuva420p", input_index);
                if do_fade_in {
                    filter.push_str(&format!(",fade=t=in:st={}:d=0.5:alpha=1", start_sec));
                }
                if do_fade_out {
                    filter.push_str(&format!(",fade=t=out:st={}:d=0.5:alpha=1", fade_out_start));
                }
                filter.push_str(&format!("[v{}_faded];", i));
                
                filter_complex.push_str(&filter);
                filter_complex.push_str(&format!(
                    "[{}][v{}_faded]overlay=0:0:enable='between(t,{},{})'[{}]",
                    current_bg, i, start_sec, end_sec, out_node
                ));
            } else {
                filter_complex.push_str(&format!(
                    "[{}][{}:v]overlay=0:0:enable='between(t,{},{})'[{}]",
                    current_bg, input_index, start_sec, end_sec, out_node
                ));
            }

            if i < seq.len() - 1 {
                filter_complex.push_str(";");
            }
            current_bg = out_node;
        }
    } else if let Some(ref b64) = job.overlay_base64 {
        let temp_overlay_path = temp_dir.join(format!("{}_overlay.png", job.id));
        let decoded = base64::engine::general_purpose::STANDARD.decode(b64).map_err(|e| format!("Base64 decode error: {}", e))?;
        fs::write(&temp_overlay_path, decoded).map_err(|e| format!("Failed to write temp overlay: {}", e))?;
        temp_paths.push(temp_overlay_path.clone());

        args.push("-i".to_string());
        args.push(temp_overlay_path.to_str().unwrap().to_string());
        
        let overlay_idx = 1 + job.audio_paths.len();
        filter_complex.push_str(&format!("[{}][{}:v]overlay=0:0[vfinal]", current_bg, overlay_idx));
        current_bg = "vfinal".to_string();
    } else {
        return Err("No overlay provided".to_string());
    }

    args.push("-filter_complex".to_string());
    args.push(filter_complex);
    args.push("-map".to_string());
    args.push(format!("[{}]", current_bg));
    args.push("-map".to_string());
    args.push(audio_map);
    args.push("-c:v".to_string());
    args.push("libx264".to_string());
    args.push("-c:a".to_string());
    args.push("aac".to_string());
    args.push("-shortest".to_string());

    let temp_output = temp_dir.join(format!("{}_temp.mp4", job.id));
    if job.thumbnail_path.is_some() {
        args.push(temp_output.to_str().unwrap().to_string());
    } else {
        args.push(job.output_path.clone());
    }

    let status = ProcessCommand::new(get_ffmpeg_path()).args(&args).status();
        
    if let Some(ref thumb) = job.thumbnail_path {
        if status.as_ref().map(|s| s.success()).unwrap_or(false) {
            println!("Embedding thumbnail: {}", thumb);
            let thumb_status = ProcessCommand::new(get_ffmpeg_path())
                .args([
                    "-y",
                    "-i", temp_output.to_str().unwrap(),
                    "-i", thumb,
                    "-map", "0",
                    "-map", "1",
                    "-c", "copy",
                    "-disposition:v:1", "attached_pic",
                    &job.output_path
                ])
                .status();
            let _ = fs::remove_file(&temp_output);
            if !thumb_status.as_ref().map(|s| s.success()).unwrap_or(false) {
                println!("Thumbnail embedding failed");
            }
        }
    }

    for path in temp_paths {
        let _ = fs::remove_file(&path);
    }
        
    match status {
        Ok(s) if s.success() => Ok(()),
        Ok(s) => Err(format!("Render failed with exit code: {}", s)),
        Err(e) => Err(format!("Failed to start FFmpeg: {}", e)),
    }
}

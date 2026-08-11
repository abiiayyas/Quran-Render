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
    pub orientation: Option<String>,
    pub duration: Option<u32>,
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
                match execute_ffmpeg(&job, &app_handle) {
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

// Run ffmpeg with a hard timeout so a stuck filtergraph can never hang the
// render thread forever. Reads `-progress` key/value output from stdout and
// calls `on_progress` with a 0-100 percentage. Returns (success, stderr-tails).
fn run_ffmpeg_with_timeout(
    bin: &str,
    args: &[String],
    total_ms: u64,
    on_progress: std::sync::Arc<dyn Fn(u8) + Send + Sync>,
) -> Result<(bool, String), String> {
    let max_secs = 30 * 60;
    let sleep = std::time::Duration::from_millis(500);
    let mut child = ProcessCommand::new(bin)
        .args(args)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("FFmpeg spawn error: {}", e))?;

    // Pump stdout (`-progress pipe:1`) while ffmpeg runs.
    let stdout = std::mem::take(&mut child.stdout);
    let total_ms = total_ms.max(1);
    let filter_thread = thread::spawn(move || {
        use std::io::BufRead;
        if let Some(mut s) = stdout {
            let mut reader = std::io::BufReader::new(&mut s);
            let mut buf = String::new();
            while reader.read_line(&mut buf).is_ok() {
                if buf.is_empty() { break; }
                let kvs: Vec<&str> = buf.split('=').collect();
                if kvs.len() == 2 && kvs[0] == "out_time_ms" {
                    if let Ok(ms) = kvs[1].trim().parse::<u64>() {
                        let pct = ((ms as f64 / total_ms as f64) * 100.0).min(99.0) as u8;
                        if pct > progress_state() {
                            set_progress_state(pct);
                            on_progress(pct);
                        }
                    }
                }
                buf.clear();
            }
        }
    });

    let wait_until = std::time::Instant::now() + std::time::Duration::from_secs(max_secs);
    loop {
        if let Some(status) = child.try_wait().map_err(|e| format!("wait error: {}", e))? {
            let _ = filter_thread.join();
            let stderr = read_child_stderr(&mut child);
            return Ok((status.success(), stderr));
        }
        if std::time::Instant::now() > wait_until {
            let _ = child.kill();
            let _ = child.wait();
            let _ = filter_thread.join();
            return Err("FFmpeg timed out after 30 minutes (filtergraph likely stalled)".to_string());
        }
        std::thread::sleep(sleep);
    }
}

// Keep last emitted progress so we only emit when it actually increases.
fn progress_state() -> u8 {
    static LAST: std::sync::atomic::AtomicU8 = std::sync::atomic::AtomicU8::new(0);
    LAST.load(std::sync::atomic::Ordering::Relaxed)
}
fn set_progress_state(v: u8) {
    static LAST: std::sync::atomic::AtomicU8 = std::sync::atomic::AtomicU8::new(0);
    LAST.store(v, std::sync::atomic::Ordering::Relaxed);
}

fn read_child_stderr(child: &mut std::process::Child) -> String {
    use std::io::Read;
    if let Some(ref mut stderr) = child.stderr {
        let mut buf = Vec::new();
        let _ = stderr.take(8192).read_to_end(&mut buf);
        return String::from_utf8_lossy(&buf).to_string();
    }
    String::new()
}

// Total duration of an audio file in ms, parsed from ffprobe. Falls back to 0
// (contributes nothing) on any failure.
fn probe_audio_duration_ms(path: &str) -> u64 {
    let out = match ProcessCommand::new("ffprobe")
        .args(["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path])
        .output()
    {
        Ok(o) if o.status.success() => o,
        _ => return 0,
    };
    String::from_utf8_lossy(&out.stdout)
        .trim()
        .parse::<f64>()
        .map(|s| (s * 1000.0) as u64)
        .unwrap_or(0)
}

fn execute_ffmpeg(job: &RenderJob, app_handle: &tauri::AppHandle) -> Result<(), String> {
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
    // Audio inputs start at index 1 (index 0 is the background image/video).
    let has_audio = !job.audio_paths.is_empty();
    let audio_map = if job.audio_paths.len() > 1 {
        for i in 0..job.audio_paths.len() {
            filter_complex.push_str(&format!("[{}:a]", i + 1));
        }
        filter_complex.push_str(&format!("concat=n={}:v=0:a=1[outa];", job.audio_paths.len()));
        "[outa]".to_string()
    } else if has_audio {
        "1:a".to_string()
    } else {
        // No audio at all.
        String::new()
    };

    if job.orientation.as_deref() == Some("landscape") {
        filter_complex.push_str("[0:v]scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,fps=25,setsar=1,format=yuv420p[bg];");
    } else {
        filter_complex.push_str("[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=25,setsar=1,format=yuv420p[bg];");
    }
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

            let mut filter = format!("[{}:v]loop=-1:1:0,setpts=N/25/TB,format=yuva420p", input_index);
            
            if do_fade_in || do_fade_out {
                let fade_out_start = (end_sec - 0.5).max(start_sec);
                if do_fade_in {
                    filter.push_str(&format!(",fade=t=in:st={}:d=0.5:alpha=1", start_sec));
                }
                if do_fade_out {
                    filter.push_str(&format!(",fade=t=out:st={}:d=0.5:alpha=1", fade_out_start));
                }
            }
            filter.push_str(&format!("[v{}_processed];", i));
            
            filter_complex.push_str(&filter);
            filter_complex.push_str(&format!(
                "[{}][v{}_processed]overlay=0:0:enable='between(t,{},{})'[{}]",
                current_bg, i, start_sec, end_sec, out_node
            ));

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
        filter_complex.push_str(&format!("[{}:v]loop=-1:1:0,setpts=N/25/TB,format=yuva420p[v_overlay];", overlay_idx));
        filter_complex.push_str(&format!("[{}][v_overlay]overlay=0:0:shortest=1[vfinal]", current_bg));
        current_bg = "vfinal".to_string();
    } else {
        return Err("No overlay provided".to_string());
    }

    args.push("-filter_complex".to_string());
    args.push(filter_complex);
    args.push("-loglevel".to_string());
    args.push("error".to_string());
    args.push("-map".to_string());
    args.push(format!("[{}]", current_bg));
    if has_audio {
        args.push("-map".to_string());
        args.push(audio_map);
    }
    args.push("-c:v".to_string());
    args.push("libx264".to_string());
    if has_audio {
        args.push("-c:a".to_string());
        args.push("aac".to_string());
    }
    // Always cut with -t (never -shortest). With infinite video sources
    // (looped bg + looped overlays), -shortest is unreliable at flushing the
    // muxer and the render hangs near the end. Compute total audio length.
    let total_ms: u64 = job.audio_paths.iter().map(|p| probe_audio_duration_ms(p)).sum();
    let explicit = job.duration.unwrap_or((total_ms as f32 / 1000.0).ceil().max(1.0) as u32);
    args.push("-t".to_string());
    args.push(explicit.to_string());

    args.push("-progress".to_string());
    args.push("pipe:1".to_string());

    let temp_output = temp_dir.join(format!("{}_temp.mp4", job.id));
    if job.thumbnail_path.is_some() {
        args.push(temp_output.to_str().unwrap().to_string());
    } else {
        args.push(job.output_path.clone());
    }

    let job_id = job.id.clone();
    let app = app_handle.clone();
    let prog_cb: std::sync::Arc<dyn Fn(u8) + Send + Sync> = std::sync::Arc::new(move |pct| {
        let _ = app.emit("render-status", RenderStatusEvent {
            job_id: job_id.clone(),
            status: "processing".to_string(),
            progress: pct,
            error: None,
        });
    });
    let status = run_ffmpeg_with_timeout(&get_ffmpeg_path(), &args, total_ms, prog_cb);

    if let Some(ref thumb) = job.thumbnail_path {
        if status.as_ref().map(|s| s.0).unwrap_or(false) {
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
        Ok(s) if s.0 => Ok(()),
        Ok(s) => Err(format!("Render failed: {}", s.1.trim())),
        Err(e) => Err(format!("Failed to start FFmpeg: {}", e)),
    }
}

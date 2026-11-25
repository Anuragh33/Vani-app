#[cfg(target_os = "macos")]
use anyhow::{anyhow, Result};
#[cfg(not(target_os = "macos"))]
use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
#[cfg(target_os = "macos")]
use std::io::{BufRead, BufReader, Write};
#[cfg(target_os = "macos")]
use std::path::PathBuf;
#[cfg(target_os = "macos")]
use std::process::{Child, ChildStdin, Command, Stdio};
#[cfg(target_os = "macos")]
use std::sync::{Arc, Mutex};
#[cfg(target_os = "macos")]
use tauri::{AppHandle, Emitter, Manager};
#[cfg(not(target_os = "macos"))]
use tauri::AppHandle;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppleAiStatus {
    pub foundation_model_available: bool,
    pub foundation_model_reason: String,
    pub speech_analyzer_available: bool,
    pub mic_permission: String,
    pub speech_permission: String,
    pub macos_version: String,
    pub helper_found: bool,
}

impl Default for AppleAiStatus {
    fn default() -> Self {
        Self {
            foundation_model_available: false,
            foundation_model_reason: "Apple Intelligence helper not found".into(),
            speech_analyzer_available: false,
            mic_permission: "unknown".into(),
            speech_permission: "unknown".into(),
            macos_version: String::new(),
            helper_found: false,
        }
    }
}

#[cfg(target_os = "macos")]
pub struct ActiveNativeRecording {
    child: Child,
    stdin: Option<ChildStdin>,
    wav_path: PathBuf,
    stats: Arc<Mutex<(usize, f32)>>,
}

#[cfg(target_os = "macos")]
pub fn start_native_recording(app: &AppHandle) -> Result<ActiveNativeRecording> {
    let bin = resolve_helper_path(app).ok_or_else(|| anyhow!("Apple AI audio helper not found"))?;
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let wav_path = std::env::temp_dir().join(format!("vani_native_rec_{}.wav", ts));
    let wav_str = wav_path.to_string_lossy().to_string();

    let mut child = Command::new(bin)
        .args(["record", "--out", &wav_str])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()?;

    let stdin = child.stdin.take();
    let stdout = child.stdout.take().ok_or_else(|| anyhow!("No stdout on recorder"))?;
    let app_clone = app.clone();
    let stats = Arc::new(Mutex::new((0usize, 0.0f32)));
    let stats_clone = Arc::clone(&stats);

    let (ready_tx, ready_rx) = std::sync::mpsc::channel::<Result<()>>();

    std::thread::spawn(move || {
        let reader = BufReader::new(stdout);
        let mut signaled = false;
        for line in reader.lines().map_while(Result::ok) {
            if line == "READY" {
                if !signaled {
                    let _ = ready_tx.send(Ok(()));
                    signaled = true;
                }
            } else if let Some(rest) = line.strip_prefix("LEVEL ") {
                if let Ok(level) = rest.trim().parse::<f32>() {
                    let _ = app_clone.emit("native-audio-level", level);
                }
            } else if let Some(rest) = line.strip_prefix("DONE ") {
                let mut parts = rest.split_whitespace();
                let samples = parts.next().and_then(|s| s.parse::<usize>().ok()).unwrap_or(0);
                let peak = parts.next().and_then(|s| s.parse::<f32>().ok()).unwrap_or(0.0);
                if let Ok(mut g) = stats_clone.lock() {
                    *g = (samples, peak);
                }
            }
        }
        if !signaled {
            let _ = ready_tx.send(Err(anyhow!("Recorder exited before ready")));
        }
    });

    match ready_rx.recv_timeout(std::time::Duration::from_secs(6)) {
        Ok(Ok(())) => Ok(ActiveNativeRecording {
            child,
            stdin,
            wav_path,
            stats,
        }),
        Ok(Err(_)) | Err(_) => {
            let _ = child.kill();
            let err_msg = child
                .wait_with_output()
                .map(|o| String::from_utf8_lossy(&o.stderr).trim().to_string())
                .unwrap_or_default();
            let _ = std::fs::remove_file(&wav_path);
            if err_msg.is_empty() {
                Err(anyhow!("Could not start microphone capture. Check System Settings -> Privacy & Security -> Microphone for VANI."))
            } else {
                Err(anyhow!("{}", err_msg))
            }
        }
    }
}

#[cfg(target_os = "macos")]
pub fn stop_native_recording(mut rec: ActiveNativeRecording) -> Result<(PathBuf, usize, f32)> {
    if let Some(mut stdin) = rec.stdin.take() {
        let _ = stdin.write_all(b"STOP\n");
        let _ = stdin.flush();
    }
    let _ = rec.child.wait();
    let (samples, peak) = rec.stats.lock().map(|g| *g).unwrap_or((0, 0.0));
    Ok((rec.wav_path, samples, peak))
}

#[cfg(target_os = "macos")]
pub fn cancel_native_recording(mut rec: ActiveNativeRecording) {
    let _ = rec.child.kill();
    let _ = rec.child.wait();
    let _ = std::fs::remove_file(&rec.wav_path);
}

#[cfg(target_os = "macos")]
pub fn resolve_helper_path(app: &AppHandle) -> Option<PathBuf> {
    let mut candidates: Vec<PathBuf> = Vec::new();

    if let Ok(res_dir) = app.path().resource_dir() {
        candidates.push(res_dir.join("bin").join("vani-apple-ai"));
        candidates.push(res_dir.join("vani-apple-ai"));
    }

    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            candidates.push(dir.join("vani-apple-ai"));
            candidates.push(dir.join("../Resources/bin/vani-apple-ai"));
            candidates.push(dir.join("../Resources/vani-apple-ai"));
        }
    }

    // Dev fallback inside workspace
    candidates.push(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("bin/vani-apple-ai"));

    candidates.into_iter().find(|p| p.exists())
}

pub fn check_status(app: &AppHandle) -> AppleAiStatus {
    #[cfg(not(target_os = "macos"))]
    {
        let _ = app;
        return AppleAiStatus {
            foundation_model_reason: "Not available on this operating system".into(),
            ..AppleAiStatus::default()
        };
    }

    #[cfg(target_os = "macos")]
    {
        let Some(bin) = resolve_helper_path(app) else {
            return AppleAiStatus::default();
        };

        let output = Command::new(bin).arg("status").output();
        let Ok(out) = output else {
            return AppleAiStatus::default();
        };
        if !out.status.success() {
            return AppleAiStatus::default();
        }

        let raw = String::from_utf8_lossy(&out.stdout);
        let parsed: serde_json::Value = serde_json::from_str(raw.trim()).unwrap_or_default();
        AppleAiStatus {
            foundation_model_available: parsed["foundationModelAvailable"].as_bool().unwrap_or(false),
            foundation_model_reason: parsed["foundationModelReason"]
                .as_str()
                .unwrap_or("unknown")
                .to_string(),
            speech_analyzer_available: parsed["speechAnalyzerAvailable"].as_bool().unwrap_or(false),
            mic_permission: parsed["micPermission"].as_str().unwrap_or("unknown").to_string(),
            speech_permission: parsed["speechPermission"].as_str().unwrap_or("unknown").to_string(),
            macos_version: parsed["macosVersion"].as_str().unwrap_or("").to_string(),
            helper_found: true,
        }
    }
}

pub async fn polish_on_device(app: &AppHandle, text: &str, context: &str) -> Result<String> {
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (app, text, context);
        return Err(anyhow!("Apple Foundation Model is only available on macOS"));
    }

    #[cfg(target_os = "macos")]
    {
        let bin = resolve_helper_path(app).ok_or_else(|| anyhow!("Apple AI helper not found"))?;
        let input = text.to_string();
        let ctx = context.to_string();

        tokio::task::spawn_blocking(move || -> Result<String> {
            let mut child = Command::new(bin)
                .args(["polish", "--context", &ctx])
                .stdin(Stdio::piped())
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .spawn()?;

            if let Some(mut stdin) = child.stdin.take() {
                stdin.write_all(input.as_bytes())?;
            }

            let output = child.wait_with_output()?;
            if !output.status.success() {
                let err = String::from_utf8_lossy(&output.stderr).trim().to_string();
                return Err(anyhow!("Apple Foundation Model failed: {}", err));
            }

            let cleaned = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if cleaned.is_empty() {
                Ok(input)
            } else {
                Ok(cleaned)
            }
        })
        .await?
    }
}

pub async fn transcribe_wav_on_device(
    app: &AppHandle,
    wav_bytes: &[u8],
    language: &str,
    vocab: &str,
) -> Result<String> {
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (app, wav_bytes, language, vocab);
        return Err(anyhow!("Apple SpeechAnalyzer is only available on macOS"));
    }

    #[cfg(target_os = "macos")]
    {
        let bin = resolve_helper_path(app).ok_or_else(|| anyhow!("Apple AI helper not found"))?;
        let bytes = wav_bytes.to_vec();
        let lang = language.to_string();
        let vocab_csv = vocab.to_string();

        tokio::task::spawn_blocking(move || -> Result<String> {
            let ts = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_nanos();
            let tmp_wav = std::env::temp_dir().join(format!("vani_apple_stt_{}.wav", ts));
            std::fs::write(&tmp_wav, &bytes)?;

            let wav_str = tmp_wav.to_string_lossy().to_string();
            let output = Command::new(bin)
                .args([
                    "transcribe",
                    "--wav",
                    &wav_str,
                    "--language",
                    &lang,
                    "--vocab",
                    &vocab_csv,
                ])
                .output();

            let _ = std::fs::remove_file(&tmp_wav);

            let output = output?;
            if !output.status.success() {
                let err = String::from_utf8_lossy(&output.stderr).trim().to_string();
                return Err(anyhow!("Apple SpeechAnalyzer failed: {}", err));
            }
            Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
        })
        .await?
    }
}

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, State};

use crate::apple_ai;
use crate::cleanup;
use crate::config::{HistoryEntry, Note, Settings, Store};
use crate::models;
use crate::transcribe::{self, SharedEngine};

#[cfg(target_os = "macos")]
pub type PlatformRecording = crate::apple_ai::ActiveNativeRecording;
#[cfg(target_os = "windows")]
pub type PlatformRecording = crate::win_audio::ActiveNativeRecording;
#[cfg(not(any(target_os = "macos", target_os = "windows")))]
pub type PlatformRecording = ();

pub struct AppState {
    pub store: Arc<Mutex<Store>>,
    pub engine: SharedEngine,
    pub active_downloads: Arc<Mutex<HashMap<String, tokio::task::AbortHandle>>>,
    pub app_data_dir: PathBuf,
    pub dictation_active: Arc<Mutex<bool>>,
    pub hands_free_active: Arc<Mutex<bool>>,
    pub frontmost_app: Arc<Mutex<Option<String>>>,
    pub native_recording: Arc<Mutex<Option<PlatformRecording>>>,
}

#[tauri::command]
pub async fn get_system_info(app: AppHandle) -> Result<serde_json::Value, String> {
    let os = std::env::consts::OS;
    let arch = std::env::consts::ARCH;
    let is_mac = cfg!(target_os = "macos");
    let is_windows = cfg!(target_os = "windows");
    let apple_ai_supported = if is_mac {
        let status = apple_ai::check_status(&app);
        status.helper_found && (status.speech_analyzer_available || status.foundation_model_available)
    } else {
        false
    };

    Ok(serde_json::json!({
        "os": os,
        "arch": arch,
        "isMac": is_mac,
        "isWindows": is_windows,
        "appleAiSupported": apple_ai_supported,
        "pushToTalkKey": if is_mac { "⌥ Option" } else { "Right Alt" },
        "handsFreeKey": if is_mac { "⌥ + ⌘" } else { "Right Alt + Ctrl" },
        "modifierSymbol": if is_mac { "⌘" } else { "Ctrl+" },
        "dashboardHotkey": if is_mac { "⌘⇧D" } else { "Ctrl+Shift+D" },
        "dictateHotkey": if is_mac { "⌘⇧Space" } else { "Ctrl+Shift+Space" },
        "osName": if is_mac { "macOS" } else if is_windows { "Windows" } else { "Linux" },
        "fileManagerName": if is_mac { "Finder" } else if is_windows { "Explorer" } else { "Files" },
        "gpuBackend": if is_mac { "Metal GPU + Neural Engine" } else { "CPU + ONNX Runtime" }
    }))
}

fn now_iso() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;
    // Format as ISO 8601 so JS `new Date(timestamp)` parses correctly
    let secs = ms / 1000;
    let ms_part = ms % 1000;
    let s = secs % 60;
    let m = (secs / 60) % 60;
    let h = (secs / 3600) % 24;
    let days = secs / 86400;
    // Days since Unix epoch (1970-01-01) → calendar date
    let (year, month, day) = days_to_ymd(days);
    format!("{:04}-{:02}-{:02}T{:02}:{:02}:{:02}.{:03}Z", year, month, day, h, m, s, ms_part)
}

fn days_to_ymd(days: u64) -> (u64, u64, u64) {
    // Gregorian calendar calculation from Julian Day Number
    let z = days + 719468;
    let era = z / 146097;
    let doe = z - era * 146097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    (y, m, d)
}

fn unique_id() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .to_string()
}

#[tauri::command]
pub async fn get_settings(state: State<'_, AppState>) -> Result<Settings, String> {
    let store = state.store.lock().map_err(|e| e.to_string())?;
    Ok(store.settings().clone())
}

#[tauri::command]
pub async fn save_settings(
    state: State<'_, AppState>,
    app: AppHandle,
    settings: serde_json::Value,
) -> Result<Settings, String> {
    let next = {
        let mut store = state.store.lock().map_err(|e| e.to_string())?;
        store.update_settings(settings).map_err(|e| e.to_string())?
    };

    // Update the real macOS menu bar tray icon immediately when trayIconStyle changes
    let is_recording = state.dictation_active.lock().map(|g| *g).unwrap_or(false);
    crate::tray_icons::apply_tray_style(&app, &next.tray_icon_style, is_recording);

    // Broadcast to all windows
    let _ = app.emit("settings-updated", &next);
    Ok(next)
}

#[tauri::command]
pub async fn start_native_recording(
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<serde_json::Value, String> {
    // Cancel any leftover recorder first
    if let Ok(mut guard) = state.native_recording.lock() {
        if let Some(prev) = guard.take() {
            #[cfg(target_os = "macos")]
            apple_ai::cancel_native_recording(prev);
            #[cfg(target_os = "windows")]
            crate::win_audio::cancel_native_recording(prev);
            #[cfg(not(any(target_os = "macos", target_os = "windows")))]
            let _ = prev;
        }
    }

    #[cfg(target_os = "macos")]
    {
        let app_clone = app.clone();
        let rec = tokio::task::spawn_blocking(move || apple_ai::start_native_recording(&app_clone))
            .await
            .map_err(|e| e.to_string())?
            .map_err(|e| e.to_string())?;
        let mut guard = state.native_recording.lock().map_err(|e| e.to_string())?;
        *guard = Some(rec);
        return Ok(serde_json::json!({ "ok": true }));
    }

    #[cfg(target_os = "windows")]
    {
        let app_clone = app.clone();
        let rec = tokio::task::spawn_blocking(move || crate::win_audio::start_native_recording(&app_clone))
            .await
            .map_err(|e| e.to_string())?
            .map_err(|e| e.to_string())?;
        let mut guard = state.native_recording.lock().map_err(|e| e.to_string())?;
        *guard = Some(rec);
        return Ok(serde_json::json!({ "ok": true }));
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let _ = (state, app);
        Err("Native recording is not supported on this platform".into())
    }
}

#[tauri::command]
pub async fn stop_native_recording(
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let rec = {
        let mut guard = state.native_recording.lock().map_err(|e| e.to_string())?;
        guard.take()
    };
    let Some(rec) = rec else {
        return Ok(serde_json::json!({ "ok": false, "error": "No active recording." }));
    };

    #[cfg(target_os = "macos")]
    let (wav_path, samples, peak) =
        tokio::task::spawn_blocking(move || apple_ai::stop_native_recording(rec))
            .await
            .map_err(|e| e.to_string())?
            .map_err(|e| e.to_string())?;

    #[cfg(target_os = "windows")]
    let (wav_path, samples, peak) =
        tokio::task::spawn_blocking(move || crate::win_audio::stop_native_recording(rec))
            .await
            .map_err(|e| e.to_string())?
            .map_err(|e| e.to_string())?;

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let _ = rec;
        return Err("Native recording is not supported on this platform".into());
    }

    #[cfg(any(target_os = "macos", target_os = "windows"))]
    Ok(serde_json::json!({
        "ok": true,
        "wavPath": wav_path.to_string_lossy(),
        "samples": samples,
        "peak": peak
    }))
}

#[tauri::command]
pub async fn cancel_native_recording(state: State<'_, AppState>) -> Result<(), String> {
    let rec = {
        let mut guard = state.native_recording.lock().map_err(|e| e.to_string())?;
        guard.take()
    };
    if let Some(rec) = rec {
        #[cfg(target_os = "macos")]
        tokio::task::spawn_blocking(move || apple_ai::cancel_native_recording(rec))
            .await
            .ok();
        #[cfg(target_os = "windows")]
        tokio::task::spawn_blocking(move || crate::win_audio::cancel_native_recording(rec))
            .await
            .ok();
        #[cfg(not(any(target_os = "macos", target_os = "windows")))]
        let _ = rec;
    }
    Ok(())
}

#[tauri::command]
pub async fn dictation_complete(
    state: State<'_, AppState>,
    app: AppHandle,
    wav_buffer: Option<Vec<u8>>,
    wav_path: Option<String>,
    allow_actions: Option<bool>,
    hands_free: Option<bool>,
) -> Result<serde_json::Value, String> {
    let is_hands_free = hands_free.unwrap_or_else(|| {
        state.hands_free_active.lock().map(|g| *g).unwrap_or(false)
    });
    if !is_hands_free {
        let mut active = state.dictation_active.lock().map_err(|e| e.to_string())?;
        *active = false;
    }

    let wav_buffer = if let Some(path_str) = wav_path {
        let bytes = std::fs::read(&path_str).map_err(|e| format!("Failed to read recorded audio: {}", e))?;
        let _ = std::fs::remove_file(&path_str);
        bytes
    } else {
        wav_buffer.unwrap_or_default()
    };

    if wav_buffer.len() <= 44 {
        let hint = if cfg!(target_os = "macos") {
            "No audio captured. Check System Settings → Privacy & Security → Microphone for VANI."
        } else {
            "No audio captured. Check Windows Settings → Privacy & security → Microphone for VANI."
        };
        return Ok(serde_json::json!({
            "ok": false,
            "error": hint
        }));
    }

    let settings = {
        let store = state.store.lock().map_err(|e| e.to_string())?;
        store.settings().clone()
    };
    let privacy_mode = settings.privacy_mode;

    // 1. Transcription (Apple On-Device SpeechAnalyzer | Open-Source Local Whisper/Parakeet | OpenAI Cloud)
    let (raw_text, used_fallback, provider_label) = {
        let use_cloud = settings.transcription_provider == "openai"
            && !settings.openai_key.is_empty()
            && !privacy_mode;

        if use_cloud {
            let text = cleanup::transcribe_with_openai(&wav_buffer, &settings.language, &settings.openai_key)
                .await
                .map_err(|e| e.to_string())?;
            (text, false, "openai:whisper-1".to_string())
        } else if cfg!(target_os = "macos") && settings.transcription_provider == "apple" {
            match apple_ai::transcribe_wav_on_device(
                &app,
                &wav_buffer,
                &settings.language,
                &settings.custom_vocabulary,
            )
            .await
            {
                Ok(text) => (text, false, "apple:speech-analyzer".to_string()),
                Err(apple_err) => {
                    // Graceful fallback to installed open-source local model if Apple STT fails
                    let model_path = models::model_path(&state.app_data_dir, &settings.whisper_model);
                    if models::model_installed(&state.app_data_dir, &settings.whisper_model) {
                        transcribe::ensure_engine(&state.engine, &model_path, &settings.whisper_model)
                            .map_err(|e| e.to_string())?;
                        let samples = transcribe::wav_to_samples(&wav_buffer).map_err(|e| e.to_string())?;
                        let engine_guard = state.engine.lock().map_err(|e| e.to_string())?;
                        let engine = engine_guard.as_ref().ok_or("Engine not loaded")?;
                        let text = engine
                            .transcribe(
                                &samples,
                                &settings.language,
                                settings.threads,
                                settings.translate,
                                &settings.custom_vocabulary,
                            )
                            .map_err(|e| e.to_string())?;
                        (text, true, format!("apple->whisper-rs:{}", settings.whisper_model))
                    } else {
                        return Ok(serde_json::json!({
                            "ok": false,
                            "error": format!("Apple Speech failed ({}). Switch to an open-source model in Models or grant Speech Recognition permission.", apple_err)
                        }));
                    }
                }
            }
        } else {
            // Open-source local: whisper-rs (Metal GPU) or Parakeet ONNX
            let model_path = models::model_path(&state.app_data_dir, &settings.whisper_model);
            if !models::model_installed(&state.app_data_dir, &settings.whisper_model) {
                let err_msg = if cfg!(target_os = "macos") {
                    format!("Model {} is not downloaded. Open Speech Models and download it, or switch to Apple On-Device Speech.", settings.whisper_model)
                } else {
                    format!("Model {} is not downloaded yet. Open Speech Models and download a local model to start dictating.", settings.whisper_model)
                };
                return Ok(serde_json::json!({
                    "ok": false,
                    "error": err_msg
                }));
            }

            transcribe::ensure_engine(&state.engine, &model_path, &settings.whisper_model)
                .map_err(|e| e.to_string())?;

            let samples = transcribe::wav_to_samples(&wav_buffer).map_err(|e| e.to_string())?;

            let result = {
                let engine_guard = state.engine.lock().map_err(|e| e.to_string())?;
                let engine = engine_guard.as_ref().ok_or("Engine not loaded")?;
                engine.transcribe(
                    &samples,
                    &settings.language,
                    settings.threads,
                    settings.translate,
                    &settings.custom_vocabulary,
                )
            };

            match result {
                Ok(text) => {
                    let prefix = if models::is_parakeet(&settings.whisper_model) {
                        "parakeet-onnx"
                    } else if cfg!(target_os = "macos") {
                        "whisper-rs-metal"
                    } else {
                        "whisper-rs"
                    };
                    let label = format!("{}:{}", prefix, settings.whisper_model);
                    (text, false, label)
                }
                Err(local_err) => {
                    if !settings.openai_key.is_empty() && !privacy_mode {
                        let text = cleanup::transcribe_with_openai(
                            &wav_buffer,
                            &settings.language,
                            &settings.openai_key,
                        )
                        .await
                        .map_err(|e| e.to_string())?;
                        (text, true, "whisper-rs->openai:whisper-1".to_string())
                    } else {
                        return Err(local_err.to_string());
                    }
                }
            }
        }
    };

    if raw_text.is_empty() {
        return Ok(serde_json::json!({ "ok": false, "error": "Nothing heard." }));
    }

    // 2. Voice command detection
    if let Some(cmd) = cleanup::detect_voice_command(&raw_text) {
        return Ok(serde_json::json!({ "ok": true, "text": "", "command": cmd }));
    }

    // 2.5 Hands-Free Voice Actions ("open antigravity", "open antigravity and type ...", "start typing", "press enter")
    let actions_allowed = allow_actions.unwrap_or(true) && settings.voice_actions_enabled;
    if actions_allowed {
        let aliases = settings.app_aliases.clone();
        let raw_for_parse = raw_text.clone();
        let parsed_action = tokio::task::spawn_blocking(move || {
            let apps = crate::voice_actions::discover_installed_apps();
            crate::voice_actions::parse_voice_action(&raw_for_parse, &apps, &aliases)
        })
        .await
        .map_err(|e| e.to_string())?;

        if let Some(mut action) = parsed_action {
            // Polish any typed payload inside OpenAndType / StartTyping through the local pipeline
            let ctx_mode = settings.cleanup_context.as_str();
            let use_llm_for_actions = ctx_mode != "general";
            match &mut action {
                crate::voice_actions::VoiceAction::OpenAndType { text, .. } if !text.is_empty() => {
                    let mut cleaned_payload = if settings.filler_word_removal {
                        cleanup::remove_filler_words(text)
                    } else {
                        text.clone()
                    };
                    if use_llm_for_actions && cfg!(target_os = "macos") && settings.cleanup_provider == "apple" {
                        if let Ok(out) = apple_ai::polish_on_device(&app, &cleaned_payload, ctx_mode).await {
                            if cleanup::is_safe_polish(&cleaned_payload, &out, ctx_mode) {
                                cleaned_payload = out;
                            }
                        }
                    } else {
                        cleaned_payload = cleanup::light_format_general(&cleaned_payload);
                    }
                    *text = cleanup::substitute_snippets(&cleaned_payload, &settings.snippets);
                }
                crate::voice_actions::VoiceAction::StartTyping { text: Some(payload), .. } if !payload.is_empty() => {
                    let mut cleaned_payload = if settings.filler_word_removal {
                        cleanup::remove_filler_words(payload)
                    } else {
                        payload.clone()
                    };
                    if use_llm_for_actions && cfg!(target_os = "macos") && settings.cleanup_provider == "apple" {
                        if let Ok(out) = apple_ai::polish_on_device(&app, &cleaned_payload, ctx_mode).await {
                            if cleanup::is_safe_polish(&cleaned_payload, &out, ctx_mode) {
                                cleaned_payload = out;
                            }
                        }
                    } else {
                        cleaned_payload = cleanup::light_format_general(&cleaned_payload);
                    }
                    *payload = cleanup::substitute_snippets(&cleaned_payload, &settings.snippets);
                }
                _ => {}
            }

            let frontmost = state
                .frontmost_app
                .lock()
                .map_err(|e| e.to_string())?
                .clone();

            let auto_send = settings.hands_free_auto_send;
            let exec = tokio::task::spawn_blocking(move || {
                crate::voice_actions::execute_action(
                    &action,
                    frontmost.as_deref(),
                    is_hands_free,
                    auto_send,
                )
            })
            .await
            .map_err(|e| e.to_string())?
            .map_err(|e| e.to_string())?;

            if exec.stop_hands_free {
                if let Ok(mut hf) = state.hands_free_active.lock() {
                    *hf = false;
                }
                if let Ok(mut da) = state.dictation_active.lock() {
                    *da = false;
                }
            } else if exec.follow_up_dictation {
                if let Ok(mut hf) = state.hands_free_active.lock() {
                    *hf = true;
                }
                if let Ok(mut da) = state.dictation_active.lock() {
                    *da = true;
                }
            }

            if let Ok(mut fm) = state.frontmost_app.lock() {
                // Update to the newly focused app, or clear stale cached app (e.g. Finder) when
                // opening a web app so subsequent hands-free speech uses the live frontmost window.
                *fm = exec.target_app.clone();
            }

            return Ok(serde_json::json!({
                "ok": true,
                "text": "",
                "rawText": raw_text,
                "providerLabel": provider_label,
                "actionExecuted": true,
                "actionKind": exec.action_kind,
                "actionSummary": exec.summary,
                "followUpDictation": exec.follow_up_dictation,
                "stopHandsFree": exec.stop_hands_free,
                "targetApp": exec.target_app
            }));
        }
    }

    // 3. Filler word removal
    let mut cleaned = if settings.filler_word_removal {
        cleanup::remove_filler_words(&raw_text)
    } else {
        raw_text.clone()
    };

    // 4. AI cleanup:
    // In General mode, SpeechAnalyzer / Whisper already punctuates & capitalizes faithfully.
    // Never pass General dictation through a small 3B LLM that can rewrite or answer questions —
    // keep every spoken word verbatim and only apply AI reformatting in Email/Slack/Notes/Code
    // (always protected by `is_safe_polish` word-drift guard).
    let ctx = settings.cleanup_context.as_str();
    let mut cleanup_used = "local-rules";
    if ctx == "general" {
        cleaned = cleanup::light_format_general(&cleaned);
    } else if cfg!(target_os = "macos") && settings.cleanup_provider == "apple" {
        if let Ok(out) = apple_ai::polish_on_device(&app, &cleaned, ctx).await {
            if cleanup::is_safe_polish(&cleaned, &out, ctx) {
                cleaned = out;
                cleanup_used = "apple-foundation-model";
            }
        }
    } else if !privacy_mode {
        if settings.cleanup_provider == "anthropic" && !settings.anthropic_key.is_empty() {
            if let Ok(out) = cleanup::cleanup_with_anthropic(&cleaned, ctx, &settings.anthropic_key).await {
                if cleanup::is_safe_polish(&cleaned, &out, ctx) {
                    cleaned = out;
                    cleanup_used = "anthropic";
                }
            }
        } else if settings.cleanup_provider == "openai" && !settings.openai_key.is_empty() {
            if let Ok(out) = cleanup::cleanup_with_openai(&cleaned, ctx, &settings.openai_key).await {
                if cleanup::is_safe_polish(&cleaned, &out, ctx) {
                    cleaned = out;
                    cleanup_used = "openai";
                }
            }
        }
    }

    // 5. Snippet substitution
    let snippets = settings.snippets.clone();
    cleaned = cleanup::substitute_snippets(&cleaned, &snippets);

    Ok(serde_json::json!({
        "ok": true,
        "text": cleaned,
        "rawText": raw_text,
        "providerLabel": provider_label,
        "cleanupUsed": cleanup_used,
        "privacyMode": privacy_mode,
        "usedFallback": used_fallback
    }))
}

#[tauri::command]
pub async fn inject_overlay_text(
    state: State<'_, AppState>,
    app: AppHandle,
    text: String,
    raw_text: Option<String>,
    provider_label: Option<String>,
    privacy_mode: Option<bool>,
    auto_send: Option<bool>,
) -> Result<serde_json::Value, String> {
    let settings = {
        let store = state.store.lock().map_err(|e| e.to_string())?;
        store.settings().clone()
    };

    // Get the app that was focused before the overlay appeared
    let target_app = {
        state.frontmost_app.lock().map_err(|e| e.to_string())?.clone()
    };

    let should_send = auto_send.unwrap_or(false) && settings.hands_free_auto_send;
    let text_clone = text.clone();
    let target_clone = target_app.clone();

    let mode = tokio::task::spawn_blocking(move || -> Result<String, String> {
        let mode = crate::inject::paste_to_app(&text_clone, target_clone.as_deref())
            .map_err(|e| e.to_string())?;
        if should_send && mode != "skipped-no-input" {
            std::thread::sleep(std::time::Duration::from_millis(120));
            let _ = crate::inject::send_enter();
        }
        Ok(mode)
    })
    .await
    .map_err(|e| e.to_string())??;

    if mode == "skipped-no-input" {
        return Ok(serde_json::json!({ "ok": true, "mode": mode, "skipped": true }));
    }

    let is_privacy = privacy_mode.unwrap_or(settings.privacy_mode);

    if !is_privacy {
        let entry = HistoryEntry {
            id: unique_id(),
            timestamp: now_iso(),
            raw_text: raw_text.unwrap_or_else(|| text.clone()),
            cleaned_text: text.clone(),
            provider: provider_label.unwrap_or_else(|| format!("whisper-rs:{}", settings.whisper_model)),
            injected: true,
            mode: mode.clone(),
        };
        {
            let mut store = state.store.lock().map_err(|e| e.to_string())?;
            store.add_history(entry).map_err(|e| e.to_string())?;
        }
        let _ = app.emit("history-updated", ());
    }

    Ok(serde_json::json!({ "ok": true, "mode": mode }))
}

#[tauri::command]
pub async fn inject_text(text: String) -> Result<serde_json::Value, String> {
    let mode = crate::inject::inject_text(&text).map_err(|e| e.to_string())?;
    Ok(serde_json::json!({ "ok": true, "mode": mode }))
}

#[tauri::command]
pub async fn list_models(state: State<'_, AppState>) -> Result<Vec<models::WhisperModel>, String> {
    let downloads = state.active_downloads.lock().map_err(|e| e.to_string())?;
    let dl_map: HashMap<String, ()> = downloads.keys().map(|k| (k.clone(), ())).collect();
    Ok(models::list_with_status(&state.app_data_dir, &dl_map))
}

#[tauri::command]
pub async fn download_model(
    state: State<'_, AppState>,
    app: AppHandle,
    model_id: String,
) -> Result<serde_json::Value, String> {
    let already = {
        let dl = state.active_downloads.lock().map_err(|e| e.to_string())?;
        dl.contains_key(&model_id)
    };
    if already {
        return Ok(serde_json::json!({ "ok": true, "status": "already_downloading" }));
    }

    let app_data_dir = state.app_data_dir.clone();
    let model_id_clone = model_id.clone();
    let app_clone = app.clone();
    let downloads_clone = Arc::clone(&state.active_downloads);
    let downloads_clone2 = Arc::clone(&state.active_downloads);

    let handle = tokio::spawn(async move {
        let mid = model_id_clone.clone();
        let result = models::download_model(app_data_dir, model_id_clone.clone(), move |received, total| {
            let _ = app_clone.emit("model-download-progress", serde_json::json!({
                "modelId": mid,
                "received": received,
                "total": total
            }));
        })
        .await;

        {
            let mut dl = downloads_clone.lock().unwrap();
            dl.remove(&model_id_clone);
        }

        let ok = result.is_ok();
        let _ = app.emit("model-download-done", serde_json::json!({
            "modelId": model_id_clone,
            "ok": ok,
            "error": result.err().map(|e| e.to_string())
        }));
    });

    {
        let mut dl = downloads_clone2.lock().map_err(|e| e.to_string())?;
        dl.insert(model_id.clone(), handle.abort_handle());
    }

    Ok(serde_json::json!({ "ok": true, "status": "started" }))
}

#[tauri::command]
pub async fn cancel_model_download(
    state: State<'_, AppState>,
    model_id: String,
) -> Result<serde_json::Value, String> {
    let mut dl = state.active_downloads.lock().map_err(|e| e.to_string())?;
    if let Some(handle) = dl.remove(&model_id) {
        handle.abort();
    }
    Ok(serde_json::json!({ "ok": true }))
}

#[tauri::command]
pub async fn delete_model(
    state: State<'_, AppState>,
    model_id: String,
) -> Result<serde_json::Value, String> {
    let ok = models::delete_model(&state.app_data_dir, &model_id);
    Ok(serde_json::json!({ "ok": ok }))
}

#[tauri::command]
pub async fn whisper_status(state: State<'_, AppState>) -> Result<serde_json::Value, String> {
    let settings = {
        let store = state.store.lock().map_err(|e| e.to_string())?;
        store.settings().clone()
    };
    let model_id = &settings.whisper_model;
    let installed = models::model_installed(&state.app_data_dir, model_id);
    let model_path = models::model_path(&state.app_data_dir, model_id);
    Ok(serde_json::json!({
        "binaryFound": true,
        "binary": if cfg!(target_os = "macos") { "built-in (whisper-rs Metal + ONNX)" } else { "built-in (whisper-rs + ONNX)" },
        "model": model_id,
        "modelInstalled": installed,
        "modelPath": model_path.to_string_lossy(),
        "modelsDir": models::models_dir(&state.app_data_dir).to_string_lossy()
    }))
}

#[tauri::command]
pub async fn apple_ai_status(app: AppHandle) -> Result<apple_ai::AppleAiStatus, String> {
    Ok(apple_ai::check_status(&app))
}

#[tauri::command]
pub async fn test_apple_polish(
    app: AppHandle,
    text: String,
    context: Option<String>,
) -> Result<serde_json::Value, String> {
    let ctx = context.unwrap_or_else(|| "general".into());
    match apple_ai::polish_on_device(&app, &text, &ctx).await {
        Ok(cleaned) => Ok(serde_json::json!({ "ok": true, "text": cleaned })),
        Err(e) => Ok(serde_json::json!({ "ok": false, "error": e.to_string() })),
    }
}

#[tauri::command]
pub async fn get_history(state: State<'_, AppState>) -> Result<Vec<HistoryEntry>, String> {
    let store = state.store.lock().map_err(|e| e.to_string())?;
    Ok(store.data.history.clone())
}

#[tauri::command]
pub async fn clear_history(state: State<'_, AppState>) -> Result<Vec<HistoryEntry>, String> {
    let mut store = state.store.lock().map_err(|e| e.to_string())?;
    store.data.history.clear();
    store.save().map_err(|e| e.to_string())?;
    Ok(vec![])
}

#[tauri::command]
pub async fn list_notes(state: State<'_, AppState>) -> Result<Vec<Note>, String> {
    let store = state.store.lock().map_err(|e| e.to_string())?;
    Ok(store.data.notes.clone())
}

#[tauri::command]
pub async fn save_note(state: State<'_, AppState>, note: Note) -> Result<Vec<Note>, String> {
    let mut store = state.store.lock().map_err(|e| e.to_string())?;
    let ts = now_iso();
    if let Some(idx) = store.data.notes.iter().position(|n| n.id == note.id) {
        store.data.notes[idx] = Note { updated_at: ts, ..note };
    } else {
        store.data.notes.insert(0, Note { created_at: ts.clone(), updated_at: ts, ..note });
    }
    store.save().map_err(|e| e.to_string())?;
    Ok(store.data.notes.clone())
}

#[tauri::command]
pub async fn delete_note(state: State<'_, AppState>, note_id: String) -> Result<Vec<Note>, String> {
    let mut store = state.store.lock().map_err(|e| e.to_string())?;
    store.data.notes.retain(|n| n.id != note_id);
    store.save().map_err(|e| e.to_string())?;
    Ok(store.data.notes.clone())
}

#[tauri::command]
pub async fn check_permissions(app: AppHandle) -> Result<serde_json::Value, String> {
    #[cfg(target_os = "macos")]
    {
        let apple_status = apple_ai::check_status(&app);
        let mic_status = if apple_status.helper_found {
            apple_status.mic_permission
        } else {
            "unknown".into()
        };
        let acc = crate::keymon::is_accessibility_trusted();
        return Ok(serde_json::json!({
            "microphone": mic_status,
            "speech": apple_status.speech_permission,
            "accessibility": acc
        }));
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = app;
        Ok(serde_json::json!({ "microphone": "granted", "accessibility": true }))
    }
}

#[tauri::command]
pub async fn open_accessibility_settings() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    std::process::Command::new("open")
        .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility")
        .spawn()
        .ok();
    Ok(())
}

#[tauri::command]
pub async fn open_mic_settings() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    std::process::Command::new("open")
        .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone")
        .spawn()
        .ok();
    #[cfg(target_os = "windows")]
    std::process::Command::new("cmd")
        .args(["/C", "start", "ms-settings:privacy-microphone"])
        .spawn()
        .ok();
    Ok(())
}

#[tauri::command]
pub async fn test_openai_key(key: String) -> Result<serde_json::Value, String> {
    if key.is_empty() {
        return Ok(serde_json::json!({ "valid": false, "error": "No key provided." }));
    }
    let client = reqwest::Client::new();
    let resp = client
        .get("https://api.openai.com/v1/models")
        .bearer_auth(&key)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if resp.status().is_success() {
        Ok(serde_json::json!({ "valid": true }))
    } else {
        let json: serde_json::Value = resp.json().await.unwrap_or_default();
        Ok(serde_json::json!({
            "valid": false,
            "error": json["error"]["message"].as_str().unwrap_or("Invalid key")
        }))
    }
}

#[tauri::command]
pub async fn test_anthropic_key(key: String) -> Result<serde_json::Value, String> {
    if key.is_empty() {
        return Ok(serde_json::json!({ "valid": false, "error": "No key provided." }));
    }
    let client = reqwest::Client::new();
    let body = serde_json::json!({
        "model": "claude-haiku-4-5-20251001",
        "max_tokens": 1,
        "messages": [{ "role": "user", "content": "hi" }]
    });
    let resp = client
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", &key)
        .header("anthropic-version", "2023-06-01")
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if resp.status().is_success() {
        Ok(serde_json::json!({ "valid": true }))
    } else {
        let json: serde_json::Value = resp.json().await.unwrap_or_default();
        Ok(serde_json::json!({
            "valid": false,
            "error": json["error"]["message"].as_str().unwrap_or("Invalid key")
        }))
    }
}

#[tauri::command]
pub async fn complete_onboarding(state: State<'_, AppState>) -> Result<(), String> {
    let mut store = state.store.lock().map_err(|e| e.to_string())?;
    store
        .update_settings(serde_json::json!({ "onboardingComplete": true }))
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Copy a user-selected .onnx file into the app models directory as the given model_id.
#[tauri::command]
pub async fn import_parakeet_model(
    state: State<'_, AppState>,
    src_path: String,
    model_id: String,
) -> Result<serde_json::Value, String> {
    if !model_id.starts_with("parakeet-") {
        return Err("Not a Parakeet model ID".into());
    }
    let dest = models::model_path(&state.app_data_dir, &model_id);
    std::fs::create_dir_all(dest.parent().unwrap()).map_err(|e| e.to_string())?;
    std::fs::copy(&src_path, &dest).map_err(|e| e.to_string())?;
    Ok(serde_json::json!({ "ok": true, "path": dest.to_string_lossy() }))
}

#[tauri::command]
pub async fn append_history(
    state: State<'_, AppState>,
    app: AppHandle,
    entry: HistoryEntry,
) -> Result<Vec<HistoryEntry>, String> {
    let history = {
        let mut store = state.store.lock().map_err(|e| e.to_string())?;
        store.add_history(entry).map_err(|e| e.to_string())?
    };
    let _ = app.emit("history-updated", ());
    Ok(history)
}

#[tauri::command]
pub async fn export_note(note: crate::config::Note) -> Result<serde_json::Value, String> {
    // Build markdown content
    let md = format!("# {}\n\n{}\n", note.title, note.content);
    let filename = format!("{}.md", sanitize_filename(&note.title));

    // Use native save dialog
    // Since tauri-plugin-dialog save is blocking/async, we write to a temp file
    // and invoke open via shell as a workaround if dialog isn't available.
    // In Tauri v2, we access the dialog plugin via the app handle in commands.
    // Because this command doesn't receive an AppHandle, we write to Downloads.
    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .unwrap_or_else(|_| ".".into());
    let dest = std::path::PathBuf::from(&home).join("Downloads").join(&filename);
    std::fs::write(&dest, &md).map_err(|e| e.to_string())?;
    Ok(serde_json::json!({ "ok": true, "path": dest.to_string_lossy() }))
}

fn sanitize_filename(s: &str) -> String {
    s.chars()
        .map(|c| if c.is_alphanumeric() || c == '-' || c == '_' || c == ' ' { c } else { '_' })
        .collect::<String>()
        .trim()
        .replace(' ', "_")
}

#[tauri::command]
pub async fn open_models_dir(state: State<'_, AppState>) -> Result<(), String> {
    let dir = models::models_dir(&state.app_data_dir);
    std::fs::create_dir_all(&dir).ok();
    #[cfg(target_os = "macos")]
    std::process::Command::new("open").arg(&dir).spawn().ok();
    #[cfg(target_os = "windows")]
    std::process::Command::new("explorer").arg(&dir).spawn().ok();
    #[cfg(target_os = "linux")]
    std::process::Command::new("xdg-open").arg(&dir).spawn().ok();
    Ok(())
}

#[tauri::command]
pub async fn list_installed_apps() -> Result<Vec<crate::voice_actions::InstalledApp>, String> {
    tokio::task::spawn_blocking(crate::voice_actions::discover_installed_apps)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn test_voice_action(
    state: State<'_, AppState>,
    phrase: String,
    execute: Option<bool>,
) -> Result<serde_json::Value, String> {
    let aliases = {
        let store = state.store.lock().map_err(|e| e.to_string())?;
        store.settings().app_aliases.clone()
    };
    let should_exec = execute.unwrap_or(false);
    let frontmost = state
        .frontmost_app
        .lock()
        .map_err(|e| e.to_string())?
        .clone();

    tokio::task::spawn_blocking(move || {
        let apps = crate::voice_actions::discover_installed_apps();
        let parsed = crate::voice_actions::parse_voice_action(&phrase, &apps, &aliases);
        match parsed {
            None => Ok(serde_json::json!({
                "matched": false,
                "action": null,
                "executed": false
            })),
            Some(action) => {
                if should_exec {
                    let exec = crate::voice_actions::execute_action(
                        &action,
                        frontmost.as_deref(),
                        false,
                        true,
                    )
                    .map_err(|e| e.to_string())?;
                    Ok(serde_json::json!({
                        "matched": true,
                        "action": action,
                        "executed": true,
                        "result": exec
                    }))
                } else {
                    Ok(serde_json::json!({
                        "matched": true,
                        "action": action,
                        "executed": false
                    }))
                }
            }
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

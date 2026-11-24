mod apple_ai;
mod cleanup;
mod commands;
mod config;
mod inject;
mod keymon;
mod models;
mod parakeet;
mod transcribe;

use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    App, AppHandle, Emitter, Manager,
};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

use commands::AppState;

static TRAY_ICON: &[u8] = include_bytes!("../icons/icon.png");

const DASHBOARD_HOTKEY: &str = "CommandOrControl+Shift+D";

fn get_overlay(app: &AppHandle) -> Option<tauri::WebviewWindow> {
    app.get_webview_window("overlay")
}

fn get_dashboard(app: &AppHandle) -> Option<tauri::WebviewWindow> {
    app.get_webview_window("dashboard")
}

fn show_dashboard(app: &AppHandle, section: &str) {
    if let Some(w) = get_dashboard(app) {
        let _ = w.show();
        let _ = w.set_focus();
        let _ = w.emit("open-dashboard-section", section);
    }
}

fn toggle_dashboard(app: &AppHandle) {
    if let Some(w) = get_dashboard(app) {
        if w.is_visible().unwrap_or(false) {
            let _ = w.hide();
        } else {
            show_dashboard(app, "overview");
        }
    }
}

fn show_overlay(app: &AppHandle) {
    if let Some(w) = get_overlay(app) {
        let _ = w.show();
        let _ = w.emit("overlay-shown", ());
    }
}

fn hide_overlay(app: &AppHandle) {
    if let Some(w) = get_overlay(app) {
        let _ = w.hide();
    }
}

fn toggle_overlay(app: &AppHandle) {
    if let Some(w) = get_overlay(app) {
        if w.is_visible().unwrap_or(false) {
            hide_overlay(app);
        } else {
            show_overlay(app);
        }
    }
}

fn setup_tray(app: &mut App) -> tauri::Result<()> {
    let dashboard_item = MenuItem::with_id(app, "dashboard", "Dashboard", true, None::<&str>)?;
    let settings_item = MenuItem::with_id(app, "settings", "Settings", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", "Quit VANI", true, None::<&str>)?;

    let menu = Menu::with_items(app, &[&dashboard_item, &settings_item, &quit_item])?;

    TrayIconBuilder::with_id("vani-tray")
        .menu(&menu)
        .tooltip("VANI")
        .icon(tauri::image::Image::from_bytes(TRAY_ICON).expect("tray icon"))
        .on_menu_event(move |app, event| match event.id.as_ref() {
            "dashboard" => toggle_dashboard(app),
            "settings" => show_dashboard(app, "settings"),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(move |tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                toggle_overlay(tray.app_handle());
            }
        })
        .build(app)?;

    Ok(())
}

fn setup_hotkeys(app: &mut App) -> tauri::Result<()> {
    let dashboard_shortcut: Shortcut = DASHBOARD_HOTKEY.parse().expect("valid hotkey");

    app.global_shortcut()
        .on_shortcut(dashboard_shortcut, move |app, _shortcut, event| {
            if event.state == ShortcutState::Pressed {
                toggle_dashboard(app);
            }
        })
        .map_err(|e| tauri::Error::Anyhow(e.into()))?;

    Ok(())
}

#[tauri::command]
async fn cancel_dictation(app: AppHandle, state: tauri::State<'_, AppState>) -> Result<(), String> {
    *state.dictation_active.lock().map_err(|e| e.to_string())? = false;
    hide_overlay(&app);
    Ok(())
}

#[tauri::command]
async fn toggle_dashboard_cmd(app: AppHandle) -> Result<(), String> {
    toggle_dashboard(&app);
    Ok(())
}

#[tauri::command]
async fn open_main_window(app: AppHandle, section: Option<String>) -> Result<(), String> {
    show_dashboard(&app, section.as_deref().unwrap_or("overview"));
    Ok(())
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            // Initialize app state
            let app_data_dir = app.path().app_data_dir()
                .expect("no app data dir");
            std::fs::create_dir_all(&app_data_dir).ok();

            let store = config::Store::load(app_data_dir.clone())
                .expect("failed to load store");

            let state = AppState {
                store: Arc::new(Mutex::new(store)),
                engine: transcribe::new_shared_engine(),
                active_downloads: Arc::new(Mutex::new(HashMap::new())),
                app_data_dir,
                dictation_active: Arc::new(Mutex::new(false)),
                frontmost_app: Arc::new(Mutex::new(None)),
                native_recording: Arc::new(Mutex::new(None)),
            };
            app.manage(state);

            setup_tray(app)?;
            setup_hotkeys(app)?;

            // Start native Option-key monitor for hold-to-record
            keymon::start_option_key_monitor(app.handle().clone());

            // In dev mode, show dashboard and open DevTools
            #[cfg(debug_assertions)]
            show_dashboard(app.handle(), "overview");

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_settings,
            commands::save_settings,
            commands::dictation_complete,
            commands::start_native_recording,
            commands::stop_native_recording,
            commands::cancel_native_recording,
            commands::inject_overlay_text,
            commands::inject_text,
            commands::list_models,
            commands::download_model,
            commands::cancel_model_download,
            commands::delete_model,
            commands::whisper_status,
            commands::apple_ai_status,
            commands::test_apple_polish,
            commands::get_history,
            commands::clear_history,
            commands::list_notes,
            commands::save_note,
            commands::delete_note,
            commands::check_permissions,
            commands::test_openai_key,
            commands::test_anthropic_key,
            commands::complete_onboarding,
            commands::open_models_dir,
            commands::import_parakeet_model,
            commands::append_history,
            commands::export_note,
            cancel_dictation,
            toggle_dashboard_cmd,
            open_main_window,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

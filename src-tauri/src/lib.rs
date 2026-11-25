mod apple_ai;
mod cleanup;
mod commands;
mod config;
mod inject;
mod keymon;
mod models;
mod parakeet;
mod transcribe;
mod tray_icons;
mod voice_actions;
#[cfg(target_os = "windows")]
mod win_audio;

use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    App, AppHandle, Emitter, Manager,
};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

use commands::AppState;

const DASHBOARD_HOTKEY: &str = "CommandOrControl+Shift+D";
const DICTATE_HOTKEY: &str = "CommandOrControl+Shift+Space";

fn get_overlay(app: &AppHandle) -> Option<tauri::WebviewWindow> {
    app.get_webview_window("overlay")
}

fn get_dashboard(app: &AppHandle) -> Option<tauri::WebviewWindow> {
    app.get_webview_window("dashboard")
}

fn set_dock_visible(app: &AppHandle, visible: bool) {
    #[cfg(target_os = "macos")]
    {
        let policy = if visible {
            tauri::ActivationPolicy::Regular
        } else {
            tauri::ActivationPolicy::Accessory
        };
        let _ = app.set_activation_policy(policy);
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (app, visible);
    }
}

fn show_dashboard(app: &AppHandle, section: &str) {
    set_dock_visible(app, true);
    if let Some(w) = get_dashboard(app) {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
        let _ = w.emit("open-dashboard-section", section);
    }
}

fn hide_dashboard(app: &AppHandle) {
    if let Some(w) = get_dashboard(app) {
        let _ = w.hide();
    }
    set_dock_visible(app, false);
}

fn toggle_dashboard(app: &AppHandle) {
    if let Some(w) = get_dashboard(app) {
        if w.is_visible().unwrap_or(false) {
            hide_dashboard(app);
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

fn setup_tray(app: &mut App, initial_style: &str) -> tauri::Result<()> {
    let dictate_item = MenuItem::with_id(app, "dictate", "Start / Stop Dictation", true, None::<&str>)?;
    let dashboard_item = MenuItem::with_id(app, "dashboard", "Open VANI Studio", true, None::<&str>)?;
    let settings_item = MenuItem::with_id(app, "settings", "Settings…", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", "Quit VANI", true, None::<&str>)?;

    let menu = Menu::with_items(app, &[&dictate_item, &dashboard_item, &settings_item, &quit_item])?;
    let (icon_img, as_template) = tray_icons::build_tray_icon(initial_style, false);

    let tooltip = if cfg!(target_os = "macos") {
        "VANI — Hold ⌥ Option to dictate"
    } else {
        "VANI — Hold Right Alt to dictate"
    };

    TrayIconBuilder::with_id("vani-tray")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .tooltip(tooltip)
        .icon(icon_img)
        .icon_as_template(as_template)
        .on_menu_event(move |app, event| match event.id.as_ref() {
            "dictate" => {
                let app_bg = app.clone();
                std::thread::spawn(move || keymon::toggle_overlay_dictation(&app_bg));
            }
            "dashboard" => show_dashboard(app, "overview"),
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
                let app_bg = tray.app_handle().clone();
                std::thread::spawn(move || keymon::toggle_overlay_dictation(&app_bg));
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

    if let Ok(dictate_shortcut) = DICTATE_HOTKEY.parse::<Shortcut>() {
        let _ = app
            .global_shortcut()
            .on_shortcut(dictate_shortcut, move |app, _shortcut, event| {
                if event.state == ShortcutState::Pressed {
                    let app_bg = app.clone();
                    std::thread::spawn(move || keymon::toggle_overlay_dictation(&app_bg));
                }
            });
    }

    Ok(())
}

#[tauri::command]
async fn cancel_dictation(app: AppHandle, state: tauri::State<'_, AppState>) -> Result<(), String> {
    *state.dictation_active.lock().map_err(|e| e.to_string())? = false;
    let tray_style = state
        .store
        .lock()
        .map(|s| s.settings().tray_icon_style.clone())
        .unwrap_or_else(|_| "monochrome".into());
    tray_icons::apply_tray_style(&app, &tray_style, false);
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
            let initial_tray_style = store.settings().tray_icon_style.clone();

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

            setup_tray(app, &initial_tray_style)?;
            setup_hotkeys(app)?;

            // Start native push-to-talk key monitor (Option on macOS, Right Alt on Windows)
            keymon::start_option_key_monitor(app.handle().clone());

            #[cfg(target_os = "windows")]
            if let Some(ov) = get_overlay(app.handle()) {
                let _ = ov.set_focusable(false);
            }

            // Open VANI Studio on launch, and intercept window close so VANI
            // keeps running cleanly in the menu bar with its Dock icon hidden.
            if let Some(dash) = get_dashboard(app.handle()) {
                let app_handle = app.handle().clone();
                dash.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        hide_dashboard(&app_handle);
                    }
                });
            }
            show_dashboard(app.handle(), "overview");

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_system_info,
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
            commands::open_accessibility_settings,
            commands::open_mic_settings,
            commands::test_openai_key,
            commands::test_anthropic_key,
            commands::complete_onboarding,
            commands::open_models_dir,
            commands::import_parakeet_model,
            commands::append_history,
            commands::export_note,
            commands::list_installed_apps,
            commands::test_voice_action,
            cancel_dictation,
            toggle_dashboard_cmd,
            open_main_window,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Reopen { .. } = event {
                show_dashboard(app_handle, "overview");
            }
            #[cfg(not(target_os = "macos"))]
            let _ = (app_handle, event);
        });
}

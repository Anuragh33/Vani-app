use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

use crate::commands::AppState;
use crate::tray_icons;

use core_foundation::runloop::{kCFRunLoopCommonModes, CFRunLoop};
use core_graphics::event::{
    CGEventFlags, CGEventTap, CGEventTapLocation, CGEventTapOptions, CGEventTapPlacement, CGEventType,
};

#[cfg(target_os = "macos")]
#[link(name = "ApplicationServices", kind = "framework")]
extern "C" {
    fn AXIsProcessTrusted() -> bool;
}

pub fn is_accessibility_trusted() -> bool {
    #[cfg(target_os = "macos")]
    unsafe {
        AXIsProcessTrusted()
    }
    #[cfg(not(target_os = "macos"))]
    {
        true
    }
}

pub fn start_option_key_monitor(app: AppHandle) {
    std::thread::spawn(move || {
        // Retry automatically until Accessibility permission is granted so the user
        // does not have to restart VANI after enabling Accessibility in System Settings.
        loop {
            if !is_accessibility_trusted() {
                std::thread::sleep(Duration::from_millis(1500));
                continue;
            }

            let app_ref = app.clone();
            let was_pressed = Arc::new(Mutex::new(false));
            let was_pressed_clone = was_pressed.clone();

            let tap = CGEventTap::new(
                CGEventTapLocation::Session,
                CGEventTapPlacement::HeadInsertEventTap,
                CGEventTapOptions::ListenOnly,
                vec![CGEventType::FlagsChanged],
                move |_proxy, _event_type, event| {
                    let flags = event.get_flags();
                    let option_down = flags.contains(CGEventFlags::CGEventFlagAlternate);
                    let other_mods = flags.contains(CGEventFlags::CGEventFlagCommand)
                        || flags.contains(CGEventFlags::CGEventFlagControl);

                    let mut pressed = was_pressed_clone.lock().unwrap();
                    if option_down && !other_mods && !*pressed {
                        *pressed = true;
                        drop(pressed);
                        let app_bg = app_ref.clone();
                        std::thread::spawn(move || begin_overlay_dictation(&app_bg));
                    } else if (!option_down || other_mods) && *pressed {
                        *pressed = false;
                        drop(pressed);
                        let app_bg = app_ref.clone();
                        std::thread::spawn(move || end_overlay_dictation(&app_bg));
                    }
                    None
                },
            );

            match tap {
                Ok(tap) => {
                    if let Ok(loop_source) = tap.mach_port.create_runloop_source(0) {
                        let run_loop = CFRunLoop::get_current();
                        run_loop.add_source(&loop_source, unsafe { kCFRunLoopCommonModes });
                        tap.enable();
                        eprintln!("VANI: Option-key CGEventTap active.");
                        CFRunLoop::run_current();
                    }
                }
                Err(_) => {
                    eprintln!("VANI: Waiting for Accessibility permission for Option-key monitor...");
                }
            }

            std::thread::sleep(Duration::from_millis(1500));
        }
    });
}

fn get_frontmost_app() -> Option<String> {
    let out = std::process::Command::new("osascript")
        .arg("-e")
        .arg("tell application \"System Events\" to get name of first application process whose frontmost is true")
        .output()
        .ok()?;
    let name = String::from_utf8_lossy(&out.stdout).trim().to_string();
    if name.is_empty() || name.eq_ignore_ascii_case("VANI") || name.eq_ignore_ascii_case("vani") {
        None
    } else {
        Some(name)
    }
}

pub fn position_overlay(app: &AppHandle, w: &tauri::WebviewWindow) {
    let hud_position = app
        .state::<AppState>()
        .store
        .lock()
        .map(|s| s.settings().hud_position.clone())
        .unwrap_or_else(|_| "top-center".into());

    let monitor = w
        .current_monitor()
        .ok()
        .flatten()
        .or_else(|| w.primary_monitor().ok().flatten());

    if let Some(monitor) = monitor {
        let scale = monitor.scale_factor();
        let origin = monitor.position();
        let sw = monitor.size().width as i32;
        let sh = monitor.size().height as i32;
        let win_w = (320.0 * scale) as i32;
        let win_h = (160.0 * scale) as i32;
        let pad_x = (24.0 * scale) as i32;
        let top_y = origin.y + (42.0 * scale) as i32;
        let bot_y = (origin.y + sh - win_h - (44.0 * scale) as i32).max(top_y);

        let (wx, wy) = match hud_position.as_str() {
            "bottom-center" => (origin.x + (sw - win_w) / 2, bot_y),
            "top-right" => (origin.x + (sw - win_w - pad_x).max(pad_x), top_y),
            _ => (origin.x + (sw - win_w) / 2, top_y),
        };
        let _ = w.set_position(tauri::PhysicalPosition::new(wx, wy));
    }
}

pub fn begin_overlay_dictation(app: &AppHandle) {
    let state = app.state::<AppState>();
    let mut active = state.dictation_active.lock().unwrap();
    if *active {
        return;
    }
    *active = true;
    drop(active);

    let tray_style = state
        .store
        .lock()
        .map(|s| s.settings().tray_icon_style.clone())
        .unwrap_or_else(|_| "monochrome".into());
    tray_icons::apply_tray_style(app, &tray_style, true);

    // Capture frontmost app BEFORE showing overlay
    let frontmost = get_frontmost_app();
    *state.frontmost_app.lock().unwrap() = frontmost.clone();

    if let Some(w) = app.get_webview_window("overlay") {
        position_overlay(app, &w);
        let _ = w.show();
        let _ = w.set_always_on_top(true);

        // Re-activate the target app so keyboard focus stays where the user was typing
        if let Some(name) = &frontmost {
            let safe = name.replace('"', "");
            let _ = std::process::Command::new("osascript")
                .arg("-e")
                .arg(format!("tell application \"{}\" to activate", safe))
                .spawn();
        }
        let _ = w.emit("dictation-start", ());
    }
}

pub fn end_overlay_dictation(app: &AppHandle) {
    let state = app.state::<AppState>();
    let mut active = state.dictation_active.lock().unwrap();
    if !*active {
        return;
    }
    *active = false;
    drop(active);

    let tray_style = state
        .store
        .lock()
        .map(|s| s.settings().tray_icon_style.clone())
        .unwrap_or_else(|_| "monochrome".into());
    tray_icons::apply_tray_style(app, &tray_style, false);

    if let Some(w) = app.get_webview_window("overlay") {
        let _ = w.emit("dictation-stop", ());
    }
}

pub fn toggle_overlay_dictation(app: &AppHandle) {
    let is_active = app
        .state::<AppState>()
        .dictation_active
        .lock()
        .map(|g| *g)
        .unwrap_or(false);
    if is_active {
        end_overlay_dictation(app);
    } else {
        begin_overlay_dictation(app);
    }
}

use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager};

use crate::commands::AppState;

use core_foundation::runloop::{kCFRunLoopCommonModes, CFRunLoop};
use core_graphics::event::{CGEventFlags, CGEventTap, CGEventTapLocation, CGEventTapOptions, CGEventTapPlacement, CGEventType};

pub fn start_option_key_monitor(app: AppHandle) {
    std::thread::spawn(move || {
        let app_ref = app.clone();
        let was_pressed = Arc::new(Mutex::new(false));
        let was_pressed_clone = was_pressed.clone();

        let tap = CGEventTap::new(
            CGEventTapLocation::Session,
            CGEventTapPlacement::HeadInsertEventTap,
            CGEventTapOptions::Default,
            vec![CGEventType::FlagsChanged],
            move |_proxy, _event_type, event| {
                let flags = event.get_flags();
                let option_down = flags.contains(CGEventFlags::CGEventFlagAlternate);

                let mut pressed = was_pressed_clone.lock().unwrap();
                if option_down && !*pressed {
                    *pressed = true;
                    drop(pressed);
                    on_option_pressed(&app_ref);
                } else if !option_down && *pressed {
                    *pressed = false;
                    drop(pressed);
                    on_option_released(&app_ref);
                }
                None
            },
        );

        match tap {
            Ok(tap) => {
                let loop_source = tap.mach_port.create_runloop_source(0).unwrap();
                let run_loop = CFRunLoop::get_current();
                run_loop.add_source(&loop_source, unsafe { kCFRunLoopCommonModes });
                tap.enable();
                CFRunLoop::run_current();
            }
            Err(_) => {
                eprintln!("VANI: Could not create CGEventTap — grant Accessibility permission.");
            }
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
    if name.is_empty() { None } else { Some(name) }
}

fn on_option_pressed(app: &AppHandle) {
    let state = app.state::<AppState>();
    let mut active = state.dictation_active.lock().unwrap();
    if !*active {
        *active = true;
        drop(active);
        // Capture frontmost app BEFORE showing overlay (overlay would steal focus)
        let frontmost = get_frontmost_app();
        *state.frontmost_app.lock().unwrap() = frontmost.clone();
        if let Some(w) = app.get_webview_window("overlay") {
            let hud_position = state
                .store
                .lock()
                .map(|s| s.settings().hud_position.clone())
                .unwrap_or_else(|_| "top-center".into());

            if let Ok(Some(monitor)) = w.primary_monitor() {
                let scale = monitor.scale_factor();
                let sw = monitor.size().width as i32;
                let sh = monitor.size().height as i32;
                let win_w = (320.0 * scale) as i32;
                let win_h = (160.0 * scale) as i32;
                let pad_x = (24.0 * scale) as i32;
                let top_y = (38.0 * scale) as i32;
                let bot_y = (sh - win_h - (42.0 * scale) as i32).max(top_y);

                let (wx, wy) = match hud_position.as_str() {
                    "bottom-center" => ((sw - win_w) / 2, bot_y),
                    "top-right" => ((sw - win_w - pad_x).max(pad_x), top_y),
                    _ => ((sw - win_w) / 2, top_y), // top-center
                };
                let _ = w.set_position(tauri::PhysicalPosition::new(wx, wy));
            }
            let _ = w.show();
            // Re-activate the target app so the overlay never steals keyboard focus.
            // Audio capture via getUserMedia is independent of window focus.
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
}

fn on_option_released(app: &AppHandle) {
    let state = app.state::<AppState>();
    let mut active = state.dictation_active.lock().unwrap();
    if *active {
        *active = false;
        drop(active);
        if let Some(w) = app.get_webview_window("overlay") {
            let _ = w.emit("dictation-stop", ());
        }
    }
}

use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

use crate::commands::AppState;
use crate::tray_icons;

#[cfg(target_os = "macos")]
use std::sync::{Arc, Mutex};

#[cfg(target_os = "macos")]
use core_foundation::runloop::{kCFRunLoopCommonModes, CFRunLoop};
#[cfg(target_os = "macos")]
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

#[cfg(target_os = "macos")]
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
            // Track (ptt_held, combo_down) for seamless Option (PTT) vs Option+Command (Hands-Free toggle)
            let key_state = Arc::new(Mutex::new((false, false)));
            let key_state_clone = key_state.clone();

            let tap = CGEventTap::new(
                CGEventTapLocation::Session,
                CGEventTapPlacement::HeadInsertEventTap,
                CGEventTapOptions::ListenOnly,
                vec![CGEventType::FlagsChanged],
                move |_proxy, _event_type, event| {
                    let flags = event.get_flags();
                    let option_down = flags.contains(CGEventFlags::CGEventFlagAlternate);
                    let cmd_down = flags.contains(CGEventFlags::CGEventFlagCommand);
                    let ctrl_down = flags.contains(CGEventFlags::CGEventFlagControl);

                    let mut st = key_state_clone.lock().unwrap();
                    let (ref mut ptt_held, ref mut combo_down) = *st;

                    // 1. Option + Command together -> Toggle TRUE Hands-Free Mode!
                    if option_down && cmd_down && !ctrl_down {
                        if !*combo_down {
                            *combo_down = true;
                            let was_ptt = *ptt_held;
                            *ptt_held = false;
                            drop(st);
                            let app_bg = app_ref.clone();
                            std::thread::spawn(move || toggle_hands_free_mode(&app_bg, was_ptt));
                        }
                        return None;
                    } else {
                        *combo_down = false;
                    }

                    // 2. If Hands-Free Mode is active, releasing Option alone does NOT cancel it
                    let is_hf = app_ref
                        .state::<AppState>()
                        .hands_free_active
                        .lock()
                        .map(|g| *g)
                        .unwrap_or(false);
                    if is_hf {
                        *ptt_held = false;
                        return None;
                    }

                    // 3. Push-to-Talk: Hold Option alone -> record; release -> transcribe
                    if option_down && !cmd_down && !ctrl_down && !*ptt_held {
                        *ptt_held = true;
                        drop(st);
                        let app_bg = app_ref.clone();
                        std::thread::spawn(move || begin_overlay_dictation(&app_bg));
                    } else if (!option_down || ctrl_down) && *ptt_held {
                        *ptt_held = false;
                        drop(st);
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
                        eprintln!("VANI: Option (PTT) + Option+Command (Hands-Free) CGEventTap active.");
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

#[cfg(target_os = "windows")]
mod win_hook {
    use super::*;
    use once_cell::sync::OnceCell;
    use std::sync::atomic::{AtomicBool, Ordering};
    use windows_sys::Win32::Foundation::{LPARAM, LRESULT, WPARAM};
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
        GetAsyncKeyState, VK_CONTROL, VK_LCONTROL, VK_LWIN, VK_RCONTROL, VK_RMENU, VK_RWIN,
    };
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        CallNextHookEx, DispatchMessageW, GetMessageW, SetWindowsHookExW, TranslateMessage,
        KBDLLHOOKSTRUCT, MSG, WH_KEYBOARD_LL, WM_KEYDOWN, WM_KEYUP, WM_SYSKEYDOWN, WM_SYSKEYUP,
    };

    static APP_HANDLE: OnceCell<AppHandle> = OnceCell::new();
    static RALT_PRESSED: AtomicBool = AtomicBool::new(false);
    static COMBO_DOWN: AtomicBool = AtomicBool::new(false);

    unsafe extern "system" fn ll_keyboard_proc(
        code: i32,
        wparam: WPARAM,
        lparam: LPARAM,
    ) -> LRESULT {
        if code >= 0 {
            let kb = &*(lparam as *const KBDLLHOOKSTRUCT);
            let msg = wparam as u32;
            let is_down = msg == WM_KEYDOWN || msg == WM_SYSKEYDOWN;
            let is_up = msg == WM_KEYUP || msg == WM_SYSKEYUP;

            let vk = kb.vkCode;
            let is_ralt = vk == VK_RMENU as u32;
            let is_ctrl = vk == VK_CONTROL as u32
                || vk == VK_LCONTROL as u32
                || vk == VK_RCONTROL as u32;

            if is_ralt || is_ctrl {
                let win_down = GetAsyncKeyState(VK_LWIN as i32) < 0
                    || GetAsyncKeyState(VK_RWIN as i32) < 0;
                let ralt_now = if is_ralt {
                    is_down
                } else {
                    GetAsyncKeyState(VK_RMENU as i32) < 0
                };
                let ctrl_now = if is_ctrl {
                    is_down
                } else {
                    GetAsyncKeyState(VK_LCONTROL as i32) < 0
                        || GetAsyncKeyState(VK_RCONTROL as i32) < 0
                };

                // 1. Right Alt + Ctrl together -> Toggle Hands-Free Mode
                if ralt_now && ctrl_now && !win_down {
                    if !COMBO_DOWN.swap(true, Ordering::SeqCst) {
                        let was_ptt = RALT_PRESSED.swap(false, Ordering::SeqCst);
                        if let Some(app) = APP_HANDLE.get() {
                            let app_bg = app.clone();
                            std::thread::spawn(move || toggle_hands_free_mode(&app_bg, was_ptt));
                        }
                    }
                    return CallNextHookEx(std::ptr::null_mut(), code, wparam, lparam);
                } else if is_up {
                    COMBO_DOWN.store(false, Ordering::SeqCst);
                }

                // 2. If Hands-Free Mode is active, releasing Right Alt alone doesn't stop it
                if let Some(app) = APP_HANDLE.get() {
                    let is_hf = app
                        .state::<AppState>()
                        .hands_free_active
                        .lock()
                        .map(|g| *g)
                        .unwrap_or(false);
                    if is_hf {
                        RALT_PRESSED.store(false, Ordering::SeqCst);
                        return CallNextHookEx(std::ptr::null_mut(), code, wparam, lparam);
                    }
                }

                // 3. Push-to-Talk: Hold Right Alt alone
                if is_ralt {
                    if is_down && !win_down && !ctrl_now {
                        if !RALT_PRESSED.swap(true, Ordering::SeqCst) {
                            if let Some(app) = APP_HANDLE.get() {
                                let app_bg = app.clone();
                                std::thread::spawn(move || begin_overlay_dictation(&app_bg));
                            }
                        }
                    } else if is_up {
                        if RALT_PRESSED.swap(false, Ordering::SeqCst) {
                            if let Some(app) = APP_HANDLE.get() {
                                let app_bg = app.clone();
                                std::thread::spawn(move || end_overlay_dictation(&app_bg));
                            }
                        }
                    }
                }
            }
        }
        CallNextHookEx(std::ptr::null_mut(), code, wparam, lparam)
    }

    pub fn start(app: AppHandle) {
        let _ = APP_HANDLE.set(app);
        std::thread::spawn(|| unsafe {
            let hook = SetWindowsHookExW(
                WH_KEYBOARD_LL,
                Some(ll_keyboard_proc),
                std::ptr::null_mut(),
                0,
            );
            if hook.is_null() {
                eprintln!("VANI: Failed to install Windows WH_KEYBOARD_LL hook.");
                return;
            }
            eprintln!("VANI: Windows Right Alt (PTT) + Right Alt+Ctrl (Hands-Free) hook active.");
            let mut msg: MSG = std::mem::zeroed();
            while GetMessageW(&mut msg, std::ptr::null_mut(), 0, 0) > 0 {
                TranslateMessage(&msg);
                DispatchMessageW(&msg);
            }
        });
    }
}

#[cfg(target_os = "windows")]
pub fn start_option_key_monitor(app: AppHandle) {
    win_hook::start(app);
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
pub fn start_option_key_monitor(_app: AppHandle) {}

fn get_frontmost_app() -> Option<String> {
    #[cfg(target_os = "macos")]
    {
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

    #[cfg(target_os = "windows")]
    {
        use windows_sys::Win32::UI::WindowsAndMessaging::{
            GetForegroundWindow, GetWindowThreadProcessId,
        };
        unsafe {
            let hwnd = GetForegroundWindow();
            if hwnd.is_null() {
                return None;
            }
            let mut pid: u32 = 0;
            GetWindowThreadProcessId(hwnd, &mut pid);
            if pid == std::process::id() {
                return None;
            }
            Some(format!("hwnd:{}", hwnd as usize))
        }
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        None
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
        let top_margin = if cfg!(target_os = "macos") { 42.0 } else { 18.0 };
        let bot_margin = if cfg!(target_os = "windows") { 64.0 } else { 44.0 };
        let top_y = origin.y + (top_margin * scale) as i32;
        let bot_y = (origin.y + sh - win_h - (bot_margin * scale) as i32).max(top_y);

        let (wx, wy) = match hud_position.as_str() {
            "top-left" => (origin.x + pad_x, top_y),
            "bottom-center" => (origin.x + (sw - win_w) / 2, bot_y),
            "top-right" => (origin.x + (sw - win_w - pad_x).max(pad_x), top_y),
            _ => (origin.x + (sw - win_w) / 2, top_y),
        };
        let _ = w.set_position(tauri::PhysicalPosition::new(wx, wy));
    }
}

/// Toggle continuous Hands-Free Mode (⌥+⌘ on macOS, Right Alt+Ctrl on Windows).
/// If `promote_from_ptt` is true, Option went down a few ms before Command, so we upgrade
/// the already-starting recording into continuous Hands-Free Mode cleanly!
pub fn toggle_hands_free_mode(app: &AppHandle, promote_from_ptt: bool) {
    let state = app.state::<AppState>();
    let mut hf = state.hands_free_active.lock().unwrap();
    if *hf {
        // Turn OFF Hands-Free Mode
        *hf = false;
        drop(hf);
        *state.dictation_active.lock().unwrap() = false;

        let tray_style = state
            .store
            .lock()
            .map(|s| s.settings().tray_icon_style.clone())
            .unwrap_or_else(|_| "monochrome".into());
        tray_icons::apply_tray_style(app, &tray_style, false);

        if let Some(w) = app.get_webview_window("overlay") {
            let _ = w.emit("hands-free-stop", ());
        }
        return;
    }

    // Turn ON Hands-Free Mode
    *hf = true;
    drop(hf);

    if promote_from_ptt {
        // Overlay is already recording from Option arriving 20ms earlier — just promote it!
        if let Some(w) = app.get_webview_window("overlay") {
            let _ = w.emit("hands-free-start", serde_json::json!({ "alreadyRecording": true }));
        }
        return;
    }

    *state.dictation_active.lock().unwrap() = true;
    let tray_style = state
        .store
        .lock()
        .map(|s| s.settings().tray_icon_style.clone())
        .unwrap_or_else(|_| "monochrome".into());
    tray_icons::apply_tray_style(app, &tray_style, true);

    let frontmost = get_frontmost_app();
    *state.frontmost_app.lock().unwrap() = frontmost.clone();

    if let Some(w) = app.get_webview_window("overlay") {
        #[cfg(target_os = "windows")]
        let _ = w.set_focusable(false);

        position_overlay(app, &w);
        let _ = w.show();
        let _ = w.set_always_on_top(true);

        #[cfg(target_os = "macos")]
        if let Some(name) = &frontmost {
            let safe = name.replace('"', "");
            let _ = std::process::Command::new("osascript")
                .arg("-e")
                .arg(format!("tell application \"{}\" to activate", safe))
                .spawn();
        }

        #[cfg(target_os = "windows")]
        if let Some(tag) = &frontmost {
            if let Some(raw) = tag.strip_prefix("hwnd:") {
                if let Ok(addr) = raw.parse::<usize>() {
                    unsafe {
                        windows_sys::Win32::UI::WindowsAndMessaging::SetForegroundWindow(
                            addr as *mut std::ffi::c_void,
                        );
                    }
                }
            }
        }

        let _ = w.emit("hands-free-start", serde_json::json!({ "alreadyRecording": false }));
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
        #[cfg(target_os = "windows")]
        let _ = w.set_focusable(false);

        position_overlay(app, &w);
        let _ = w.show();
        let _ = w.set_always_on_top(true);

        // Re-activate the target app so keyboard focus stays where the user was typing
        #[cfg(target_os = "macos")]
        if let Some(name) = &frontmost {
            let safe = name.replace('"', "");
            let _ = std::process::Command::new("osascript")
                .arg("-e")
                .arg(format!("tell application \"{}\" to activate", safe))
                .spawn();
        }

        #[cfg(target_os = "windows")]
        if let Some(tag) = &frontmost {
            if let Some(raw) = tag.strip_prefix("hwnd:") {
                if let Ok(addr) = raw.parse::<usize>() {
                    unsafe {
                        windows_sys::Win32::UI::WindowsAndMessaging::SetForegroundWindow(
                            addr as *mut std::ffi::c_void,
                        );
                    }
                }
            }
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

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
    CGEventFlags, CGEventTap, CGEventTapLocation, CGEventTapOptions, CGEventTapPlacement,
    CGEventType, EventField,
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

fn get_hands_free_exit_mode(app: &AppHandle) -> String {
    app.state::<AppState>()
        .store
        .lock()
        .map(|s| s.settings().hands_free_exit_mode.clone())
        .unwrap_or_else(|_| "shortcut_or_esc".into())
}

fn is_hands_free_now(app: &AppHandle) -> bool {
    app.state::<AppState>()
        .hands_free_active
        .lock()
        .map(|g| *g)
        .unwrap_or(false)
}

#[cfg(target_os = "macos")]
#[derive(Default)]
struct MacKeyState {
    option_down: bool,
    cmd_down: bool,
    ptt_active: bool,
    ptt_gen: u64,
    combo_latched: bool,
    option_tap_exit_armed: bool,
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
            let key_state = Arc::new(Mutex::new(MacKeyState::default()));
            let key_state_clone = key_state.clone();

            let tap = CGEventTap::new(
                CGEventTapLocation::Session,
                CGEventTapPlacement::HeadInsertEventTap,
                CGEventTapOptions::ListenOnly,
                vec![CGEventType::FlagsChanged, CGEventType::KeyDown],
                move |_proxy, event_type, event| {
                    // Handle KeyDown: Esc exits Hands-Free (when configured), and any normal
                    // key pressed while Option is held cancels pending 80ms PTT activation so
                    // shortcuts like Option+Arrow / Option+Delete never falsely trigger VANI.
                    if matches!(event_type, CGEventType::KeyDown) {
                        let keycode = event.get_integer_value_field(EventField::KEYBOARD_EVENT_KEYCODE);
                        {
                            let mut st = key_state_clone.lock().unwrap();
                            st.ptt_gen = st.ptt_gen.wrapping_add(1);
                            st.option_tap_exit_armed = false;
                        }
                        if keycode == 53 && is_hands_free_now(&app_ref) {
                            if get_hands_free_exit_mode(&app_ref) == "shortcut_or_esc" {
                                let app_bg = app_ref.clone();
                                std::thread::spawn(move || exit_hands_free_mode(&app_bg));
                            }
                        }
                        return None;
                    }

                    let flags = event.get_flags();
                    let option_down = flags.contains(CGEventFlags::CGEventFlagAlternate);
                    let cmd_down = flags.contains(CGEventFlags::CGEventFlagCommand);
                    let ctrl_down = flags.contains(CGEventFlags::CGEventFlagControl);

                    let mut st = key_state_clone.lock().unwrap();
                    let prev_option = st.option_down;
                    st.option_down = option_down;
                    st.cmd_down = cmd_down;

                    // 1. Option + Command together -> Toggle TRUE Hands-Free Mode immediately
                    if option_down && cmd_down && !ctrl_down {
                        st.ptt_gen = st.ptt_gen.wrapping_add(1);
                        st.option_tap_exit_armed = false;
                        if !st.combo_latched {
                            st.combo_latched = true;
                            let was_ptt = st.ptt_active;
                            st.ptt_active = false;
                            drop(st);
                            let app_bg = app_ref.clone();
                            std::thread::spawn(move || toggle_hands_free_mode(&app_bg, was_ptt));
                        }
                        return None;
                    }

                    // Only clear the combo latch once BOTH Option and Command are released,
                    // preventing releasing Command 20ms before Option from flashing Push-to-Talk.
                    if !option_down && !cmd_down {
                        st.combo_latched = false;
                    }

                    // 2. While Hands-Free Mode is active:
                    if is_hands_free_now(&app_ref) {
                        st.ptt_active = false;
                        st.ptt_gen = st.ptt_gen.wrapping_add(1);

                        if get_hands_free_exit_mode(&app_ref) == "single_option" {
                            if option_down && !prev_option && !cmd_down && !ctrl_down && !st.combo_latched {
                                st.option_tap_exit_armed = true;
                            } else if !option_down && st.option_tap_exit_armed {
                                st.option_tap_exit_armed = false;
                                drop(st);
                                let app_bg = app_ref.clone();
                                std::thread::spawn(move || exit_hands_free_mode(&app_bg));
                                return None;
                            }
                        }
                        return None;
                    }

                    // 3. Push-to-Talk: Hold Option alone -> wait 80ms chord window so Option+Command
                    //    never races with Push-to-Talk, then start recording; release -> transcribe.
                    if option_down && !prev_option && !cmd_down && !ctrl_down && !st.combo_latched && !st.ptt_active {
                        st.ptt_gen = st.ptt_gen.wrapping_add(1);
                        let my_gen = st.ptt_gen;
                        drop(st);
                        let state_timer = key_state_clone.clone();
                        let app_bg = app_ref.clone();
                        std::thread::spawn(move || {
                            std::thread::sleep(Duration::from_millis(80));
                            let should_start = {
                                let mut s = state_timer.lock().unwrap();
                                if s.ptt_gen == my_gen
                                    && s.option_down
                                    && !s.cmd_down
                                    && !s.combo_latched
                                    && !s.ptt_active
                                    && !is_hands_free_now(&app_bg)
                                {
                                    s.ptt_active = true;
                                    true
                                } else {
                                    false
                                }
                            };
                            if should_start {
                                begin_overlay_dictation(&app_bg);
                            }
                        });
                    } else if (!option_down || ctrl_down || cmd_down) && (st.ptt_active || prev_option) {
                        st.ptt_gen = st.ptt_gen.wrapping_add(1);
                        if st.ptt_active {
                            st.ptt_active = false;
                            drop(st);
                            let app_bg = app_ref.clone();
                            std::thread::spawn(move || end_overlay_dictation(&app_bg));
                        }
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
                        eprintln!("VANI: Option (PTT) + Option+Command (Hands-Free) + Esc exit CGEventTap active.");
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
    use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
    use windows_sys::Win32::Foundation::{LPARAM, LRESULT, WPARAM};
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
        GetAsyncKeyState, VK_CONTROL, VK_ESCAPE, VK_LCONTROL, VK_LWIN, VK_RCONTROL, VK_RMENU,
        VK_RWIN,
    };
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        CallNextHookEx, DispatchMessageW, GetMessageW, SetWindowsHookExW, TranslateMessage,
        KBDLLHOOKSTRUCT, MSG, WH_KEYBOARD_LL, WM_KEYDOWN, WM_KEYUP, WM_SYSKEYDOWN, WM_SYSKEYUP,
    };

    static APP_HANDLE: OnceCell<AppHandle> = OnceCell::new();
    static RALT_DOWN: AtomicBool = AtomicBool::new(false);
    static PTT_ACTIVE: AtomicBool = AtomicBool::new(false);
    static PTT_GEN: AtomicU64 = AtomicU64::new(0);
    static COMBO_LATCHED: AtomicBool = AtomicBool::new(false);
    static RALT_TAP_EXIT_ARMED: AtomicBool = AtomicBool::new(false);

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

            // Escape exits Hands-Free immediately when configured
            if is_down && vk == VK_ESCAPE as u32 {
                if let Some(app) = APP_HANDLE.get() {
                    if is_hands_free_now(app) && get_hands_free_exit_mode(app) == "shortcut_or_esc" {
                        let app_bg = app.clone();
                        std::thread::spawn(move || exit_hands_free_mode(&app_bg));
                    }
                }
                return CallNextHookEx(std::ptr::null_mut(), code, wparam, lparam);
            }

            // Any non-modifier key cancels pending 80ms PTT timer (prevents AltGr shortcuts flashing VANI)
            if is_down && !is_ralt && !is_ctrl {
                PTT_GEN.fetch_add(1, Ordering::SeqCst);
                RALT_TAP_EXIT_ARMED.store(false, Ordering::SeqCst);
                return CallNextHookEx(std::ptr::null_mut(), code, wparam, lparam);
            }

            if is_ralt || is_ctrl {
                let win_down = GetAsyncKeyState(VK_LWIN as i32) < 0
                    || GetAsyncKeyState(VK_RWIN as i32) < 0;
                let prev_ralt = RALT_DOWN.load(Ordering::SeqCst);
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
                if is_ralt {
                    RALT_DOWN.store(is_down, Ordering::SeqCst);
                }

                // 1. Right Alt + Ctrl together -> Toggle Hands-Free Mode immediately
                if ralt_now && ctrl_now && !win_down {
                    PTT_GEN.fetch_add(1, Ordering::SeqCst);
                    RALT_TAP_EXIT_ARMED.store(false, Ordering::SeqCst);
                    if !COMBO_LATCHED.swap(true, Ordering::SeqCst) {
                        let was_ptt = PTT_ACTIVE.swap(false, Ordering::SeqCst);
                        if let Some(app) = APP_HANDLE.get() {
                            let app_bg = app.clone();
                            std::thread::spawn(move || toggle_hands_free_mode(&app_bg, was_ptt));
                        }
                    }
                    return CallNextHookEx(std::ptr::null_mut(), code, wparam, lparam);
                }

                if !ralt_now && !ctrl_now {
                    COMBO_LATCHED.store(false, Ordering::SeqCst);
                }

                // 2. While Hands-Free Mode is active
                if let Some(app) = APP_HANDLE.get() {
                    if is_hands_free_now(app) {
                        PTT_ACTIVE.store(false, Ordering::SeqCst);
                        PTT_GEN.fetch_add(1, Ordering::SeqCst);
                        if get_hands_free_exit_mode(app) == "single_option" && is_ralt {
                            if is_down && !prev_ralt && !ctrl_now && !win_down && !COMBO_LATCHED.load(Ordering::SeqCst) {
                                RALT_TAP_EXIT_ARMED.store(true, Ordering::SeqCst);
                            } else if is_up && RALT_TAP_EXIT_ARMED.swap(false, Ordering::SeqCst) {
                                let app_bg = app.clone();
                                std::thread::spawn(move || exit_hands_free_mode(&app_bg));
                            }
                        }
                        return CallNextHookEx(std::ptr::null_mut(), code, wparam, lparam);
                    }
                }

                // 3. Push-to-Talk: Hold Right Alt alone with 80ms chord disambiguation
                if is_ralt {
                    if is_down && !prev_ralt && !win_down && !ctrl_now && !COMBO_LATCHED.load(Ordering::SeqCst) && !PTT_ACTIVE.load(Ordering::SeqCst) {
                        let my_gen = PTT_GEN.fetch_add(1, Ordering::SeqCst).wrapping_add(1);
                        if let Some(app) = APP_HANDLE.get() {
                            let app_bg = app.clone();
                            std::thread::spawn(move || {
                                std::thread::sleep(Duration::from_millis(80));
                                if PTT_GEN.load(Ordering::SeqCst) == my_gen
                                    && RALT_DOWN.load(Ordering::SeqCst)
                                    && !COMBO_LATCHED.load(Ordering::SeqCst)
                                    && !is_hands_free_now(&app_bg)
                                    && !PTT_ACTIVE.swap(true, Ordering::SeqCst)
                                {
                                    begin_overlay_dictation(&app_bg);
                                }
                            });
                        }
                    } else if is_up {
                        PTT_GEN.fetch_add(1, Ordering::SeqCst);
                        if PTT_ACTIVE.swap(false, Ordering::SeqCst) {
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
            eprintln!("VANI: Windows Right Alt (PTT) + Right Alt+Ctrl (Hands-Free) + Esc exit hook active.");
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

/// Cleanly exit Hands-Free Mode from any trigger (Esc, ⌥+⌘, single-tap ⌥, menu bar icon).
pub fn exit_hands_free_mode(app: &AppHandle) {
    let state = app.state::<AppState>();
    let mut hf = state.hands_free_active.lock().unwrap();
    if !*hf {
        return;
    }
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
}

/// Toggle continuous Hands-Free Mode (⌥+⌘ on macOS, Right Alt+Ctrl on Windows).
/// If `promote_from_ptt` is true, Push-to-Talk was already recording and we upgrade it cleanly.
pub fn toggle_hands_free_mode(app: &AppHandle, promote_from_ptt: bool) {
    let state = app.state::<AppState>();
    let already_hf = *state.hands_free_active.lock().unwrap();
    if already_hf {
        // Respect "voice_only" exit setting (user still has voice "Stop listening" & tray click)
        if get_hands_free_exit_mode(app) == "voice_only" {
            return;
        }
        exit_hands_free_mode(app);
        return;
    }

    // Turn ON Hands-Free Mode
    *state.hands_free_active.lock().unwrap() = true;
    *state.dictation_active.lock().unwrap() = true;

    if promote_from_ptt {
        if let Some(w) = app.get_webview_window("overlay") {
            #[cfg(target_os = "macos")]
            crate::macos_overlay::show_overlay_non_activating(app, &w);
            #[cfg(not(target_os = "macos"))]
            {
                let _ = w.show();
                let _ = w.set_always_on_top(true);
            }
            let _ = w.emit("hands-free-start", serde_json::json!({ "alreadyRecording": true }));
        }
        return;
    }

    let tray_style = state
        .store
        .lock()
        .map(|s| s.settings().tray_icon_style.clone())
        .unwrap_or_else(|_| "monochrome".into());
    tray_icons::apply_tray_style(app, &tray_style, true);

    let frontmost = get_frontmost_app();
    *state.frontmost_app.lock().unwrap() = frontmost.clone();

    if let Some(w) = app.get_webview_window("overlay") {
        position_overlay(app, &w);

        #[cfg(target_os = "macos")]
        crate::macos_overlay::show_overlay_non_activating(app, &w);

        #[cfg(target_os = "windows")]
        {
            let _ = w.set_focusable(false);
            let _ = w.show();
            let _ = w.set_always_on_top(true);
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
        }

        let _ = w.emit("hands-free-start", serde_json::json!({ "alreadyRecording": false }));
    }
}

pub fn begin_overlay_dictation(app: &AppHandle) {
    let state = app.state::<AppState>();
    let mut active = state.dictation_active.lock().unwrap();
    if *active || is_hands_free_now(app) {
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

    // Critical race guard: if Hands-Free was toggled while get_frontmost_app() ran,
    // emit hands-free-start instead of dictation-start so the Hands-Free badge is never wiped!
    let promoted = is_hands_free_now(app);

    if let Some(w) = app.get_webview_window("overlay") {
        position_overlay(app, &w);

        #[cfg(target_os = "macos")]
        crate::macos_overlay::show_overlay_non_activating(app, &w);

        #[cfg(target_os = "windows")]
        {
            let _ = w.set_focusable(false);
            let _ = w.show();
            let _ = w.set_always_on_top(true);
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
        }

        if promoted {
            let _ = w.emit("hands-free-start", serde_json::json!({ "alreadyRecording": false }));
        } else {
            let _ = w.emit("dictation-start", ());
        }
    }
}

pub fn end_overlay_dictation(app: &AppHandle) {
    let state = app.state::<AppState>();
    if is_hands_free_now(app) {
        return;
    }
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
    if is_hands_free_now(app) {
        exit_hands_free_mode(app);
        return;
    }
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

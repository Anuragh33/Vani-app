#![cfg(target_os = "macos")]

use std::ffi::{c_char, c_void, CStr};
use std::sync::Once;
use tauri::{AppHandle, Manager, WebviewWindow};

type Id = *mut c_void;
type Class = *mut c_void;
type Sel = *mut c_void;
type Bool = i8; // Objective-C BOOL on arm64/x86_64 macOS

const NO: Bool = 0;
const YES: Bool = 1;

// NSWindowStyleMaskNonactivatingPanel = 1 << 7
const NS_WINDOW_STYLE_MASK_NONACTIVATING_PANEL: usize = 1 << 7;
// NSWindowCollectionBehavior flags:
// CanJoinAllSpaces (1 << 0) | Stationary (1 << 4) | IgnoresCycle (1 << 6) | FullScreenAuxiliary (1 << 8)
const HUD_COLLECTION_BEHAVIOR: usize = (1 << 0) | (1 << 4) | (1 << 6) | (1 << 8);
// NSPopUpMenuWindowLevel = 101 — floats cleanly above full-screen apps, toolbars, and menu bar
const HUD_WINDOW_LEVEL: isize = 101;

#[link(name = "objc")]
extern "C" {
    fn objc_getClass(name: *const c_char) -> Class;
    fn sel_registerName(name: *const c_char) -> Sel;
    fn objc_allocateClassPair(superclass: Class, name: *const c_char, extra_bytes: usize) -> Class;
    fn objc_registerClassPair(cls: Class);
    fn class_addMethod(
        cls: Class,
        name: Sel,
        imp: *const c_void,
        types: *const c_char,
    ) -> Bool;
    fn object_getClass(obj: Id) -> Class;
    fn object_setClass(obj: Id, cls: Class) -> Class;
    fn class_getInstanceSize(cls: Class) -> usize;
    fn objc_msgSend();
}

unsafe fn sel(name: &[u8]) -> Sel {
    sel_registerName(CStr::from_bytes_with_nul_unchecked(name).as_ptr())
}

extern "C" fn return_no(_this: Id, _cmd: Sel) -> Bool {
    NO
}

static REGISTER_PANEL: Once = Once::new();
static mut VANI_HUD_PANEL_CLASS: Class = std::ptr::null_mut();

unsafe fn hud_panel_class() -> Class {
    REGISTER_PANEL.call_once(|| {
        let super_cls = objc_getClass(b"NSPanel\0".as_ptr() as *const c_char);
        if super_cls.is_null() {
            return;
        }
        let name = b"VaniHudPanel\0".as_ptr() as *const c_char;
        let existing = objc_getClass(name);
        if !existing.is_null() {
            VANI_HUD_PANEL_CLASS = existing;
            return;
        }
        let cls = objc_allocateClassPair(super_cls, name, 0);
        if cls.is_null() {
            return;
        }
        let types = b"c@:\0".as_ptr() as *const c_char;
        class_addMethod(cls, sel(b"canBecomeKeyWindow\0"), return_no as *const c_void, types);
        class_addMethod(cls, sel(b"canBecomeMainWindow\0"), return_no as *const c_void, types);
        objc_registerClassPair(cls);
        VANI_HUD_PANEL_CLASS = cls;
    });
    VANI_HUD_PANEL_CLASS
}

unsafe fn configure_ns_window(ns_win: Id) {
    if ns_win.is_null() {
        return;
    }

    // Upgrade the overlay NSWindow into a non-activating NSPanel so macOS WindowServer
    // displays it cleanly on top of EVERY Full-Screen Space (even while VANI Studio is open).
    let panel_cls = hud_panel_class();
    if !panel_cls.is_null() {
        let cur_cls = object_getClass(ns_win);
        if !cur_cls.is_null()
            && cur_cls != panel_cls
            && class_getInstanceSize(panel_cls) <= class_getInstanceSize(cur_cls)
        {
            object_setClass(ns_win, panel_cls);
        }
    }

    // Add NSWindowStyleMaskNonactivatingPanel to existing styleMask
    let get_mask: unsafe extern "C" fn(Id, Sel) -> usize = std::mem::transmute(objc_msgSend as *const ());
    let set_mask: unsafe extern "C" fn(Id, Sel, usize) = std::mem::transmute(objc_msgSend as *const ());
    let mask = get_mask(ns_win, sel(b"styleMask\0"));
    set_mask(
        ns_win,
        sel(b"setStyleMask:\0"),
        mask | NS_WINDOW_STYLE_MASK_NONACTIVATING_PANEL,
    );

    // Join all Spaces + appear over macOS Full-Screen apps + stationary + skip Cmd+Tab cycle
    let set_usize: unsafe extern "C" fn(Id, Sel, usize) = std::mem::transmute(objc_msgSend as *const ());
    set_usize(ns_win, sel(b"setCollectionBehavior:\0"), HUD_COLLECTION_BEHAVIOR);

    // Float above full-screen apps and menu bar
    let set_isize: unsafe extern "C" fn(Id, Sel, isize) = std::mem::transmute(objc_msgSend as *const ());
    set_isize(ns_win, sel(b"setLevel:\0"), HUD_WINDOW_LEVEL);

    // Non-hiding, modal-safe, click-through HUD
    let set_bool: unsafe extern "C" fn(Id, Sel, Bool) = std::mem::transmute(objc_msgSend as *const ());
    set_bool(ns_win, sel(b"setHidesOnDeactivate:\0"), NO);
    set_bool(ns_win, sel(b"setCanHide:\0"), NO);
    set_bool(ns_win, sel(b"setIgnoresMouseEvents:\0"), YES);
    set_bool(ns_win, sel(b"setHasShadow:\0"), NO);

    // NSPanel-specific properties (safe because we converted to VaniHudPanel)
    let responds: unsafe extern "C" fn(Id, Sel, Sel) -> Bool = std::mem::transmute(objc_msgSend as *const ());
    let sel_floating = sel(b"setFloatingPanel:\0");
    if responds(ns_win, sel(b"respondsToSelector:\0"), sel_floating) != NO {
        set_bool(ns_win, sel_floating, YES);
    }
    let sel_modal = sel(b"setWorksWhenModal:\0");
    if responds(ns_win, sel(b"respondsToSelector:\0"), sel_modal) != NO {
        set_bool(ns_win, sel_modal, YES);
    }
}

/// Configure the overlay window once at startup (must run on main thread).
pub fn init_overlay_window(app: &AppHandle) {
    let app_handle = app.clone();
    let _ = app.run_on_main_thread(move || {
        if let Some(w) = app_handle.get_webview_window("overlay") {
            let _ = w.set_visible_on_all_workspaces(true);
            let _ = w.set_ignore_cursor_events(true);
            if let Ok(raw) = w.ns_window() {
                unsafe {
                    configure_ns_window(raw as Id);
                }
            }
        }
    });
}

/// Show the floating HUD pill directly on the active Space (including macOS Full-Screen Spaces)
/// without stealing focus or switching Spaces.
pub fn show_overlay_non_activating(app: &AppHandle, w: &WebviewWindow) {
    let w_clone = w.clone();
    let _ = app.run_on_main_thread(move || {
        if let Ok(raw) = w_clone.ns_window() {
            unsafe {
                let ns_win = raw as Id;
                configure_ns_window(ns_win);
                let order_front: unsafe extern "C" fn(Id, Sel) =
                    std::mem::transmute(objc_msgSend as *const ());
                order_front(ns_win, sel(b"orderFrontRegardless\0"));
            }
        } else {
            let _ = w_clone.show();
        }
    });
}

/// Hide the floating HUD pill cleanly without disturbing focus or full-screen Spaces.
pub fn hide_overlay_non_activating(app: &AppHandle, w: &WebviewWindow) {
    let w_clone = w.clone();
    let _ = app.run_on_main_thread(move || {
        if let Ok(raw) = w_clone.ns_window() {
            unsafe {
                let ns_win = raw as Id;
                let order_out: unsafe extern "C" fn(Id, Sel, Id) =
                    std::mem::transmute(objc_msgSend as *const ());
                order_out(ns_win, sel(b"orderOut:\0"), std::ptr::null_mut());
            }
        } else {
            let _ = w_clone.hide();
        }
    });
}

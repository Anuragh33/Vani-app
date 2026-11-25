use anyhow::Result;
use enigo::{Enigo, Keyboard, Settings};

pub fn inject_text(text: &str) -> Result<String> {
    if text.is_empty() {
        return Ok("noop".into());
    }

    #[cfg(target_os = "macos")]
    {
        // Try AppleScript first (more reliable for special chars)
        if let Ok(mode) = inject_via_applescript(text) {
            return Ok(mode);
        }
    }

    #[cfg(target_os = "windows")]
    {
        if let Ok(mode) = paste_to_app(text, None) {
            return Ok(mode);
        }
    }

    // Fall back to enigo
    inject_via_enigo(text)
}

fn inject_via_enigo(text: &str) -> Result<String> {
    let mut enigo = Enigo::new(&Settings::default())?;
    enigo.text(text)?;
    Ok("enigo".into())
}

#[cfg(target_os = "macos")]
fn inject_via_applescript(text: &str) -> Result<String> {
    use std::process::Command;
    let escaped = text.replace('\\', "\\\\").replace('"', "\\\"");
    let script = format!(r#"tell application "System Events" to keystroke "{}""#, escaped);
    let status = Command::new("osascript").arg("-e").arg(&script).status()?;
    if status.success() {
        Ok("applescript".into())
    } else {
        Err(anyhow::anyhow!("AppleScript failed"))
    }
}

/// Copy text to clipboard then activate the target app and send Cmd+V (macOS) or Ctrl+V (Windows).
/// On macOS, refuses to send Cmd+V into Finder or System Settings when no editable text field
/// is focused — preventing macOS Finder from creating `.textClipping` document files on the Desktop
/// or inside open folders.
pub fn paste_to_app(text: &str, app_name: Option<&str>) -> Result<String> {
    #[cfg(target_os = "macos")]
    {
        use std::process::Command;

        // Inspect live frontmost app + focused UI element BEFORE touching the clipboard.
        // If another app (e.g. Safari/Antigravity/ChatGPT) is already frontmost, prefer it
        // over a potentially stale cached `app_name` (such as "Finder" from before opening a web app).
        let check_script = r#"
tell application "System Events"
  set frontProc to first application process whose frontmost is true
  set pName to name of frontProc
  set isText to "0"
  try
    set focusedEl to value of attribute "AXFocusedUIElement" of frontProc
    set r to value of attribute "AXRole" of focusedEl
    if r is "AXTextField" or r is "AXTextArea" or r is "AXSearchField" or r is "AXComboBox" then
      set isText to "1"
    end if
  end try
  return pName & "|" & isText
end tell
"#;
        let check_out = Command::new("osascript")
            .arg("-e")
            .arg(check_script)
            .output()
            .ok()
            .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
            .unwrap_or_default();

        let (live_front, has_text_focus) = match check_out.split_once('|') {
            Some((name, flag)) => (name.trim(), flag.trim() == "1"),
            None => ("", false),
        };

        let live_is_vani = live_front.is_empty()
            || live_front.eq_ignore_ascii_case("vani")
            || live_front.eq_ignore_ascii_case("vani-app");

        // Determine the effective app that will receive Cmd+V
        let effective_target: Option<&str> = if !live_is_vani {
            Some(live_front)
        } else {
            app_name
        };

        // Guard: Never paste into Finder (Desktop/folder view) or System Settings unless a text field
        // is actually focused — otherwise Finder creates `Pasted ...textClipping` files on Desktop!
        if let Some(target) = effective_target {
            if target.eq_ignore_ascii_case("Finder") || target.eq_ignore_ascii_case("System Settings") {
                if live_is_vani || !has_text_focus {
                    return Ok("skipped-no-input".into());
                }
            }
        }

        copy_to_clipboard(text)?;

        // Only activate `app_name` if VANI itself was frontmost; otherwise paste straight into the
        // live frontmost app the user is currently interacting with.
        let activate = if live_is_vani {
            app_name
                .map(|name| {
                    let safe = name.replace('"', "");
                    format!("tell application \"{}\" to activate\ndelay 0.18\n", safe)
                })
                .unwrap_or_default()
        } else {
            String::new()
        };

        let script = format!(
            "{}tell application \"System Events\" to keystroke \"v\" using command down",
            activate
        );
        Command::new("osascript").arg("-e").arg(&script).status()?;
        return Ok("clipboard".into());
    }

    #[cfg(target_os = "windows")]
    {
        copy_to_clipboard(text)?;
        use std::mem::size_of;
        use std::time::Duration;
        use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
            SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYEVENTF_KEYUP, VK_CONTROL,
            VK_RMENU, VK_V,
        };
        use windows_sys::Win32::UI::WindowsAndMessaging::SetForegroundWindow;

        if let Some(tag) = app_name {
            if let Some(raw) = tag.strip_prefix("hwnd:") {
                if let Ok(addr) = raw.parse::<usize>() {
                    unsafe {
                        SetForegroundWindow(addr as *mut std::ffi::c_void);
                    }
                    std::thread::sleep(Duration::from_millis(60));
                }
            }
        }

        let make_key = |vk: u16, flags: u32| INPUT {
            r#type: INPUT_KEYBOARD,
            Anonymous: INPUT_0 {
                ki: KEYBDINPUT {
                    wVk: vk,
                    wScan: 0,
                    dwFlags: flags,
                    time: 0,
                    dwExtraInfo: 0,
                },
            },
        };

        let inputs = [
            make_key(VK_RMENU, KEYEVENTF_KEYUP),
            make_key(VK_CONTROL, 0),
            make_key(VK_V, 0),
            make_key(VK_V, KEYEVENTF_KEYUP),
            make_key(VK_CONTROL, KEYEVENTF_KEYUP),
        ];

        unsafe {
            SendInput(
                inputs.len() as u32,
                inputs.as_ptr(),
                size_of::<INPUT>() as i32,
            );
        }
        return Ok("clipboard".into());
    }

    #[allow(unreachable_code)]
    {
        let _ = (text, app_name);
        Err(anyhow::anyhow!("paste not implemented on this platform"))
    }
}

pub fn copy_to_clipboard(text: &str) -> Result<()> {
    #[cfg(target_os = "macos")]
    {
        use std::io::Write;
        use std::process::{Command, Stdio};
        let mut child = Command::new("pbcopy").stdin(Stdio::piped()).spawn()?;
        child.stdin.take().unwrap().write_all(text.as_bytes())?;
        child.wait()?;
        return Ok(());
    }

    #[cfg(target_os = "windows")]
    {
        let mut clipboard = arboard::Clipboard::new()
            .map_err(|e| anyhow::anyhow!("Clipboard unavailable: {}", e))?;
        clipboard
            .set_text(text.to_string())
            .map_err(|e| anyhow::anyhow!("Failed to set clipboard: {}", e))?;
        return Ok(());
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let _ = text;
        Err(anyhow::anyhow!("clipboard not implemented"))
    }
}

#[cfg(target_os = "windows")]
fn win_send_keys(keys: &[(u16, u32)]) {
    use std::mem::size_of;
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
        SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT,
    };
    let inputs: Vec<INPUT> = keys
        .iter()
        .map(|&(vk, flags)| INPUT {
            r#type: INPUT_KEYBOARD,
            Anonymous: INPUT_0 {
                ki: KEYBDINPUT {
                    wVk: vk,
                    wScan: 0,
                    dwFlags: flags,
                    time: 0,
                    dwExtraInfo: 0,
                },
            },
        })
        .collect();
    unsafe {
        SendInput(
            inputs.len() as u32,
            inputs.as_ptr(),
            size_of::<INPUT>() as i32,
        );
    }
}

pub fn send_enter() -> Result<()> {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("osascript")
            .arg("-e")
            .arg("tell application \"System Events\" to key code 36")
            .status()?;
        return Ok(());
    }
    #[cfg(target_os = "windows")]
    {
        use windows_sys::Win32::UI::Input::KeyboardAndMouse::{KEYEVENTF_KEYUP, VK_RETURN};
        win_send_keys(&[(VK_RETURN, 0), (VK_RETURN, KEYEVENTF_KEYUP)]);
        return Ok(());
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    Ok(())
}

pub fn send_shift_enter() -> Result<()> {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("osascript")
            .arg("-e")
            .arg("tell application \"System Events\" to key code 36 using shift down")
            .status()?;
        return Ok(());
    }
    #[cfg(target_os = "windows")]
    {
        use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
            KEYEVENTF_KEYUP, VK_RETURN, VK_SHIFT,
        };
        win_send_keys(&[
            (VK_SHIFT, 0),
            (VK_RETURN, 0),
            (VK_RETURN, KEYEVENTF_KEYUP),
            (VK_SHIFT, KEYEVENTF_KEYUP),
        ]);
        return Ok(());
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    Ok(())
}

pub fn send_select_all() -> Result<()> {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("osascript")
            .arg("-e")
            .arg("tell application \"System Events\" to keystroke \"a\" using command down")
            .status()?;
        return Ok(());
    }
    #[cfg(target_os = "windows")]
    {
        use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
            KEYEVENTF_KEYUP, VK_A, VK_CONTROL,
        };
        win_send_keys(&[
            (VK_CONTROL, 0),
            (VK_A, 0),
            (VK_A, KEYEVENTF_KEYUP),
            (VK_CONTROL, KEYEVENTF_KEYUP),
        ]);
        return Ok(());
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    Ok(())
}

pub fn send_clear_input() -> Result<()> {
    send_select_all()?;
    std::thread::sleep(std::time::Duration::from_millis(60));
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("osascript")
            .arg("-e")
            .arg("tell application \"System Events\" to key code 51")
            .status()?;
        return Ok(());
    }
    #[cfg(target_os = "windows")]
    {
        use windows_sys::Win32::UI::Input::KeyboardAndMouse::{KEYEVENTF_KEYUP, VK_BACK};
        win_send_keys(&[(VK_BACK, 0), (VK_BACK, KEYEVENTF_KEYUP)]);
        return Ok(());
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    Ok(())
}

pub fn send_new_tab() -> Result<()> {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("osascript")
            .arg("-e")
            .arg("tell application \"System Events\" to keystroke \"t\" using command down")
            .status()?;
        return Ok(());
    }
    #[cfg(target_os = "windows")]
    {
        use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
            KEYEVENTF_KEYUP, VK_CONTROL, VK_T,
        };
        win_send_keys(&[
            (VK_CONTROL, 0),
            (VK_T, 0),
            (VK_T, KEYEVENTF_KEYUP),
            (VK_CONTROL, KEYEVENTF_KEYUP),
        ]);
        return Ok(());
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    Ok(())
}

pub fn send_close_tab() -> Result<()> {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("osascript")
            .arg("-e")
            .arg("tell application \"System Events\" to keystroke \"w\" using command down")
            .status()?;
        return Ok(());
    }
    #[cfg(target_os = "windows")]
    {
        use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
            KEYEVENTF_KEYUP, VK_CONTROL, VK_W,
        };
        win_send_keys(&[
            (VK_CONTROL, 0),
            (VK_W, 0),
            (VK_W, KEYEVENTF_KEYUP),
            (VK_CONTROL, KEYEVENTF_KEYUP),
        ]);
        return Ok(());
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    Ok(())
}

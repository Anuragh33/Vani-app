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
pub fn paste_to_app(text: &str, app_name: Option<&str>) -> Result<String> {
    copy_to_clipboard(text)?;

    #[cfg(target_os = "macos")]
    {
        use std::process::Command;
        let activate = app_name
            .map(|name| {
                let safe = name.replace('"', "");
                format!("tell application \"{}\" to activate\ndelay 0.2\n", safe)
            })
            .unwrap_or_default();
        let script = format!(
            "{}tell application \"System Events\" to keystroke \"v\" using command down",
            activate
        );
        Command::new("osascript").arg("-e").arg(&script).status()?;
        return Ok("clipboard".into());
    }

    #[cfg(target_os = "windows")]
    {
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
    Err(anyhow::anyhow!("paste not implemented on this platform"))
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

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

/// Copy text to clipboard then activate the target app and send Cmd+V.
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

    #[allow(unreachable_code)]
    Err(anyhow::anyhow!("paste not implemented on this platform"))
}

pub fn copy_to_clipboard(text: &str) -> Result<()> {
    #[cfg(target_os = "macos")]
    {
        use std::process::{Command, Stdio};
        let mut child = Command::new("pbcopy").stdin(Stdio::piped()).spawn()?;
        use std::io::Write;
        child.stdin.take().unwrap().write_all(text.as_bytes())?;
        child.wait()?;
        return Ok(());
    }

    #[cfg(not(target_os = "macos"))]
    {
        // On other platforms write via arboard or similar
        // For now use enigo clipboard — acceptable for V2 MVP
        Err(anyhow::anyhow!("clipboard not implemented"))
    }
}

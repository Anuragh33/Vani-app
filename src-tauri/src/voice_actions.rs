use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::time::Duration;

use crate::config::AppAlias;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledApp {
    pub name: String,
    pub path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum VoiceAction {
    OpenApp {
        app_name: String,
        app_path: String,
    },
    OpenAndType {
        app_name: String,
        app_path: String,
        text: String,
        press_enter: bool,
    },
    StartTyping {
        text: Option<String>,
        press_enter: bool,
    },
    PressEnter,
    NewLine,
    SelectAll,
    ClearInput,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActionExecutionResult {
    pub ok: bool,
    pub action_kind: String,
    pub summary: String,
    pub follow_up_dictation: bool,
    pub target_app: Option<String>,
}

fn normalize_key(s: &str) -> String {
    s.chars()
        .filter(|c| c.is_alphanumeric())
        .flat_map(|c| c.to_lowercase())
        .collect()
}

fn levenshtein(a: &str, b: &str) -> usize {
    let a_chars: Vec<char> = a.chars().collect();
    let b_chars: Vec<char> = b.chars().collect();
    let m = a_chars.len();
    let n = b_chars.len();
    if m == 0 {
        return n;
    }
    if n == 0 {
        return m;
    }
    let mut prev: Vec<usize> = (0..=n).collect();
    let mut curr = vec![0usize; n + 1];
    for i in 1..=m {
        curr[0] = i;
        for j in 1..=n {
            let cost = if a_chars[i - 1] == b_chars[j - 1] { 0 } else { 1 };
            curr[j] = (prev[j] + 1)
                .min(curr[j - 1] + 1)
                .min(prev[j - 1] + cost);
        }
        std::mem::swap(&mut prev, &mut curr);
    }
    prev[n]
}

fn builtin_aliases() -> &'static [(&'static str, &'static str)] {
    &[
        ("antigravity", "Antigravity"),
        ("anti gravity", "Antigravity"),
        ("anti-gravity", "Antigravity"),
        ("vscode", "Visual Studio Code"),
        ("vs code", "Visual Studio Code"),
        ("code", "Visual Studio Code"),
        ("chrome", "Google Chrome"),
        ("google chrome", "Google Chrome"),
        ("brave", "Brave Browser"),
        ("edge", "Microsoft Edge"),
        ("firefox", "Firefox"),
        ("safari", "Safari"),
        ("chatgpt", "ChatGPT"),
        ("chat gpt", "ChatGPT"),
        ("whatsapp", "WhatsApp"),
        ("whats app", "WhatsApp"),
        ("word", "Microsoft Word"),
        ("excel", "Microsoft Excel"),
        ("powerpoint", "Microsoft PowerPoint"),
        ("outlook", "Microsoft Outlook"),
        ("teams", "Microsoft Teams"),
        ("settings", "System Settings"),
        ("system settings", "System Settings"),
        ("terminal", "Terminal"),
        ("notepad", "Notepad"),
        ("calculator", "Calculator"),
        ("explorer", "File Explorer"),
        ("finder", "Finder"),
        ("notes", "Notes"),
        ("slack", "Slack"),
        ("discord", "Discord"),
        ("notion", "Notion"),
        ("cursor", "Cursor"),
        ("gemini", "Gemini"),
        ("perplexity", "Perplexity"),
        ("telegram", "Telegram"),
        ("spotify", "Spotify"),
        ("xcode", "Xcode"),
        ("postman", "Postman"),
        ("docker", "Docker"),
        ("figma", "Figma"),
        ("zoom", "Zoom"),
    ]
}

#[cfg(target_os = "macos")]
pub fn discover_installed_apps() -> Vec<InstalledApp> {
    let mut dirs = vec![
        PathBuf::from("/Applications"),
        PathBuf::from("/System/Applications"),
        PathBuf::from("/System/Applications/Utilities"),
    ];
    if let Ok(home) = std::env::var("HOME") {
        dirs.push(PathBuf::from(home).join("Applications"));
    }

    let mut seen: HashMap<String, InstalledApp> = HashMap::new();
    for dir in dirs {
        let Ok(entries) = std::fs::read_dir(&dir) else {
            continue;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) == Some("app") {
                if let Some(stem) = path.file_stem().and_then(|s| s.to_str()) {
                    let key = normalize_key(stem);
                    seen.entry(key).or_insert_with(|| InstalledApp {
                        name: stem.to_string(),
                        path: path.to_string_lossy().to_string(),
                    });
                }
            }
        }
    }

    // Finder lives in CoreServices
    seen.entry("finder".into()).or_insert_with(|| InstalledApp {
        name: "Finder".into(),
        path: "/System/Library/CoreServices/Finder.app".into(),
    });

    let mut apps: Vec<InstalledApp> = seen.into_values().collect();
    apps.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    apps
}

#[cfg(target_os = "windows")]
pub fn discover_installed_apps() -> Vec<InstalledApp> {
    let mut seen: HashMap<String, InstalledApp> = HashMap::new();

    fn walk_start_menu(dir: &PathBuf, depth: usize, seen: &mut HashMap<String, InstalledApp>) {
        if depth > 3 {
            return;
        }
        let Ok(entries) = std::fs::read_dir(dir) else {
            return;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                walk_start_menu(&path, depth + 1, seen);
            } else if path
                .extension()
                .and_then(|e| e.to_str())
                .map(|e| e.eq_ignore_ascii_case("lnk"))
                .unwrap_or(false)
            {
                if let Some(stem) = path.file_stem().and_then(|s| s.to_str()) {
                    let lower = stem.to_lowercase();
                    if lower.contains("uninstall") || lower.contains("readme") || lower.contains("help") {
                        continue;
                    }
                    let key = normalize_key(stem);
                    seen.entry(key).or_insert_with(|| InstalledApp {
                        name: stem.to_string(),
                        path: path.to_string_lossy().to_string(),
                    });
                }
            }
        }
    }

    if let Ok(pd) = std::env::var("ProgramData") {
        walk_start_menu(
            &PathBuf::from(pd).join("Microsoft\\Windows\\Start Menu\\Programs"),
            0,
            &mut seen,
        );
    }
    if let Ok(ad) = std::env::var("APPDATA") {
        walk_start_menu(
            &PathBuf::from(ad).join("Microsoft\\Windows\\Start Menu\\Programs"),
            0,
            &mut seen,
        );
    }

    // Built-in Windows apps always available on PATH / Shell
    for (name, cmd) in [
        ("Notepad", "notepad.exe"),
        ("Calculator", "calc.exe"),
        ("Command Prompt", "cmd.exe"),
        ("PowerShell", "powershell.exe"),
        ("Windows Terminal", "wt.exe"),
        ("File Explorer", "explorer.exe"),
        ("Settings", "ms-settings:"),
        ("Task Manager", "taskmgr.exe"),
        ("Paint", "mspaint.exe"),
    ] {
        seen.entry(normalize_key(name)).or_insert_with(|| InstalledApp {
            name: name.into(),
            path: cmd.into(),
        });
    }

    let mut apps: Vec<InstalledApp> = seen.into_values().collect();
    apps.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    apps
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
pub fn discover_installed_apps() -> Vec<InstalledApp> {
    vec![]
}

/// Resolve a spoken app name against user aliases, built-in aliases, and discovered apps.
/// Returns `None` if no installed app matches (so normal dictation is never hijacked!).
pub fn resolve_app(
    spoken: &str,
    installed: &[InstalledApp],
    custom_aliases: &[AppAlias],
) -> Option<InstalledApp> {
    let cleaned = spoken
        .trim()
        .trim_matches(|c: char| matches!(c, '.' | ',' | '!' | '?' | '"' | '\''))
        .trim();
    if cleaned.is_empty() || cleaned.len() > 64 {
        return None;
    }

    // Reject obvious non-app prose ("the door", "a new tab", "this file")
    let lower = cleaned.to_lowercase();
    for stop_prefix in ["the ", "a ", "an ", "this ", "that ", "my ", "your ", "it ", "up "] {
        if lower.starts_with(stop_prefix) {
            // Allow "the browser" only if user explicitly made a custom alias for it
            let has_custom = custom_aliases
                .iter()
                .any(|a| normalize_key(&a.spoken) == normalize_key(&lower));
            if !has_custom {
                return None;
            }
        }
    }

    let query_norm = normalize_key(cleaned);
    if query_norm.len() < 2 {
        return None;
    }

    // 1. User-defined custom aliases take top priority
    for alias in custom_aliases {
        if normalize_key(&alias.spoken) == query_norm {
            let target_norm = normalize_key(&alias.target);
            if let Some(app) = installed.iter().find(|a| normalize_key(&a.name) == target_norm) {
                return Some(app.clone());
            }
            // Allow direct target name/path if user configured one explicitly
            return Some(InstalledApp {
                name: alias.target.clone(),
                path: alias.target.clone(),
            });
        }
    }

    // 2. Exact normalized match on installed apps
    if let Some(app) = installed.iter().find(|a| normalize_key(&a.name) == query_norm) {
        return Some(app.clone());
    }

    // 3. Built-in aliases mapped onto installed apps
    for &(alias_spoken, target_name) in builtin_aliases() {
        if normalize_key(alias_spoken) == query_norm {
            let target_norm = normalize_key(target_name);
            if let Some(app) = installed
                .iter()
                .find(|a| {
                    let n = normalize_key(&a.name);
                    n == target_norm || n.starts_with(&target_norm) || target_norm.starts_with(&n)
                })
            {
                return Some(app.clone());
            }
        }
    }

    // 4. Strong prefix match (e.g. "google" -> "Google Chrome" if >= 4 chars)
    if query_norm.len() >= 4 {
        let mut prefix_matches: Vec<&InstalledApp> = installed
            .iter()
            .filter(|a| normalize_key(&a.name).starts_with(&query_norm))
            .collect();
        prefix_matches.sort_by_key(|a| a.name.len());
        if let Some(best) = prefix_matches.first() {
            return Some((*best).clone());
        }
    }

    // 5. Fuzzy match (Levenshtein distance <= 2 for longer app names like "antigravity")
    if query_norm.len() >= 5 {
        let max_dist = if query_norm.len() >= 8 { 2 } else { 1 };
        let mut best: Option<(usize, &InstalledApp)> = None;
        for app in installed {
            let cand = normalize_key(&app.name);
            if cand.len().abs_diff(query_norm.len()) > max_dist {
                continue;
            }
            let d = levenshtein(&query_norm, &cand);
            if d <= max_dist && best.map(|(bd, _)| d < bd).unwrap_or(true) {
                best = Some((d, app));
            }
        }
        if let Some((_, app)) = best {
            return Some(app.clone());
        }
    }

    None
}

fn strip_trailing_enter(raw: &str) -> (String, bool) {
    let trimmed = raw.trim().trim_end_matches(|c: char| matches!(c, '.' | '!' | '?')).trim();
    let lower = trimmed.to_lowercase();
    for suffix in [
        " and press enter",
        " and hit enter",
        " and send it",
        " and send",
        " press enter",
        " hit enter",
    ] {
        if lower.ends_with(suffix) {
            let cut = trimmed.len() - suffix.len();
            let text = trimmed[..cut].trim().trim_end_matches(',').trim().to_string();
            return (text, true);
        }
    }
    (raw.trim().to_string(), false)
}

/// Parse a spoken transcript into a structured VoiceAction if it clearly expresses one.
pub fn parse_voice_action(
    raw_text: &str,
    installed: &[InstalledApp],
    custom_aliases: &[AppAlias],
) -> Option<VoiceAction> {
    let trimmed = raw_text.trim();
    if trimmed.is_empty() {
        return None;
    }

    let cleaned_end = trimmed
        .trim_end_matches(|c: char| matches!(c, '.' | '!' | '?' | ','))
        .trim();
    let lower = cleaned_end.to_lowercase();

    // 1. Standalone quick keyboard/control actions (must match whole utterance cleanly)
    match lower.as_str() {
        "press enter" | "hit enter" | "send message" | "send it" | "submit message" => {
            return Some(VoiceAction::PressEnter);
        }
        "new line" | "shift enter" | "press shift enter" => {
            return Some(VoiceAction::NewLine);
        }
        "select all" => {
            return Some(VoiceAction::SelectAll);
        }
        "clear input" | "clear chat box" | "clear text box" | "clear box" => {
            return Some(VoiceAction::ClearInput);
        }
        "start typing"
        | "start dictating"
        | "focus chat"
        | "focus chat box"
        | "focus input"
        | "type in chat"
        | "type in the chat box" => {
            return Some(VoiceAction::StartTyping {
                text: None,
                press_enter: false,
            });
        }
        _ => {}
    }

    // 2. "start typing <payload>" / "type in chat <payload>"
    for prefix in [
        "start typing ",
        "start dictating ",
        "type in chat ",
        "type in the chat box ",
        "type in chat box ",
    ] {
        if lower.starts_with(prefix) {
            let rest = trimmed[prefix.len()..].trim();
            if !rest.is_empty() {
                let (payload, press_enter) = strip_trailing_enter(rest);
                return Some(VoiceAction::StartTyping {
                    text: Some(payload),
                    press_enter,
                });
            }
        }
    }

    // 3. "open/launch/switch to/go to <app> [and type/start typing/say/ask/send/message <payload>]"
    for prefix in [
        "hey vani open ",
        "vani open ",
        "please open ",
        "open ",
        "launch ",
        "start ",
        "switch to ",
        "go to ",
        "focus ",
    ] {
        if let Some(after) = lower.strip_prefix(prefix) {
            // Preserve original casing from `trimmed` for any typed payload
            let orig_after = &trimmed[prefix.len()..];

            // Check chained separators: "<app> and type <payload>", etc.
            let chain_markers: &[(&str, bool)] = &[
                (" and start typing ", false),
                (" and start dictating ", false),
                (" and type ", false),
                (" and write ", false),
                (" and say ", false),
                (" and ask ", true),
                (" and send ", true),
                (" and message ", false),
                (", start typing ", false),
                (", type ", false),
                (" then type ", false),
                (" then start typing ", false),
            ];

            for &(marker, default_enter) in chain_markers {
                if let Some(idx) = after.find(marker) {
                    let app_query = after[..idx].trim();
                    let payload_raw = orig_after[idx + marker.len()..].trim();
                    if let Some(app) = resolve_app(app_query, installed, custom_aliases) {
                        if payload_raw.is_empty() {
                            return Some(VoiceAction::OpenApp {
                                app_name: app.name,
                                app_path: app.path,
                            });
                        }
                        let (payload, explicit_enter) = strip_trailing_enter(payload_raw);
                        return Some(VoiceAction::OpenAndType {
                            app_name: app.name,
                            app_path: app.path,
                            text: payload,
                            press_enter: default_enter || explicit_enter,
                        });
                    }
                }
            }

            // Check "<app> and start typing" (chained open + hands-free typing mode!)
            for tail in [" and start typing", " then start typing", " and start dictating"] {
                if let Some(app_query) = after.strip_suffix(tail) {
                    if let Some(app) = resolve_app(app_query, installed, custom_aliases) {
                        return Some(VoiceAction::OpenAndType {
                            app_name: app.name,
                            app_path: app.path,
                            text: String::new(), // empty text = trigger hands-free follow-up dictation!
                            press_enter: false,
                        });
                    }
                }
            }

            // Standalone "open <app>" (only match when the whole phrase resolves to an installed app)
            let app_query = after
                .trim_end_matches(" app")
                .trim_end_matches(" application")
                .trim();
            if let Some(app) = resolve_app(app_query, installed, custom_aliases) {
                return Some(VoiceAction::OpenApp {
                    app_name: app.name,
                    app_path: app.path,
                });
            }
        }
    }

    None
}

/// Launch or bring an application to the foreground.
pub fn open_application(app_name: &str, app_path: &str) -> Result<()> {
    #[cfg(target_os = "macos")]
    {
        use std::process::Command;
        let status = if !app_path.is_empty() && std::path::Path::new(app_path).exists() {
            Command::new("open").arg(app_path).status()?
        } else {
            Command::new("open").args(["-a", app_name]).status()?
        };
        if !status.success() {
            return Err(anyhow!("Could not open {}", app_name));
        }
        // Also ensure it is actively brought to the front
        let safe = app_name.replace('"', "");
        let _ = Command::new("osascript")
            .arg("-e")
            .arg(format!("tell application \"{}\" to activate", safe))
            .output();
        Ok(())
    }

    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        let target = if !app_path.is_empty() { app_path } else { app_name };
        let status = Command::new("cmd")
            .args(["/C", "start", "", target])
            .status()?;
        if !status.success() {
            return Err(anyhow!("Could not launch {}", app_name));
        }
        Ok(())
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let _ = (app_name, app_path);
        Err(anyhow!("App launching not supported on this OS"))
    }
}

/// Best-effort focus of the primary chat / text input area inside the active app.
/// If a text input is already focused, leaves focus untouched.
pub fn focus_chat_or_input_box(app_name: Option<&str>) {
    #[cfg(target_os = "macos")]
    {
        use std::process::Command;
        // Check if current focused element is already editable; if not, focus the bottom-most
        // AXTextArea or AXTextField in the frontmost window (where chat inputs live).
        let script = r#"
tell application "System Events"
  set frontProc to first application process whose frontmost is true
  try
    set focusedRole to value of attribute "AXRole" of (value of attribute "AXFocusedUIElement" of frontProc)
    if focusedRole is "AXTextArea" or focusedRole is "AXTextField" or focusedRole is "AXComboBox" then
      return "already-focused"
    end if
  end try
  try
    set w to front window of frontProc
    set tas to (every text area of entire contents of w)
    if (count of tas) > 0 then
      set value of attribute "AXFocused" of (last item of tas) to true
      return "focused-textarea"
    end if
  end try
  try
    set w to front window of frontProc
    set tfs to (every text field of entire contents of w)
    if (count of tfs) > 0 then
      set value of attribute "AXFocused" of (last item of tfs) to true
      return "focused-textfield"
    end if
  end try
end tell
return "unchanged"
"#;
        let out = Command::new("osascript").arg("-e").arg(script).output();
        let res = out
            .ok()
            .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
            .unwrap_or_default();

        // Fallback for Electron/VS Code-based AI IDEs (Antigravity / Cursor) when AX tree is virtualized:
        if res == "unchanged" || res.is_empty() {
            if let Some(name) = app_name {
                let n = name.to_lowercase();
                if n.contains("antigravity") || n.contains("cursor") {
                    let _ = Command::new("osascript")
                        .arg("-e")
                        .arg("tell application \"System Events\" to keystroke \"l\" using command down")
                        .output();
                    std::thread::sleep(Duration::from_millis(180));
                }
            }
        }
    }

    #[cfg(target_os = "windows")]
    {
        // Windows apps like Antigravity, Cursor, Slack, Discord, and ChatGPT restore focus
        // to their active chat box on activation; give the window a brief moment to paint.
        let _ = app_name;
        std::thread::sleep(Duration::from_millis(250));
    }
}

/// Execute a parsed VoiceAction end-to-end.
pub fn execute_action(action: &VoiceAction, frontmost_app: Option<&str>) -> Result<ActionExecutionResult> {
    match action {
        VoiceAction::OpenApp { app_name, app_path } => {
            open_application(app_name, app_path)?;
            std::thread::sleep(Duration::from_millis(450));
            focus_chat_or_input_box(Some(app_name));
            Ok(ActionExecutionResult {
                ok: true,
                action_kind: "openApp".into(),
                summary: format!("Opened {}", app_name),
                follow_up_dictation: false,
                target_app: Some(app_name.clone()),
            })
        }
        VoiceAction::OpenAndType {
            app_name,
            app_path,
            text,
            press_enter,
        } => {
            open_application(app_name, app_path)?;
            std::thread::sleep(Duration::from_millis(750));
            focus_chat_or_input_box(Some(app_name));

            if text.is_empty() {
                return Ok(ActionExecutionResult {
                    ok: true,
                    action_kind: "openAndStartTyping".into(),
                    summary: format!("Opened {} — listening…", app_name),
                    follow_up_dictation: true,
                    target_app: Some(app_name.clone()),
                });
            }

            #[cfg(target_os = "macos")]
            crate::inject::paste_to_app(text, Some(app_name))?;
            #[cfg(not(target_os = "macos"))]
            crate::inject::paste_to_app(text, None)?;

            if *press_enter {
                std::thread::sleep(Duration::from_millis(120));
                crate::inject::send_enter()?;
            }

            Ok(ActionExecutionResult {
                ok: true,
                action_kind: "openAndType".into(),
                summary: format!("Opened {} & typed", app_name),
                follow_up_dictation: false,
                target_app: Some(app_name.clone()),
            })
        }
        VoiceAction::StartTyping { text, press_enter } => {
            #[cfg(target_os = "macos")]
            if let Some(app_name) = frontmost_app {
                let safe = app_name.replace('"', "");
                let _ = std::process::Command::new("osascript")
                    .arg("-e")
                    .arg(format!("tell application \"{}\" to activate", safe))
                    .output();
                std::thread::sleep(Duration::from_millis(160));
            }

            focus_chat_or_input_box(frontmost_app);

            if let Some(payload) = text {
                if !payload.is_empty() {
                    crate::inject::paste_to_app(payload, frontmost_app)?;
                    if *press_enter {
                        std::thread::sleep(Duration::from_millis(120));
                        crate::inject::send_enter()?;
                    }
                    return Ok(ActionExecutionResult {
                        ok: true,
                        action_kind: "typeText".into(),
                        summary: "Typed into active input".into(),
                        follow_up_dictation: false,
                        target_app: frontmost_app.map(|s| s.to_string()),
                    });
                }
            }

            Ok(ActionExecutionResult {
                ok: true,
                action_kind: "startTyping".into(),
                summary: "Focused input — start speaking".into(),
                follow_up_dictation: true,
                target_app: frontmost_app.map(|s| s.to_string()),
            })
        }
        VoiceAction::PressEnter => {
            crate::inject::send_enter()?;
            Ok(ActionExecutionResult {
                ok: true,
                action_kind: "pressEnter".into(),
                summary: "Pressed Enter".into(),
                follow_up_dictation: false,
                target_app: frontmost_app.map(|s| s.to_string()),
            })
        }
        VoiceAction::NewLine => {
            crate::inject::send_shift_enter()?;
            Ok(ActionExecutionResult {
                ok: true,
                action_kind: "newLine".into(),
                summary: "Inserted new line".into(),
                follow_up_dictation: false,
                target_app: frontmost_app.map(|s| s.to_string()),
            })
        }
        VoiceAction::SelectAll => {
            crate::inject::send_select_all()?;
            Ok(ActionExecutionResult {
                ok: true,
                action_kind: "selectAll".into(),
                summary: "Selected all text".into(),
                follow_up_dictation: false,
                target_app: frontmost_app.map(|s| s.to_string()),
            })
        }
        VoiceAction::ClearInput => {
            crate::inject::send_clear_input()?;
            Ok(ActionExecutionResult {
                ok: true,
                action_kind: "clearInput".into(),
                summary: "Cleared input box".into(),
                follow_up_dictation: false,
                target_app: frontmost_app.map(|s| s.to_string()),
            })
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_apps() -> Vec<InstalledApp> {
        vec![
            InstalledApp { name: "Antigravity".into(), path: "/Applications/Antigravity.app".into() },
            InstalledApp { name: "Google Chrome".into(), path: "/Applications/Google Chrome.app".into() },
            InstalledApp { name: "Slack".into(), path: "/Applications/Slack.app".into() },
            InstalledApp { name: "Visual Studio Code".into(), path: "/Applications/Visual Studio Code.app".into() },
        ]
    }

    #[test]
    fn parses_open_antigravity_and_fuzzy_variants() {
        let apps = sample_apps();
        for phrase in ["open antigravity", "Open Anti Gravity.", "launch anti-gravity", "switch to antigravty"] {
            match parse_voice_action(phrase, &apps, &[]) {
                Some(VoiceAction::OpenApp { app_name, .. }) => assert_eq!(app_name, "Antigravity"),
                other => panic!("Expected OpenApp(Antigravity) for {:?}, got {:?}", phrase, other),
            }
        }
    }

    #[test]
    fn parses_chained_open_and_type() {
        let apps = sample_apps();
        match parse_voice_action("Open Antigravity and type build a dark mode toggle", &apps, &[]) {
            Some(VoiceAction::OpenAndType { app_name, text, press_enter, .. }) => {
                assert_eq!(app_name, "Antigravity");
                assert_eq!(text, "build a dark mode toggle");
                assert!(!press_enter);
            }
            other => panic!("Unexpected: {:?}", other),
        }

        match parse_voice_action("open antigravity and ask what is rust", &apps, &[]) {
            Some(VoiceAction::OpenAndType { app_name, text, press_enter, .. }) => {
                assert_eq!(app_name, "Antigravity");
                assert_eq!(text, "what is rust");
                assert!(press_enter);
            }
            other => panic!("Unexpected: {:?}", other),
        }
    }

    #[test]
    fn parses_start_typing_and_controls() {
        let apps = sample_apps();
        assert!(matches!(
            parse_voice_action("Start typing.", &apps, &[]),
            Some(VoiceAction::StartTyping { text: None, press_enter: false })
        ));
        assert!(matches!(
            parse_voice_action("start typing hello world and press enter", &apps, &[]),
            Some(VoiceAction::StartTyping { text: Some(ref t), press_enter: true }) if t == "hello world"
        ));
        assert!(matches!(parse_voice_action("Press enter.", &apps, &[]), Some(VoiceAction::PressEnter)));
        assert!(matches!(parse_voice_action("clear input", &apps, &[]), Some(VoiceAction::ClearInput)));
    }

    #[test]
    fn rejects_normal_dictation_false_positives() {
        let apps = sample_apps();
        for prose in [
            "open the door please",
            "open a new pull request tomorrow",
            "I want to open my laptop later",
            "let's start the meeting at 3pm",
        ] {
            assert!(
                parse_voice_action(prose, &apps, &[]).is_none(),
                "False positive for {:?}",
                prose
            );
        }
    }

    #[test]
    fn respects_custom_aliases() {
        let apps = sample_apps();
        let aliases = vec![AppAlias { spoken: "my editor".into(), target: "Antigravity".into() }];
        match parse_voice_action("open my editor", &apps, &aliases) {
            Some(VoiceAction::OpenApp { app_name, .. }) => assert_eq!(app_name, "Antigravity"),
            other => panic!("Expected alias match, got {:?}", other),
        }
    }
}

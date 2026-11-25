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
    #[serde(default)]
    pub is_web: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum VoiceAction {
    OpenApp {
        app_name: String,
        app_path: String,
        #[serde(default)]
        is_web: bool,
    },
    OpenAndType {
        app_name: String,
        app_path: String,
        #[serde(default)]
        is_web: bool,
        text: String,
        press_enter: bool,
    },
    StartTyping {
        text: Option<String>,
        press_enter: bool,
    },
    StopHandsFree,
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
    pub stop_hands_free: bool,
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

/// Built-in spoken aliases -> canonical desktop app name (including common STT spellings).
fn builtin_aliases() -> &'static [(&'static str, &'static str)] {
    &[
        // Antigravity
        ("antigravity", "Antigravity"),
        ("anti gravity", "Antigravity"),
        ("anti-gravity", "Antigravity"),
        ("antigrav", "Antigravity"),
        ("and gravity", "Antigravity"),
        // Apple built-in macOS apps (macOS names them without "Apple" prefix!)
        ("apple music", "Music"),
        ("music", "Music"),
        ("itunes", "Music"),
        ("apple tv", "TV"),
        ("apple notes", "Notes"),
        ("notes", "Notes"),
        ("apple mail", "Mail"),
        ("mail", "Mail"),
        ("apple maps", "Maps"),
        ("maps", "Maps"),
        ("apple photos", "Photos"),
        ("photos", "Photos"),
        ("apple books", "Books"),
        ("apple podcasts", "Podcasts"),
        ("podcasts", "Podcasts"),
        ("apple calendar", "Calendar"),
        ("calendar", "Calendar"),
        ("apple reminders", "Reminders"),
        ("reminders", "Reminders"),
        ("apple weather", "Weather"),
        ("weather", "Weather"),
        ("app store", "App Store"),
        ("appstore", "App Store"),
        ("mac app store", "App Store"),
        ("imessage", "Messages"),
        ("i message", "Messages"),
        ("messages", "Messages"),
        ("facetime", "FaceTime"),
        ("face time", "FaceTime"),
        ("voice memos", "VoiceMemos"),
        ("system settings", "System Settings"),
        ("settings", "System Settings"),
        ("system preferences", "System Settings"),
        ("preferences", "System Settings"),
        ("finder", "Finder"),
        ("terminal", "Terminal"),
        ("safari", "Safari"),
        // AI assistants (frequent STT variations!)
        ("chatgpt", "ChatGPT"),
        ("chat gpt", "ChatGPT"),
        ("chat g p t", "ChatGPT"),
        ("chat gbt", "ChatGPT"),
        ("chat g b t", "ChatGPT"),
        ("chad gpt", "ChatGPT"),
        ("chat pt", "ChatGPT"),
        ("chat gdp", "ChatGPT"),
        ("charge gpt", "ChatGPT"),
        ("gpt", "ChatGPT"),
        ("claude", "Claude"),
        ("claude ai", "Claude"),
        ("claude a", "Claude"),
        ("claude a i", "Claude"),
        ("claud", "Claude"),
        ("claud ai", "Claude"),
        ("clod", "Claude"),
        ("clod ai", "Claude"),
        ("cloud ai", "Claude"),
        ("clawed", "Claude"),
        ("clawed ai", "Claude"),
        ("gemini", "Gemini"),
        ("google gemini", "Gemini"),
        ("perplexity", "Perplexity"),
        ("perplexity ai", "Perplexity"),
        // Dev & Browsers & Messaging
        ("vscode", "Visual Studio Code"),
        ("vs code", "Visual Studio Code"),
        ("v s code", "Visual Studio Code"),
        ("code", "Visual Studio Code"),
        ("chrome", "Google Chrome"),
        ("google chrome", "Google Chrome"),
        ("brave", "Brave Browser"),
        ("brave browser", "Brave Browser"),
        ("edge", "Microsoft Edge"),
        ("firefox", "Firefox"),
        ("whatsapp", "WhatsApp"),
        ("whats app", "WhatsApp"),
        ("word", "Microsoft Word"),
        ("excel", "Microsoft Excel"),
        ("powerpoint", "Microsoft PowerPoint"),
        ("outlook", "Microsoft Outlook"),
        ("teams", "Microsoft Teams"),
        ("notepad", "Notepad"),
        ("calculator", "Calculator"),
        ("explorer", "File Explorer"),
        ("slack", "Slack"),
        ("discord", "Discord"),
        ("notion", "Notion"),
        ("cursor", "Cursor"),
        ("telegram", "Telegram"),
        ("spotify", "Spotify"),
        ("xcode", "Xcode"),
        ("x code", "Xcode"),
        ("postman", "Postman"),
        ("docker", "Docker"),
        ("figma", "Figma"),
        ("zoom", "Zoom"),
    ]
}

/// Well-known web app fallbacks when a user asks to open a popular service
/// (like Claude, YouTube, Gmail, GitHub, ChatGPT, Apple Music) that isn't installed locally.
fn builtin_web_apps() -> &'static [(&'static str, &'static str, &'static str)] {
    &[
        ("claude", "Claude", "https://claude.ai"),
        ("claudeai", "Claude", "https://claude.ai"),
        ("claudea", "Claude", "https://claude.ai"),
        ("claud", "Claude", "https://claude.ai"),
        ("clod", "Claude", "https://claude.ai"),
        ("cloudai", "Claude", "https://claude.ai"),
        ("chatgpt", "ChatGPT", "https://chatgpt.com"),
        ("chatgbt", "ChatGPT", "https://chatgpt.com"),
        ("gemini", "Gemini", "https://gemini.google.com"),
        ("perplexity", "Perplexity", "https://www.perplexity.ai"),
        ("youtube", "YouTube", "https://www.youtube.com"),
        ("gmail", "Gmail", "https://mail.google.com"),
        ("github", "GitHub", "https://github.com"),
        ("google", "Google", "https://www.google.com"),
        ("googledocs", "Google Docs", "https://docs.google.com"),
        ("googledrive", "Google Drive", "https://drive.google.com"),
        ("googlecalendar", "Google Calendar", "https://calendar.google.com"),
        ("applemusic", "Apple Music", "https://music.apple.com"),
        ("spotify", "Spotify", "https://open.spotify.com"),
        ("whatsapp", "WhatsApp", "https://web.whatsapp.com"),
        ("notion", "Notion", "https://www.notion.so"),
        ("figma", "Figma", "https://www.figma.com"),
        ("linkedin", "LinkedIn", "https://www.linkedin.com"),
        ("twitter", "X", "https://x.com"),
        ("netflix", "Netflix", "https://www.netflix.com"),
        ("reddit", "Reddit", "https://www.reddit.com"),
        ("slack", "Slack", "https://app.slack.com"),
        ("discord", "Discord", "https://discord.com/app"),
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
        let user_apps = PathBuf::from(&home).join("Applications");
        dirs.push(user_apps.clone());
        dirs.push(user_apps.join("Chrome Apps.localized"));
        dirs.push(user_apps.join("Brave Browser Apps.localized"));
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
                    // Skip internal URL handler shims so e.g. "Claude Code URL Handler" doesn't hijack "Claude"
                    if stem.to_lowercase().contains("url handler") {
                        continue;
                    }
                    let key = normalize_key(stem);
                    seen.entry(key).or_insert_with(|| InstalledApp {
                        name: stem.to_string(),
                        path: path.to_string_lossy().to_string(),
                        is_web: false,
                    });
                }
            }
        }
    }

    // Finder lives in CoreServices
    seen.entry("finder".into()).or_insert_with(|| InstalledApp {
        name: "Finder".into(),
        path: "/System/Library/CoreServices/Finder.app".into(),
        is_web: false,
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
                        is_web: false,
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
            is_web: false,
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

/// Resolve a spoken app name against user aliases, built-in aliases, discovered desktop apps,
/// and well-known web apps (e.g. Claude -> claude.ai when Claude.app isn't installed).
/// Returns `None` for normal prose so regular dictation is never hijacked.
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

    let lower = cleaned.to_lowercase();
    for stop_prefix in ["the ", "a ", "an ", "this ", "that ", "my ", "your ", "it ", "up "] {
        if lower.starts_with(stop_prefix) {
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
            if alias.target.starts_with("http://") || alias.target.starts_with("https://") {
                return Some(InstalledApp {
                    name: alias.spoken.clone(),
                    path: alias.target.clone(),
                    is_web: true,
                });
            }
            if let Some(app) = installed.iter().find(|a| normalize_key(&a.name) == target_norm) {
                return Some(app.clone());
            }
            return Some(InstalledApp {
                name: alias.target.clone(),
                path: alias.target.clone(),
                is_web: false,
            });
        }
    }

    // 2. Exact normalized match on installed desktop apps
    if let Some(app) = installed.iter().find(|a| normalize_key(&a.name) == query_norm) {
        return Some(app.clone());
    }

    // 3. Built-in aliases mapped onto installed desktop apps
    let mut alias_canonical: Option<&'static str> = None;
    for &(alias_spoken, target_name) in builtin_aliases() {
        if normalize_key(alias_spoken) == query_norm {
            alias_canonical = Some(target_name);
            let target_norm = normalize_key(target_name);
            if let Some(app) = installed.iter().find(|a| {
                let n = normalize_key(&a.name);
                n == target_norm
            }) {
                return Some(app.clone());
            }
            // Secondary prefix match on canonical name (e.g. "Google Chrome" vs "Chrome")
            if let Some(app) = installed.iter().find(|a| {
                let n = normalize_key(&a.name);
                (n.starts_with(&target_norm) || target_norm.starts_with(&n)) && n.len() >= 4
            }) {
                return Some(app.clone());
            }
        }
    }

    // 3b. Strip leading "apple " on macOS (e.g. "Apple Reminders" -> "Reminders", "Apple Music" -> "Music")
    if let Some(stripped) = lower.strip_prefix("apple ") {
        let stripped_norm = normalize_key(stripped);
        if stripped_norm.len() >= 2 {
            if let Some(app) = installed.iter().find(|a| normalize_key(&a.name) == stripped_norm) {
                return Some(app.clone());
            }
        }
    }

    // 4. Strong prefix match on installed desktop apps (e.g. "antigrav" -> "Antigravity")
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

    // 5. Fuzzy match (Levenshtein distance <= 2 for longer app names like "antigravity", "chatgpt")
    if query_norm.len() >= 5 {
        let max_dist = if query_norm.len() >= 7 { 2 } else { 1 };
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

    // 6. Web-app fallback (e.g., "Open Claude" / "Open Claude AI" -> https://claude.ai when Claude.app isn't installed!)
    let web_lookup = alias_canonical.map(normalize_key).unwrap_or_else(|| query_norm.clone());
    for &(web_key, display_name, url) in builtin_web_apps() {
        if web_key == query_norm || web_key == web_lookup {
            return Some(InstalledApp {
                name: display_name.to_string(),
                path: url.to_string(),
                is_web: true,
            });
        }
    }

    None
}

fn strip_leading_fillers(raw: &str) -> &str {
    let mut s = raw.trim();
    loop {
        let lower = s.to_lowercase();
        let mut matched = false;
        for filler in [
            "um,", "um ", "uh,", "uh ", "ah,", "ah ", "er,", "er ", "so,", "so ",
            "okay,", "okay ", "ok,", "ok ", "hey,", "hey ", "hey vani,", "hey vani ",
            "vani,", "vani ", "please ", "can you ", "could you ", "just ", "go ahead and ",
        ] {
            if lower.starts_with(filler) {
                s = s[filler.len()..].trim_start();
                matched = true;
                break;
            }
        }
        if !matched {
            break;
        }
    }
    s
}

fn strip_trailing_enter(raw: &str) -> (String, bool) {
    let trimmed = raw
        .trim()
        .trim_end_matches(|c: char| matches!(c, '.' | '!' | '?'))
        .trim();
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

/// Parse a spoken transcript into a structured Vani Action if it clearly expresses one.
pub fn parse_voice_action(
    raw_text: &str,
    installed: &[InstalledApp],
    custom_aliases: &[AppAlias],
) -> Option<VoiceAction> {
    let trimmed = strip_leading_fillers(raw_text);
    if trimmed.is_empty() {
        return None;
    }

    let cleaned_end = trimmed
        .trim_end_matches(|c: char| matches!(c, '.' | '!' | '?' | ','))
        .trim();
    let lower = cleaned_end.to_lowercase();

    // 1. Standalone quick keyboard / hands-free control actions
    match lower.as_str() {
        "stop listening"
        | "stop hands free"
        | "stop hands-free"
        | "exit hands free"
        | "exit hands-free"
        | "turn off hands free"
        | "turn off hands-free"
        | "stop vani"
        | "goodbye vani" => {
            return Some(VoiceAction::StopHandsFree);
        }
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
                    press_enter: press_enter || true,
                });
            }
        }
    }

    // 3. "open/launch/switch to/go to <app> [and type/start typing/say/ask/send/message <payload>]"
    for prefix in [
        "open ",
        "launch ",
        "start ",
        "switch to ",
        "go to ",
        "focus ",
    ] {
        if let Some(after) = lower.strip_prefix(prefix) {
            let orig_after = &trimmed[prefix.len()..];

            let chain_markers: &[(&str, bool)] = &[
                (" and start typing ", true),
                (" and start dictating ", true),
                (" and type ", true),
                (" and write ", true),
                (" and say ", true),
                (" and ask ", true),
                (" and send ", true),
                (" and search ", true),
                (" and message ", true),
                (", start typing ", true),
                (", type ", true),
                (" then type ", true),
                (" then start typing ", true),
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
                                is_web: app.is_web,
                            });
                        }
                        let (payload, explicit_enter) = strip_trailing_enter(payload_raw);
                        return Some(VoiceAction::OpenAndType {
                            app_name: app.name,
                            app_path: app.path,
                            is_web: app.is_web,
                            text: payload,
                            press_enter: default_enter || explicit_enter,
                        });
                    }
                }
            }

            // "<app> and start typing" (chained open + hands-free typing!)
            for tail in [" and start typing", " then start typing", " and start dictating"] {
                if let Some(app_query) = after.strip_suffix(tail) {
                    if let Some(app) = resolve_app(app_query, installed, custom_aliases) {
                        return Some(VoiceAction::OpenAndType {
                            app_name: app.name,
                            app_path: app.path,
                            is_web: app.is_web,
                            text: String::new(),
                            press_enter: false,
                        });
                    }
                }
            }

            // Standalone "open <app>"
            let app_query = after
                .trim_end_matches(" app")
                .trim_end_matches(" application")
                .trim();
            if let Some(app) = resolve_app(app_query, installed, custom_aliases) {
                return Some(VoiceAction::OpenApp {
                    app_name: app.name,
                    app_path: app.path,
                    is_web: app.is_web,
                });
            }
        }
    }

    None
}

/// Launch or bring an application (or web app URL) to the foreground.
pub fn open_application(app_name: &str, app_path: &str, is_web: bool) -> Result<()> {
    #[cfg(target_os = "macos")]
    {
        use std::process::Command;
        if is_web || app_path.starts_with("http://") || app_path.starts_with("https://") {
            let status = Command::new("open").arg(app_path).status()?;
            if !status.success() {
                return Err(anyhow!("Could not open {}", app_name));
            }
            return Ok(());
        }

        let status = if !app_path.is_empty() && std::path::Path::new(app_path).exists() {
            Command::new("open").arg(app_path).status()?
        } else {
            Command::new("open").args(["-a", app_name]).status()?
        };
        if !status.success() {
            return Err(anyhow!("Could not open {}", app_name));
        }
        Ok(())
    }

    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        let _ = is_web;
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
        let _ = (app_name, app_path, is_web);
        Err(anyhow!("App launching not supported on this OS"))
    }
}

/// Best-effort focus of the primary chat / text input area inside the active app.
/// If a text input is already focused, leaves focus untouched.
pub fn focus_chat_or_input_box(app_name: Option<&str>) {
    #[cfg(target_os = "macos")]
    {
        use std::process::Command;
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
        let _ = app_name;
        std::thread::sleep(Duration::from_millis(250));
    }
}

/// Execute a parsed Vani Action end-to-end.
pub fn execute_action(
    action: &VoiceAction,
    frontmost_app: Option<&str>,
    hands_free_mode: bool,
    auto_send: bool,
) -> Result<ActionExecutionResult> {
    match action {
        VoiceAction::StopHandsFree => Ok(ActionExecutionResult {
            ok: true,
            action_kind: "stopHandsFree".into(),
            summary: "Hands-free mode stopped".into(),
            follow_up_dictation: false,
            stop_hands_free: true,
            target_app: None,
        }),
        VoiceAction::OpenApp {
            app_name,
            app_path,
            is_web,
        } => {
            open_application(app_name, app_path, *is_web)?;
            std::thread::sleep(Duration::from_millis(if *is_web { 900 } else { 500 }));
            focus_chat_or_input_box(if *is_web { None } else { Some(app_name) });
            Ok(ActionExecutionResult {
                ok: true,
                action_kind: "openApp".into(),
                summary: if *is_web {
                    format!("Opened {} in browser", app_name)
                } else {
                    format!("Opened {}", app_name)
                },
                follow_up_dictation: hands_free_mode,
                stop_hands_free: false,
                target_app: if *is_web { None } else { Some(app_name.clone()) },
            })
        }
        VoiceAction::OpenAndType {
            app_name,
            app_path,
            is_web,
            text,
            press_enter,
        } => {
            open_application(app_name, app_path, *is_web)?;
            std::thread::sleep(Duration::from_millis(if *is_web { 1500 } else { 800 }));
            focus_chat_or_input_box(if *is_web { None } else { Some(app_name) });

            if text.is_empty() {
                return Ok(ActionExecutionResult {
                    ok: true,
                    action_kind: "openAndStartTyping".into(),
                    summary: format!("Opened {} — listening…", app_name),
                    follow_up_dictation: true,
                    stop_hands_free: false,
                    target_app: if *is_web { None } else { Some(app_name.clone()) },
                });
            }

            #[cfg(target_os = "macos")]
            crate::inject::paste_to_app(text, if *is_web { None } else { Some(app_name) })?;
            #[cfg(not(target_os = "macos"))]
            crate::inject::paste_to_app(text, None)?;

            if *press_enter || (hands_free_mode && auto_send) {
                std::thread::sleep(Duration::from_millis(120));
                crate::inject::send_enter()?;
            }

            Ok(ActionExecutionResult {
                ok: true,
                action_kind: "openAndType".into(),
                summary: format!("Opened {} & sent", app_name),
                follow_up_dictation: hands_free_mode,
                stop_hands_free: false,
                target_app: if *is_web { None } else { Some(app_name.clone()) },
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
                    if *press_enter || (hands_free_mode && auto_send) {
                        std::thread::sleep(Duration::from_millis(120));
                        crate::inject::send_enter()?;
                    }
                    return Ok(ActionExecutionResult {
                        ok: true,
                        action_kind: "typeText".into(),
                        summary: "Typed & sent".into(),
                        follow_up_dictation: hands_free_mode,
                        stop_hands_free: false,
                        target_app: frontmost_app.map(|s| s.to_string()),
                    });
                }
            }

            Ok(ActionExecutionResult {
                ok: true,
                action_kind: "startTyping".into(),
                summary: "Hands-free listening active".into(),
                follow_up_dictation: true,
                stop_hands_free: false,
                target_app: frontmost_app.map(|s| s.to_string()),
            })
        }
        VoiceAction::PressEnter => {
            crate::inject::send_enter()?;
            Ok(ActionExecutionResult {
                ok: true,
                action_kind: "pressEnter".into(),
                summary: "Pressed Enter".into(),
                follow_up_dictation: hands_free_mode,
                stop_hands_free: false,
                target_app: frontmost_app.map(|s| s.to_string()),
            })
        }
        VoiceAction::NewLine => {
            crate::inject::send_shift_enter()?;
            Ok(ActionExecutionResult {
                ok: true,
                action_kind: "newLine".into(),
                summary: "Inserted new line".into(),
                follow_up_dictation: hands_free_mode,
                stop_hands_free: false,
                target_app: frontmost_app.map(|s| s.to_string()),
            })
        }
        VoiceAction::SelectAll => {
            crate::inject::send_select_all()?;
            Ok(ActionExecutionResult {
                ok: true,
                action_kind: "selectAll".into(),
                summary: "Selected all text".into(),
                follow_up_dictation: hands_free_mode,
                stop_hands_free: false,
                target_app: frontmost_app.map(|s| s.to_string()),
            })
        }
        VoiceAction::ClearInput => {
            crate::inject::send_clear_input()?;
            Ok(ActionExecutionResult {
                ok: true,
                action_kind: "clearInput".into(),
                summary: "Cleared input box".into(),
                follow_up_dictation: hands_free_mode,
                stop_hands_free: false,
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
            InstalledApp { name: "Antigravity".into(), path: "/Applications/Antigravity.app".into(), is_web: false },
            InstalledApp { name: "ChatGPT".into(), path: "/Applications/ChatGPT.app".into(), is_web: false },
            InstalledApp { name: "Music".into(), path: "/System/Applications/Music.app".into(), is_web: false },
            InstalledApp { name: "Google Chrome".into(), path: "/Applications/Google Chrome.app".into(), is_web: false },
            InstalledApp { name: "Slack".into(), path: "/Applications/Slack.app".into(), is_web: false },
            InstalledApp { name: "Visual Studio Code".into(), path: "/Applications/Visual Studio Code.app".into(), is_web: false },
        ]
    }

    #[test]
    fn parses_apple_music_chatgpt_claude_and_antigravity() {
        let apps = sample_apps();
        // Apple Music -> /System/Applications/Music.app
        match parse_voice_action("Open Apple Music.", &apps, &[]) {
            Some(VoiceAction::OpenApp { app_name, is_web, .. }) => {
                assert_eq!(app_name, "Music");
                assert!(!is_web);
            }
            other => panic!("Expected Music, got {:?}", other),
        }
        // ChatGPT & STT variants + leading fillers
        for p in ["open chatgpt", "Um, open Chat GPT.", "please open chat GBT", "can you open chat g p t"] {
            match parse_voice_action(p, &apps, &[]) {
                Some(VoiceAction::OpenApp { app_name, is_web, .. }) => {
                    assert_eq!(app_name, "ChatGPT");
                    assert!(!is_web);
                }
                other => panic!("Expected ChatGPT for {:?}, got {:?}", p, other),
            }
        }
        // Claude / Claude AI -> web fallback https://claude.ai when not installed locally
        for p in ["open claude", "Open Claude AI.", "open Claude A"] {
            match parse_voice_action(p, &apps, &[]) {
                Some(VoiceAction::OpenApp { app_name, app_path, is_web }) => {
                    assert_eq!(app_name, "Claude");
                    assert_eq!(app_path, "https://claude.ai");
                    assert!(is_web);
                }
                other => panic!("Expected Claude web fallback for {:?}, got {:?}", p, other),
            }
        }
        // Antigravity fuzzy variants
        for p in ["open antigravity", "Open Anti Gravity.", "launch anti-gravity", "switch to antigravty"] {
            match parse_voice_action(p, &apps, &[]) {
                Some(VoiceAction::OpenApp { app_name, .. }) => assert_eq!(app_name, "Antigravity"),
                other => panic!("Expected Antigravity for {:?}, got {:?}", p, other),
            }
        }
    }

    #[test]
    fn parses_chained_open_and_type_and_stop_hands_free() {
        let apps = sample_apps();
        match parse_voice_action("Open Antigravity and type build a dark mode toggle", &apps, &[]) {
            Some(VoiceAction::OpenAndType { app_name, text, press_enter, .. }) => {
                assert_eq!(app_name, "Antigravity");
                assert_eq!(text, "build a dark mode toggle");
                assert!(press_enter);
            }
            other => panic!("Unexpected: {:?}", other),
        }
        assert!(matches!(parse_voice_action("Stop listening.", &apps, &[]), Some(VoiceAction::StopHandsFree)));
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
}

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
    BrowserNewTab {
        browser_name: Option<String>,
        browser_path: Option<String>,
        query: Option<String>,
    },
    BrowserCloseTab,
    BrowserSearchSite {
        site_name: String,
        url: String,
        query: String,
    },
    OpenSettingsPane {
        pane_name: String,
        target_uri: String,
    },
    OpenFolder {
        folder_name: String,
        folder_path: String,
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

fn is_browser_name(name: &str) -> bool {
    let n = name.to_lowercase();
    n.contains("safari")
        || n.contains("chrome")
        || n.contains("brave")
        || n.contains("edge")
        || n.contains("firefox")
        || n.contains("arc")
        || n.contains("opera")
        || n.contains("vivaldi")
}

fn encode_url_component(s: &str) -> String {
    let mut out = String::with_capacity(s.len() * 2);
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char);
            }
            b' ' => out.push('+'),
            _ => out.push_str(&format!("%{:02X}", b)),
        }
    }
    out
}

fn strip_search_verb(raw: &str) -> String {
    let mut s = raw
        .trim()
        .trim_end_matches(|c: char| matches!(c, '.' | '!' | '?'))
        .trim();
    loop {
        let lower = s.to_lowercase();
        let mut stripped = false;
        for p in [
            "start searching for ",
            "start searching ",
            "searching for ",
            "searching ",
            "search for ",
            "search ",
            "look up ",
            "lookup ",
            "go to ",
            "open ",
            "for ",
        ] {
            if lower.starts_with(p) {
                s = s[p.len()..].trim();
                stripped = true;
                break;
            }
        }
        if !stripped {
            break;
        }
    }
    s.to_string()
}

/// Cross-platform System Settings deep links:
/// `(display_name, macos_uri, windows_uri, spoken_aliases)`.
fn settings_panes() -> &'static [(&'static str, &'static str, &'static str, &'static [&'static str])] {
    &[
        (
            "Wi-Fi",
            "x-apple.systempreferences:com.apple.wifi-settings-extension",
            "ms-settings:network-wifi",
            &["wifi", "wi-fi", "wi fi", "wireless", "wlan", "wife i", "why fi"],
        ),
        (
            "Bluetooth",
            "x-apple.systempreferences:com.apple.BluetoothSettings",
            "ms-settings:bluetooth",
            &["bluetooth", "blue tooth"],
        ),
        (
            "Notifications",
            "x-apple.systempreferences:com.apple.Notifications-Settings.extension",
            "ms-settings:notifications",
            &["notification", "notifications", "notification center", "notifications center", "alerts"],
        ),
        (
            "Mouse",
            "x-apple.systempreferences:com.apple.Mouse-Settings.extension",
            "ms-settings:mousetouchpad",
            &["mouse", "pointer", "cursor"],
        ),
        (
            "Trackpad",
            "x-apple.systempreferences:com.apple.Trackpad-Settings.extension",
            "ms-settings:devices-touchpad",
            &["trackpad", "track pad", "touchpad", "touch pad"],
        ),
        (
            "Keyboard",
            "x-apple.systempreferences:com.apple.Keyboard-Settings.extension",
            "ms-settings:typing",
            &["keyboard", "key board", "keypad", "key pad", "typing", "keyboard shortcuts", "input sources"],
        ),
        (
            "Sound",
            "x-apple.systempreferences:com.apple.Sound-Settings.extension",
            "ms-settings:sound",
            &["sound", "sounds", "audio", "volume", "microphone", "speaker", "speakers"],
        ),
        (
            "Displays",
            "x-apple.systempreferences:com.apple.Displays-Settings.extension",
            "ms-settings:display",
            &["display", "displays", "monitor", "monitors", "brightness", "resolution"],
        ),
        (
            "Battery",
            "x-apple.systempreferences:com.apple.Battery-Settings.extension",
            "ms-settings:powersleep",
            &["battery", "power", "energy", "power and battery"],
        ),
        (
            "Network",
            "x-apple.systempreferences:com.apple.Network-Settings.extension",
            "ms-settings:network-status",
            &["network", "internet", "ethernet", "network and internet"],
        ),
        (
            "VPN",
            "x-apple.systempreferences:com.apple.NetworkExtensionSettingsUI.NESettingsUIExtension",
            "ms-settings:network-vpn",
            &["vpn"],
        ),
        (
            "Appearance",
            "x-apple.systempreferences:com.apple.Appearance-Settings.extension",
            "ms-settings:personalization",
            &["appearance", "dark mode", "light mode", "theme", "themes", "personalization"],
        ),
        (
            "Wallpaper",
            "x-apple.systempreferences:com.apple.Wallpaper-Settings.extension",
            "ms-settings:personalization-background",
            &["wallpaper", "wallpapers", "background", "desktop background"],
        ),
        (
            "Desktop & Dock",
            "x-apple.systempreferences:com.apple.Desktop-Settings.extension",
            "ms-settings:taskbar",
            &["dock", "desktop and dock", "taskbar", "stage manager"],
        ),
        (
            "Control Center",
            "x-apple.systempreferences:com.apple.ControlCenter-Settings.extension",
            "ms-settings:notifications",
            &["control center", "control centre", "menu bar"],
        ),
        (
            "Focus",
            "x-apple.systempreferences:com.apple.Focus-Settings.extension",
            "ms-settings:quiethours",
            &["focus", "do not disturb", "dnd"],
        ),
        (
            "Privacy & Security",
            "x-apple.systempreferences:com.apple.settings.PrivacySecurity.extension",
            "ms-settings:privacy",
            &["privacy", "security", "privacy and security", "security and privacy", "permissions"],
        ),
        (
            "Accessibility",
            "x-apple.systempreferences:com.apple.Accessibility-Settings.extension",
            "ms-settings:easeofaccess",
            &["accessibility"],
        ),
        (
            "General",
            "x-apple.systempreferences:com.apple.systempreferences.GeneralSettings",
            "ms-settings:about",
            &["general", "about this mac", "system info"],
        ),
        (
            "Software Update",
            "x-apple.systempreferences:com.apple.Software-Update-Settings.extension",
            "ms-settings:windowsupdate",
            &["software update", "software updates", "system update", "macos update", "windows update", "updates"],
        ),
        (
            "Storage",
            "x-apple.systempreferences:com.apple.settings.Storage",
            "ms-settings:storagesense",
            &["storage", "disk space"],
        ),
        (
            "AirDrop & Handoff",
            "x-apple.systempreferences:com.apple.AirDrop-Handoff-Settings.extension",
            "ms-settings:crossdevice",
            &["airdrop", "air drop", "handoff", "airdrop and handoff"],
        ),
        (
            "Apple Intelligence & Siri",
            "x-apple.systempreferences:com.apple.Siri-Settings.extension",
            "ms-settings:cortana",
            &["siri", "apple intelligence", "apple intelligence and siri"],
        ),
        (
            "Lock Screen",
            "x-apple.systempreferences:com.apple.Lock-Screen-Settings.extension",
            "ms-settings:lockscreen",
            &["lock screen", "lockscreen", "screen saver", "screensaver"],
        ),
        (
            "Touch ID & Password",
            "x-apple.systempreferences:com.apple.Touch-ID-Settings.extension",
            "ms-settings:signinoptions",
            &["touch id", "touchid", "fingerprint", "login password"],
        ),
        (
            "Users & Groups",
            "x-apple.systempreferences:com.apple.Users-Groups-Settings.extension",
            "ms-settings:accounts",
            &["users", "users and groups", "accounts", "user accounts"],
        ),
        (
            "Date & Time",
            "x-apple.systempreferences:com.apple.Date-Time-Settings.extension",
            "ms-settings:dateandtime",
            &["date and time", "date time", "time zone"],
        ),
        (
            "Language & Region",
            "x-apple.systempreferences:com.apple.Localization-Settings.extension",
            "ms-settings:regionlanguage",
            &["language", "language and region", "region"],
        ),
        (
            "Sharing",
            "x-apple.systempreferences:com.apple.Sharing-Settings.extension",
            "ms-settings:crossdevice",
            &["sharing", "file sharing", "screen sharing"],
        ),
        (
            "Printers & Scanners",
            "x-apple.systempreferences:com.apple.Print-Scan-Settings.extension",
            "ms-settings:printers",
            &["printer", "printers", "printers and scanners", "scanner", "scanners"],
        ),
        (
            "Login Items",
            "x-apple.systempreferences:com.apple.LoginItems-Settings.extension",
            "ms-settings:startupapps",
            &["login items", "startup", "startup apps"],
        ),
        (
            "Screen Time",
            "x-apple.systempreferences:com.apple.Screen-Time-Settings.extension",
            "ms-settings:family-group",
            &["screen time", "screentime"],
        ),
        (
            "Spotlight",
            "x-apple.systempreferences:com.apple.Spotlight-Settings.extension",
            "ms-settings:search",
            &["spotlight"],
        ),
        (
            "Time Machine",
            "x-apple.systempreferences:com.apple.Time-Machine-Settings.extension",
            "ms-settings:backup",
            &["time machine", "backup"],
        ),
        (
            "Apple Account",
            "x-apple.systempreferences:com.apple.systempreferences.AppleIDSettings",
            "ms-settings:yourinfo",
            &["apple id", "apple account", "icloud account"],
        ),
    ]
}

fn parse_settings_pane_action(lower: &str) -> Option<VoiceAction> {
    let mut s = lower.trim();
    let mut had_settings_wrapper = false;

    // Strip chained settings wrappers, e.g.:
    // "open settings, go to wi-fi settings"
    // "open system settings and go to bluetooth"
    // "in settings, open mouse settings"
    for wrapper in [
        "open system settings",
        "go to system settings",
        "launch system settings",
        "open system preferences",
        "go to system preferences",
        "in system settings",
        "within system settings",
        "open settings",
        "go to settings",
        "launch settings",
        "open preferences",
        "go to preferences",
        "in settings",
        "within settings",
        "inside settings",
    ] {
        if let Some(rest) = s.strip_prefix(wrapper) {
            let rest = rest.trim_start();
            // If user only said "open settings", let normal OpenApp("System Settings") handle it.
            if rest.is_empty() {
                return None;
            }
            let stripped_sep = rest
                .trim_start_matches(|c: char| matches!(c, ',' | '.' | ';' | ':' | '-' | '—' | ' '))
                .strip_prefix("and ")
                .or_else(|| {
                    rest.trim_start_matches(|c: char| matches!(c, ',' | '.' | ';' | ':' | '-' | '—' | ' '))
                        .strip_prefix("then ")
                })
                .unwrap_or_else(|| {
                    rest.trim_start_matches(|c: char| matches!(c, ',' | '.' | ';' | ':' | '-' | '—' | ' '))
                })
                .trim();
            if !stripped_sep.is_empty() {
                s = stripped_sep;
                had_settings_wrapper = true;
                break;
            }
        }
    }

    // Strip optional leading navigation verb
    let mut had_verb = false;
    for verb in [
        "go to ",
        "open up ",
        "open ",
        "show me ",
        "show ",
        "switch to ",
        "launch ",
        "select ",
        "click on ",
        "click ",
        "navigate to ",
        "view ",
    ] {
        if let Some(rest) = s.strip_prefix(verb) {
            s = rest.trim();
            had_verb = true;
            break;
        }
    }

    // Strip optional leading articles
    for art in ["the ", "my "] {
        if let Some(rest) = s.strip_prefix(art) {
            s = rest.trim();
            break;
        }
    }

    // Strip optional trailing settings nouns ("settings", "manager", "preferences", "pane", etc.)
    let mut had_settings_suffix = false;
    loop {
        let mut stripped = false;
        for suf in [
            " settings",
            " setting",
            " preferences",
            " preference",
            " manager",
            " panel",
            " pane",
            " section",
            " page",
            " menu",
            " options",
            " tab",
        ] {
            if let Some(rest) = s.strip_suffix(suf) {
                s = rest.trim();
                had_settings_suffix = true;
                stripped = true;
                break;
            }
        }
        if !stripped {
            break;
        }
    }

    // Safety guard: require either an explicit wrapper/verb or an explicit settings/manager suffix
    // so normal dictation never triggers a Settings pane by accident.
    if !had_settings_wrapper && !had_verb && !had_settings_suffix {
        return None;
    }
    if s.is_empty() || s.split_whitespace().count() > 4 {
        return None;
    }

    let query_norm = normalize_key(s);
    if query_norm.len() < 3 {
        return None;
    }

    for &(pane_name, mac_uri, win_uri, aliases) in settings_panes() {
        let matched = aliases.iter().any(|a| normalize_key(a) == query_norm)
            || normalize_key(pane_name) == query_norm;
        if matched {
            #[cfg(target_os = "windows")]
            let uri = win_uri;
            #[cfg(not(target_os = "windows"))]
            let uri = {
                let _ = win_uri;
                mac_uri
            };
            return Some(VoiceAction::OpenSettingsPane {
                pane_name: pane_name.to_string(),
                target_uri: uri.to_string(),
            });
        }
    }

    None
}

fn resolve_known_folder(
    key: &str,
    allow_media_ambiguous: bool,
) -> Option<(String, String)> {
    #[cfg(target_os = "windows")]
    let home = std::env::var("USERPROFILE").unwrap_or_else(|_| "C:\\Users".into());
    #[cfg(not(target_os = "windows"))]
    let home = std::env::var("HOME").unwrap_or_else(|_| "/Users".into());

    let join_home = |sub: &str| -> String {
        PathBuf::from(&home).join(sub).to_string_lossy().to_string()
    };

    match key {
        "downloads" | "download" => Some(("Downloads".into(), join_home("Downloads"))),
        "applications" | "apps" => {
            #[cfg(target_os = "windows")]
            {
                Some(("Applications".into(), "shell:AppsFolder".into()))
            }
            #[cfg(not(target_os = "windows"))]
            {
                Some(("Applications".into(), "/Applications".into()))
            }
        }
        "desktop" => Some(("Desktop".into(), join_home("Desktop"))),
        "documents" | "document" | "docs" => Some(("Documents".into(), join_home("Documents"))),
        "home" | "user" | "userprofile" => Some(("Home".into(), home)),
        "pictures" | "picture" => Some(("Pictures".into(), join_home("Pictures"))),
        "photos" if allow_media_ambiguous => Some(("Pictures".into(), join_home("Pictures"))),
        "movies" | "movie" | "videos" | "video" => {
            #[cfg(target_os = "windows")]
            {
                Some(("Videos".into(), join_home("Videos")))
            }
            #[cfg(not(target_os = "windows"))]
            {
                Some(("Movies".into(), join_home("Movies")))
            }
        }
        "music" if allow_media_ambiguous => Some(("Music".into(), join_home("Music"))),
        "trash" | "bin" | "trashbin" | "recyclebin" => {
            #[cfg(target_os = "windows")]
            {
                Some(("Recycle Bin".into(), "shell:RecycleBinFolder".into()))
            }
            #[cfg(not(target_os = "windows"))]
            {
                Some(("Trash".into(), join_home(".Trash")))
            }
        }
        "recents" | "recent" | "recentfiles" => {
            #[cfg(target_os = "windows")]
            {
                Some(("Recents".into(), "shell:Recent".into()))
            }
            #[cfg(not(target_os = "windows"))]
            {
                let canned = "/System/Library/CoreServices/Finder.app/Contents/Resources/MyLibraries/myDocuments.cannedSearch";
                if std::path::Path::new(canned).exists() {
                    Some(("Recents".into(), canned.into()))
                } else {
                    Some(("Home".into(), home))
                }
            }
        }
        "icloud" | "iclouddrive" => {
            #[cfg(target_os = "macos")]
            {
                Some((
                    "iCloud Drive".into(),
                    join_home("Library/Mobile Documents/com~apple~CloudDocs"),
                ))
            }
            #[cfg(not(target_os = "macos"))]
            {
                None
            }
        }
        "developer" => {
            let p = join_home("Developer");
            if allow_media_ambiguous || std::path::Path::new(&p).exists() {
                Some(("Developer".into(), p))
            } else {
                None
            }
        }
        _ => None,
    }
}

fn parse_folder_action(lower: &str, installed: &[InstalledApp]) -> Option<VoiceAction> {
    let mut s = lower.trim();

    // Standalone "go to find" / "open find" (frequent STT transcription of "Finder")
    if matches!(s, "go to find" | "open find" | "switch to find") {
        if let Some(app) = installed
            .iter()
            .find(|a| normalize_key(&a.name) == "finder" || normalize_key(&a.name) == "fileexplorer")
        {
            return Some(VoiceAction::OpenApp {
                app_name: app.name.clone(),
                app_path: app.path.clone(),
                is_web: false,
            });
        }
    }

    // Strip optional leading Finder / File Explorer chain wrapper, e.g.:
    // "go to find, open the downloads"
    // "go to finder, open applications"
    // "open finder and go to downloads"
    // "open file explorer, open downloads"
    let mut had_finder_wrapper = false;
    for wrapper in [
        "go to file explorer",
        "open file explorer",
        "switch to file explorer",
        "in file explorer",
        "go to explorer",
        "open explorer",
        "in explorer",
        "go to finder",
        "open finder",
        "switch to finder",
        "in finder",
        "inside finder",
        "from finder",
        "go to find",
        "open find",
        "in find",
    ] {
        if let Some(rest) = s.strip_prefix(wrapper) {
            let rest = rest.trim_start();
            if rest.is_empty() {
                return None;
            }
            let stripped_sep = rest
                .trim_start_matches(|c: char| matches!(c, ',' | '.' | ';' | ':' | '-' | '—' | ' '))
                .strip_prefix("and ")
                .or_else(|| {
                    rest.trim_start_matches(|c: char| matches!(c, ',' | '.' | ';' | ':' | '-' | '—' | ' '))
                        .strip_prefix("then ")
                })
                .unwrap_or_else(|| {
                    rest.trim_start_matches(|c: char| matches!(c, ',' | '.' | ';' | ':' | '-' | '—' | ' '))
                })
                .trim();
            if !stripped_sep.is_empty() {
                s = stripped_sep;
                had_finder_wrapper = true;
                break;
            }
        }
    }

    // Strip optional verb prefix
    let mut had_verb = false;
    for verb in [
        "open up ",
        "open ",
        "go to ",
        "show me ",
        "show ",
        "view ",
        "browse ",
        "launch ",
        "switch to ",
        "navigate to ",
    ] {
        if let Some(rest) = s.strip_prefix(verb) {
            s = rest.trim();
            had_verb = true;
            break;
        }
    }

    // Strip optional articles ("the ", "my ")
    for art in ["the ", "my "] {
        if let Some(rest) = s.strip_prefix(art) {
            s = rest.trim();
            break;
        }
    }

    // Strip optional trailing folder/directory nouns
    let mut had_folder_suffix = false;
    for suf in [" folder", " directory", " tab", " window"] {
        if let Some(rest) = s.strip_suffix(suf) {
            s = rest.trim();
            had_folder_suffix = true;
            break;
        }
    }

    if !had_finder_wrapper && !had_verb && !had_folder_suffix {
        return None;
    }
    if s.is_empty() || s.split_whitespace().count() > 3 {
        return None;
    }

    let key = normalize_key(s);
    if let Some((folder_name, folder_path)) =
        resolve_known_folder(&key, had_finder_wrapper || had_folder_suffix)
    {
        return Some(VoiceAction::OpenFolder {
            folder_name,
            folder_path,
        });
    }

    None
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

    // 1. Standalone quick keyboard / tab / hands-free control actions
    match lower.as_str() {
        "stop listening"
        | "done listening"
        | "stop hands free"
        | "stop hands-free"
        | "exit hands free"
        | "exit hands-free"
        | "turn off hands free"
        | "turn off hands-free"
        | "close hands free"
        | "close hands-free"
        | "end hands free"
        | "end hands-free"
        | "cancel hands free"
        | "cancel hands-free"
        | "stop vani"
        | "goodbye vani" => {
            return Some(VoiceAction::StopHandsFree);
        }
        "close tab" | "close this tab" | "close the tab" => {
            return Some(VoiceAction::BrowserCloseTab);
        }
        "new tab" | "open new tab" | "open a new tab" => {
            return Some(VoiceAction::BrowserNewTab {
                browser_name: None,
                browser_path: None,
                query: None,
            });
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

    // 1.5 Browser New Tab + optional browser + optional search/query:
    // e.g. "open new tab on Safari and start searching Netflix"
    //      "open a new tab in Chrome and search weather"
    //      "open new tab on Safari"
    //      "new tab and search Netflix"
    for nt_prefix in ["open a new tab", "open new tab", "new tab"] {
        if let Some(rest_lower) = lower.strip_prefix(nt_prefix) {
            let orig_rest = trimmed[nt_prefix.len()..].trim();
            let rest_lower = rest_lower.trim();

            // Split optional " and ..." / " then ..." clause
            let mut browser_part = rest_lower;
            let mut query_part: Option<String> = None;

            for sep in [" and ", ", and ", " then ", ", "] {
                if let Some(idx) = rest_lower.find(sep) {
                    browser_part = rest_lower[..idx].trim();
                    let raw_q = &orig_rest[idx + sep.len()..];
                    let q = strip_search_verb(raw_q);
                    if !q.is_empty() {
                        query_part = Some(q);
                    }
                    break;
                }
            }

            // If there was no "and", check "open new tab on/in <browser>"
            let mut browser_name = None;
            let mut browser_path = None;
            if !browser_part.is_empty() {
                let candidate = browser_part
                    .strip_prefix("on ")
                    .or_else(|| browser_part.strip_prefix("in "))
                    .unwrap_or(browser_part)
                    .trim();
                if let Some(app) = resolve_app(candidate, installed, custom_aliases) {
                    if !app.is_web {
                        browser_name = Some(app.name);
                        browser_path = Some(app.path);
                    }
                } else if query_part.is_none() {
                    // Maybe "new tab search Netflix"
                    let q = strip_search_verb(orig_rest);
                    if !q.is_empty() && q.to_lowercase() != rest_lower {
                        query_part = Some(q);
                    }
                }
            }

            if browser_name.is_some() || query_part.is_some() {
                return Some(VoiceAction::BrowserNewTab {
                    browser_name,
                    browser_path,
                    query: query_part,
                });
            }
        }
    }

    // 1.6 Direct "search [for] <query> on/in <browser or YouTube/Google>"
    for s_prefix in ["start searching for ", "start searching ", "search for ", "search "] {
        if let Some(after_s) = lower.strip_prefix(s_prefix) {
            let orig_after = trimmed[s_prefix.len()..].trim();
            for prep in [" on ", " in "] {
                if let Some(idx) = after_s.rfind(prep) {
                    let q = orig_after[..idx].trim().trim_end_matches(|c: char| matches!(c, '.' | '!' | '?')).to_string();
                    let target = after_s[idx + prep.len()..].trim();
                    if !q.is_empty() && !target.is_empty() {
                        if target == "youtube" {
                            return Some(VoiceAction::BrowserSearchSite {
                                site_name: "YouTube".into(),
                                url: format!("https://www.youtube.com/results?search_query={}", encode_url_component(&q)),
                                query: q,
                            });
                        }
                        if target == "google" {
                            return Some(VoiceAction::BrowserSearchSite {
                                site_name: "Google".into(),
                                url: format!("https://www.google.com/search?q={}", encode_url_component(&q)),
                                query: q,
                            });
                        }
                        if let Some(app) = resolve_app(target, installed, custom_aliases) {
                            if !app.is_web && is_browser_name(&app.name) {
                                return Some(VoiceAction::BrowserNewTab {
                                    browser_name: Some(app.name),
                                    browser_path: Some(app.path),
                                    query: Some(q),
                                });
                            }
                        }
                    }
                }
            }
        }
    }

    // 1.7 System Settings sub-panes (e.g. "open settings, go to Wi-Fi settings",
    //     "open settings, go to Bluetooth settings", "notification manager",
    //     "mouse settings", "keypad settings")
    if let Some(action) = parse_settings_pane_action(&lower) {
        return Some(action);
    }

    // 1.8 Finder / File Explorer folders (e.g. "go to find, open the downloads",
    //     "go to finder, open applications", "open the downloads", "open applications")
    if let Some(action) = parse_folder_action(&lower, installed) {
        return Some(action);
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
                (" and start searching for ", true),
                (" and start searching ", true),
                (" and search for ", true),
                (" and search ", true),
                (" and start typing ", true),
                (" and start dictating ", true),
                (" and type ", true),
                (" and write ", true),
                (" and say ", true),
                (" and ask ", true),
                (" and send ", true),
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
                        // If target is a browser and user said "search", open a fresh tab first!
                        if !app.is_web && is_browser_name(&app.name) && marker.contains("search") {
                            return Some(VoiceAction::BrowserNewTab {
                                browser_name: Some(app.name),
                                browser_path: Some(app.path),
                                query: Some(payload),
                            });
                        }
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
        VoiceAction::BrowserNewTab {
            browser_name,
            browser_path,
            query,
        } => {
            if let Some(name) = browser_name {
                open_application(name, browser_path.as_deref().unwrap_or(""), false)?;
                std::thread::sleep(Duration::from_millis(550));
            }
            crate::inject::send_new_tab()?;
            std::thread::sleep(Duration::from_millis(260));

            if let Some(q) = query {
                if !q.is_empty() {
                    #[cfg(target_os = "macos")]
                    crate::inject::paste_to_app(q, browser_name.as_deref())?;
                    #[cfg(not(target_os = "macos"))]
                    crate::inject::paste_to_app(q, None)?;

                    std::thread::sleep(Duration::from_millis(120));
                    crate::inject::send_enter()?;
                }
            }

            let label = browser_name.as_deref().unwrap_or("browser");
            let summary = match query {
                Some(q) if !q.is_empty() => format!("Opened new tab in {} & searched “{}”", label, q),
                _ => format!("Opened new tab in {}", label),
            };
            Ok(ActionExecutionResult {
                ok: true,
                action_kind: "browserNewTab".into(),
                summary,
                follow_up_dictation: hands_free_mode,
                stop_hands_free: false,
                target_app: browser_name.clone().or_else(|| frontmost_app.map(|s| s.to_string())),
            })
        }
        VoiceAction::BrowserCloseTab => {
            crate::inject::send_close_tab()?;
            Ok(ActionExecutionResult {
                ok: true,
                action_kind: "browserCloseTab".into(),
                summary: "Closed active tab".into(),
                follow_up_dictation: hands_free_mode,
                stop_hands_free: false,
                target_app: frontmost_app.map(|s| s.to_string()),
            })
        }
        VoiceAction::BrowserSearchSite {
            site_name,
            url,
            query,
        } => {
            open_application(site_name, url, true)?;
            Ok(ActionExecutionResult {
                ok: true,
                action_kind: "browserSearchSite".into(),
                summary: format!("Searched “{}” on {}", query, site_name),
                follow_up_dictation: hands_free_mode,
                stop_hands_free: false,
                target_app: None,
            })
        }
        VoiceAction::OpenSettingsPane {
            pane_name,
            target_uri,
        } => {
            open_application(pane_name, target_uri, true)?;
            Ok(ActionExecutionResult {
                ok: true,
                action_kind: "openSettingsPane".into(),
                summary: format!("Opened {} Settings", pane_name),
                follow_up_dictation: hands_free_mode,
                stop_hands_free: false,
                target_app: Some(if cfg!(target_os = "macos") {
                    "System Settings".into()
                } else {
                    "Settings".into()
                }),
            })
        }
        VoiceAction::OpenFolder {
            folder_name,
            folder_path,
        } => {
            #[cfg(target_os = "macos")]
            {
                let status = std::process::Command::new("open")
                    .arg(folder_path)
                    .status()?;
                if !status.success() {
                    return Err(anyhow!("Could not open folder {}", folder_name));
                }
            }
            #[cfg(target_os = "windows")]
            {
                let status = std::process::Command::new("cmd")
                    .args(["/C", "start", "", folder_path])
                    .status()?;
                if !status.success() {
                    return Err(anyhow!("Could not open folder {}", folder_name));
                }
            }
            #[cfg(not(any(target_os = "macos", target_os = "windows")))]
            {
                let _ = folder_path;
                return Err(anyhow!("Opening folders is not supported on this OS"));
            }

            Ok(ActionExecutionResult {
                ok: true,
                action_kind: "openFolder".into(),
                summary: format!("Opened {} folder", folder_name),
                follow_up_dictation: hands_free_mode,
                stop_hands_free: false,
                target_app: Some(if cfg!(target_os = "macos") {
                    "Finder".into()
                } else {
                    "File Explorer".into()
                }),
            })
        }
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
            InstalledApp { name: "Safari".into(), path: "/System/Applications/Safari.app".into(), is_web: false },
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
    fn parses_browser_new_tab_and_search_commands() {
        let apps = sample_apps();
        match parse_voice_action("open new tab on Safari and start searching Netflix", &apps, &[]) {
            Some(VoiceAction::BrowserNewTab { browser_name, query, .. }) => {
                assert_eq!(browser_name.as_deref(), Some("Safari"));
                assert_eq!(query.as_deref(), Some("Netflix"));
            }
            other => panic!("Expected BrowserNewTab(Safari, Netflix), got {:?}", other),
        }

        match parse_voice_action("open a new tab in Chrome and search best keyboards", &apps, &[]) {
            Some(VoiceAction::BrowserNewTab { browser_name, query, .. }) => {
                assert_eq!(browser_name.as_deref(), Some("Google Chrome"));
                assert_eq!(query.as_deref(), Some("best keyboards"));
            }
            other => panic!("Unexpected: {:?}", other),
        }

        match parse_voice_action("search lo-fi beats on YouTube", &apps, &[]) {
            Some(VoiceAction::BrowserSearchSite { site_name, url, query }) => {
                assert_eq!(site_name, "YouTube");
                assert_eq!(query, "lo-fi beats");
                assert!(url.contains("youtube.com/results?search_query=lo-fi+beats"));
            }
            other => panic!("Unexpected: {:?}", other),
        }

        match parse_voice_action("open Safari and start searching Netflix", &apps, &[]) {
            Some(VoiceAction::BrowserNewTab { browser_name, query, .. }) => {
                assert_eq!(browser_name.as_deref(), Some("Safari"));
                assert_eq!(query.as_deref(), Some("Netflix"));
            }
            other => panic!("Unexpected: {:?}", other),
        }

        assert!(matches!(parse_voice_action("new tab", &apps, &[]), Some(VoiceAction::BrowserNewTab { browser_name: None, query: None, .. })));
        assert!(matches!(parse_voice_action("close tab", &apps, &[]), Some(VoiceAction::BrowserCloseTab)));
    }

    #[test]
    fn parses_system_settings_panes_and_finder_folders() {
        let mut apps = sample_apps();
        apps.push(InstalledApp { name: "Finder".into(), path: "/System/Library/CoreServices/Finder.app".into(), is_web: false });
        apps.push(InstalledApp { name: "System Settings".into(), path: "/System/Applications/System Settings.app".into(), is_web: false });
        apps.push(InstalledApp { name: "Photos".into(), path: "/System/Applications/Photos.app".into(), is_web: false });

        // Settings panes (chained, direct verb, and standalone)
        for (phrase, expected_pane) in [
            ("open settings, go to Wi-Fi settings", "Wi-Fi"),
            ("Open settings. Go to Wi-Fi settings.", "Wi-Fi"),
            ("open settings and go to Bluetooth settings", "Bluetooth"),
            ("Open settings. Go to Bluetooth.", "Bluetooth"),
            ("go to Wi-Fi settings", "Wi-Fi"),
            ("open Bluetooth settings", "Bluetooth"),
            ("notification manager", "Notifications"),
            ("open notification manager", "Notifications"),
            ("mouse settings", "Mouse"),
            ("open settings, go to mouse settings", "Mouse"),
            ("keypad settings", "Keyboard"),
            ("open keyboard settings", "Keyboard"),
            ("trackpad settings", "Trackpad"),
            ("open sound settings", "Sound"),
            ("open privacy settings", "Privacy & Security"),
        ] {
            match parse_voice_action(phrase, &apps, &[]) {
                Some(VoiceAction::OpenSettingsPane { pane_name, .. }) => {
                    assert_eq!(pane_name, expected_pane, "Failed for {:?}", phrase);
                }
                other => panic!("Expected OpenSettingsPane({}) for {:?}, got {:?}", expected_pane, phrase, other),
            }
        }

        // Plain "open settings" still opens System Settings app
        assert!(matches!(
            parse_voice_action("open settings", &apps, &[]),
            Some(VoiceAction::OpenApp { ref app_name, .. }) if app_name == "System Settings"
        ));

        // Finder / File Explorer folders (including Whisper "find" transcription of "Finder")
        for (phrase, expected_folder) in [
            ("go to find, open the downloads", "Downloads"),
            ("Go to find. Open the downloads.", "Downloads"),
            ("go to finder, open the downloads", "Downloads"),
            ("Go to Finder. Open Applications.", "Applications"),
            ("open the downloads", "Downloads"),
            ("open downloads", "Downloads"),
            ("go to downloads", "Downloads"),
            ("open applications", "Applications"),
            ("open the applications", "Applications"),
            ("go to finder, open applications", "Applications"),
            ("open desktop", "Desktop"),
            ("open documents", "Documents"),
            ("open music folder", "Music"),
            ("go to finder, open music", "Music"),
        ] {
            match parse_voice_action(phrase, &apps, &[]) {
                Some(VoiceAction::OpenFolder { folder_name, .. }) => {
                    assert_eq!(folder_name, expected_folder, "Failed for {:?}", phrase);
                }
                other => panic!("Expected OpenFolder({}) for {:?}, got {:?}", expected_folder, phrase, other),
            }
        }

        // "open music" and "open photos" still open the apps, not folders
        assert!(matches!(
            parse_voice_action("open music", &apps, &[]),
            Some(VoiceAction::OpenApp { ref app_name, .. }) if app_name == "Music"
        ));
        assert!(matches!(
            parse_voice_action("open photos", &apps, &[]),
            Some(VoiceAction::OpenApp { ref app_name, .. }) if app_name == "Photos"
        ));
        assert!(matches!(
            parse_voice_action("go to find", &apps, &[]),
            Some(VoiceAction::OpenApp { ref app_name, .. }) if app_name == "Finder"
        ));
    }

    #[test]
    fn rejects_normal_dictation_false_positives() {
        let apps = sample_apps();
        for prose in [
            "open the door please",
            "open a new pull request tomorrow",
            "I want to open my laptop later",
            "let's start the meeting at 3pm",
            "I need to check my mouse settings later today",
            "we should check the downloads count tomorrow",
        ] {
            assert!(
                parse_voice_action(prose, &apps, &[]).is_none(),
                "False positive for {:?}",
                prose
            );
        }
    }
}

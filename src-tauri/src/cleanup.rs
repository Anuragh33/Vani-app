use anyhow::Result;
use once_cell::sync::Lazy;
use regex::Regex;

static FILLER_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?i)\b(um+|uh+|like|you know|kind of|sort of|basically|literally|actually|I mean|right\??)\b[,]?\s*")
        .unwrap()
});

pub fn remove_filler_words(text: &str) -> String {
    let out = FILLER_RE.replace_all(text, " ");
    out.split_whitespace().collect::<Vec<_>>().join(" ")
}

pub fn text_to_bullets(text: &str) -> String {
    let sentences: Vec<&str> = text
        .split(|c| c == '.' || c == '!' || c == '?')
        .map(str::trim)
        .filter(|s| s.len() > 3)
        .collect();
    if sentences.len() <= 1 {
        return format!("- {}", text.trim());
    }
    sentences.iter().map(|s| format!("- {}", s)).collect::<Vec<_>>().join("\n")
}

pub fn substitute_snippets(text: &str, snippets: &[crate::config::Snippet]) -> String {
    let mut result = text.to_string();
    for snippet in snippets {
        if snippet.trigger.is_empty() || snippet.expansion.is_empty() {
            continue;
        }
        let escaped = regex::escape(&snippet.trigger);
        let pattern = format!(r"\b{}\b", escaped);
        if let Ok(re) = Regex::new(&pattern) {
            result = re.replace_all(&result, snippet.expansion.as_str()).to_string();
        }
    }
    result
}

const VOICE_COMMANDS: &[(&str, &[&str])] = &[
    ("delete", &["delete that", "scratch that", "never mind", "forget it"]),
    ("formal", &["make it formal", "make that formal", "sound more formal"]),
    ("bullets", &["bullet points", "as bullet points", "make it bullets", "list format"]),
    ("undo", &["undo", "undo that"]),
];

pub fn detect_voice_command(text: &str) -> Option<&'static str> {
    let normalized = text.trim().to_lowercase();
    let normalized = normalized.trim_end_matches(|c| matches!(c, '.' | '!' | '?' | ','));
    for (cmd, phrases) in VOICE_COMMANDS {
        if phrases.contains(&normalized) {
            return Some(cmd);
        }
    }
    None
}

fn cleanup_system_prompt(context: &str) -> &'static str {
    match context {
        "email" => "You are a speech transcription cleanup assistant. Format the transcribed speech as a professional email body. Fix punctuation, capitalization, and spacing. Never invent facts. Return ONLY the cleaned text.",
        "slack" => "You are a speech transcription cleanup assistant. Format as a casual, concise Slack message. Fix punctuation and spacing. Return ONLY the cleaned text.",
        "notes" => "You are a speech transcription cleanup assistant. Format as structured notes with clear sentences. Fix punctuation and spacing. Return ONLY the cleaned text.",
        "code" => "You are a speech transcription cleanup assistant. Format as a code comment or inline documentation. Be concise and technical. Return ONLY the cleaned text.",
        _ => "You are a speech transcription cleanup assistant. Fix punctuation, capitalization, and spacing. Never invent facts. Preserve technical terms. Return ONLY the cleaned text.",
    }
}

pub async fn cleanup_with_anthropic(text: &str, context: &str, api_key: &str) -> Result<String> {
    let client = reqwest::Client::new();
    let body = serde_json::json!({
        "model": "claude-haiku-4-5-20251001",
        "max_tokens": 1024,
        "system": cleanup_system_prompt(context),
        "messages": [{ "role": "user", "content": text }]
    });
    let resp = client
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
        .json(&body)
        .send()
        .await?;
    let json: serde_json::Value = resp.json().await?;
    Ok(json["content"][0]["text"]
        .as_str()
        .unwrap_or(text)
        .to_string())
}

pub async fn cleanup_with_openai(text: &str, context: &str, api_key: &str) -> Result<String> {
    let client = reqwest::Client::new();
    let body = serde_json::json!({
        "model": "gpt-4o-mini",
        "max_tokens": 1024,
        "messages": [
            { "role": "system", "content": cleanup_system_prompt(context) },
            { "role": "user", "content": text }
        ]
    });
    let resp = client
        .post("https://api.openai.com/v1/chat/completions")
        .bearer_auth(api_key)
        .json(&body)
        .send()
        .await?;
    let json: serde_json::Value = resp.json().await?;
    Ok(json["choices"][0]["message"]["content"]
        .as_str()
        .unwrap_or(text)
        .to_string())
}

pub async fn transcribe_with_openai(wav_bytes: &[u8], language: &str, api_key: &str) -> Result<String> {
    use reqwest::multipart;
    let part = multipart::Part::bytes(wav_bytes.to_vec())
        .file_name("audio.wav")
        .mime_str("audio/wav")?;
    let mut form = multipart::Form::new()
        .text("model", "whisper-1")
        .part("file", part);
    if language != "auto" && !language.is_empty() {
        form = form.text("language", language.to_string());
    }
    let client = reqwest::Client::new();
    let resp = client
        .post("https://api.openai.com/v1/audio/transcriptions")
        .bearer_auth(api_key)
        .multipart(form)
        .send()
        .await?;
    let json: serde_json::Value = resp.json().await?;
    Ok(json["text"].as_str().unwrap_or("").to_string())
}

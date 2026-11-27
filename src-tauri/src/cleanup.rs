use anyhow::Result;
use once_cell::sync::Lazy;
use regex::Regex;

// Only strip unambiguous non-lexical vocal hesitation fillers (um, uh, erm, hmm).
// Never delete content words like "like", "right", "actually", "literally", "basically",
// "kind of", or "sort of", which broke normal sentences ("I would like to...", "right now").
static FILLER_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?i)(?:^|[\s,])\b(?:um+|uh+|uh-huh|erm+|hmm+|mhm+)\b[,.]?(?:\s+|$)")
        .unwrap()
});

static SPACE_BEFORE_PUNCT_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"\s+([,.;:!?])").unwrap()
});

pub fn remove_filler_words(text: &str) -> String {
    let stripped = FILLER_RE.replace_all(text, " ");
    let collapsed = stripped.split_whitespace().collect::<Vec<_>>().join(" ");
    SPACE_BEFORE_PUNCT_RE.replace_all(&collapsed, "$1").trim().to_string()
}

/// Safe deterministic cleanup for General mode: preserves every spoken word verbatim,
/// normalizes spacing/punctuation, and capitalizes the first letter if needed.
pub fn light_format_general(text: &str) -> String {
    let collapsed = text.split_whitespace().collect::<Vec<_>>().join(" ");
    let cleaned = SPACE_BEFORE_PUNCT_RE.replace_all(&collapsed, "$1").trim().to_string();
    let mut chars = cleaned.chars();
    match chars.next() {
        Some(first) if first.is_ascii_lowercase() => {
            format!("{}{}", first.to_ascii_uppercase(), chars.as_str())
        }
        _ => cleaned,
    }
}

/// Guard against small-LLM hallucinations (e.g., answering a dictated question or replacing
/// words with unrelated paraphrases). Returns false when the polished output drifts too far
/// from the spoken transcript so callers can safely fall back to the faithful transcript.
pub fn is_safe_polish(raw: &str, polished: &str, context: &str) -> bool {
    let raw_t = raw.trim();
    let pol_t = polished.trim();
    if pol_t.is_empty() || raw_t.is_empty() {
        return false;
    }

    // Reject classic chatbot refusal / answer prefixes
    let low = pol_t.to_lowercase();
    for bad_prefix in [
        "sure,",
        "certainly,",
        "here is the cleaned",
        "here's the cleaned",
        "i cannot",
        "i can't",
        "as an ai",
    ] {
        if low.starts_with(bad_prefix) && !raw_t.to_lowercase().starts_with(bad_prefix) {
            return false;
        }
    }

    let tokenize = |s: &str| -> Vec<String> {
        s.split(|c: char| !c.is_alphanumeric() && c != '\'')
            .filter(|w| w.len() >= 2)
            .map(|w| w.to_lowercase())
            .collect()
    };

    let raw_words = tokenize(raw_t);
    let pol_words = tokenize(pol_t);
    if raw_words.is_empty() || pol_words.is_empty() {
        return true;
    }

    // Allow slightly more structural expansion for email/notes, stricter for general/slack/code
    let (min_ratio, max_ratio, min_overlap) = match context {
        "email" | "notes" => (0.55_f32, 1.85_f32, 0.55_f32),
        _ => (0.65_f32, 1.40_f32, 0.65_f32),
    };

    let ratio = pol_words.len() as f32 / raw_words.len() as f32;
    if ratio < min_ratio || ratio > max_ratio {
        return false;
    }

    let pol_set: std::collections::HashSet<&str> = pol_words.iter().map(|s| s.as_str()).collect();
    let kept = raw_words.iter().filter(|w| pol_set.contains(w.as_str())).count();
    let overlap = kept as f32 / raw_words.len() as f32;
    overlap >= min_overlap
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
        // OpenAI Whisper expects ISO-639-1 two-letter language code (e.g. "en" instead of "en-IN")
        let base_lang = language.split(['-', '_']).next().unwrap_or(language);
        form = form.text("language", base_lang.to_string());
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

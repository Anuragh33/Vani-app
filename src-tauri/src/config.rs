use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Snippet {
    pub trigger: String,
    pub expansion: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    #[serde(default = "default_language")]
    pub language: String,
    #[serde(default = "default_hotkey")]
    pub hotkey: String,
    #[serde(default = "default_true")]
    pub auto_inject: bool,
    #[serde(default = "default_true")]
    pub auto_stop_on_silence: bool,
    #[serde(default = "default_silence_ms")]
    pub silence_duration_ms: u32,
    #[serde(default)]
    pub start_at_login: bool,
    #[serde(default = "default_model")]
    pub whisper_model: String,
    #[serde(default = "default_threads")]
    pub threads: u32,
    #[serde(default)]
    pub translate: bool,
    #[serde(default)]
    pub custom_vocabulary: String,
    #[serde(default)]
    pub snippets: Vec<Snippet>,
    #[serde(default = "default_theme")]
    pub theme: String,
    #[serde(default)]
    pub openai_key: String,
    #[serde(default)]
    pub anthropic_key: String,
    #[serde(default = "default_transcription_provider")]
    pub transcription_provider: String,
    #[serde(default = "default_none")]
    pub cleanup_provider: String,
    #[serde(default = "default_general")]
    pub cleanup_context: String,
    #[serde(default)]
    pub filler_word_removal: bool,
    #[serde(default)]
    pub onboarding_complete: bool,
    #[serde(default)]
    pub privacy_mode: bool,
    #[serde(default = "default_hud_style")]
    pub hud_style: String,
    #[serde(default = "default_hud_position")]
    pub hud_position: String,
    #[serde(default = "default_true")]
    pub hud_show_timer: bool,
    #[serde(default = "default_true")]
    pub hud_show_mode: bool,
    #[serde(default = "default_true")]
    pub hud_glass: bool,
    #[serde(default = "default_tray_icon_style")]
    pub tray_icon_style: String,
}

fn default_language() -> String { "auto".into() }
fn default_hotkey() -> String { "CommandOrControl+Shift+Space".into() }
fn default_true() -> bool { true }
fn default_silence_ms() -> u32 { 2000 }
fn default_model() -> String { "ggml-base.en".into() }
fn default_threads() -> u32 { (num_cpus().saturating_sub(1)).clamp(2, 8) }
fn default_theme() -> String { "dark".into() }
fn default_transcription_provider() -> String { "local".into() }
fn default_none() -> String { "none".into() }
fn default_general() -> String { "general".into() }
fn default_hud_style() -> String { "breathwave".into() }
fn default_hud_position() -> String { "top-center".into() }
fn default_tray_icon_style() -> String { "monochrome".into() }

fn num_cpus() -> u32 {
    std::thread::available_parallelism()
        .map(|n| n.get() as u32)
        .unwrap_or(4)
}

impl Default for Settings {
    fn default() -> Self {
        serde_json::from_str("{}").unwrap()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AppData {
    #[serde(default)]
    pub settings: Settings,
    #[serde(default)]
    pub notes: Vec<Note>,
    #[serde(default)]
    pub history: Vec<HistoryEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Note {
    pub id: String,
    pub title: String,
    pub content: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryEntry {
    pub id: String,
    pub timestamp: String,
    pub raw_text: String,
    pub cleaned_text: String,
    pub provider: String,
    pub injected: bool,
    pub mode: String,
}

pub struct Store {
    path: PathBuf,
    pub data: AppData,
}

impl Store {
    pub fn load(app_data_dir: PathBuf) -> Result<Self> {
        let path = app_data_dir.join("vani-data.json");
        let data = if path.exists() {
            let raw = std::fs::read_to_string(&path)?;
            serde_json::from_str(&raw).unwrap_or_default()
        } else {
            AppData::default()
        };
        Ok(Self { path, data })
    }

    pub fn save(&self) -> Result<()> {
        if let Some(parent) = self.path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let json = serde_json::to_string_pretty(&self.data)?;
        std::fs::write(&self.path, json)?;
        Ok(())
    }

    pub fn settings(&self) -> &Settings {
        &self.data.settings
    }

    pub fn update_settings(&mut self, partial: serde_json::Value) -> Result<Settings> {
        let mut current = serde_json::to_value(&self.data.settings)?;
        if let (Some(obj), Some(partial_obj)) = (current.as_object_mut(), partial.as_object()) {
            for (k, v) in partial_obj {
                obj.insert(k.clone(), v.clone());
            }
        }
        self.data.settings = serde_json::from_value(current)?;
        self.save()?;
        Ok(self.data.settings.clone())
    }

    pub fn add_history(&mut self, entry: HistoryEntry) -> Result<Vec<HistoryEntry>> {
        self.data.history.insert(0, entry);
        self.data.history.truncate(100);
        self.save()?;
        Ok(self.data.history.clone())
    }
}

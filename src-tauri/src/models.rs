use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use tokio::io::AsyncWriteExt;

const HF_WHISPER: &str = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main";
// Parakeet ONNX models hosted on HuggingFace after export (update when uploaded)
const HF_PARAKEET: &str = "https://huggingface.co/vani-app/parakeet-onnx/resolve/main";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WhisperModel {
    pub id: String,
    pub name: String,
    pub size: String,
    pub params: String,
    pub multilingual: bool,
    pub installed: bool,
    pub downloading: bool,
    pub backend: String,    // "whisper" | "parakeet"
    pub importable: bool,   // true = no download URL yet, user imports .onnx manually
}

macro_rules! wm {
    ($id:expr, $name:expr, $size:expr, $params:expr, $ml:expr) => {
        WhisperModel {
            id: $id.into(), name: $name.into(), size: $size.into(),
            params: $params.into(), multilingual: $ml,
            installed: false, downloading: false,
            backend: "whisper".into(), importable: false,
        }
    };
}

macro_rules! pk {
    ($id:expr, $name:expr, $size:expr, $params:expr) => {
        WhisperModel {
            id: $id.into(), name: $name.into(), size: $size.into(),
            params: $params.into(), multilingual: false,
            installed: false, downloading: false,
            backend: "parakeet".into(), importable: true,
        }
    };
}

pub fn catalog() -> Vec<WhisperModel> {
    vec![
        // ── Whisper GGML ────────────────────────────────────────────────
        wm!("ggml-base.en",        "Base (English)",   "142 MB",  "74M",    false),
        wm!("ggml-base",           "Base",             "142 MB",  "74M",    true),
        wm!("ggml-small.en",       "Small (English)",  "466 MB",  "244M",   false),
        wm!("ggml-small",          "Small",            "466 MB",  "244M",   true),
        wm!("ggml-medium.en",      "Medium (English)", "1.5 GB",  "769M",   false),
        wm!("ggml-medium",         "Medium",           "1.5 GB",  "769M",   true),
        wm!("ggml-large-v3-turbo", "Large v3 Turbo",   "1.6 GB",  "809M",   true),
        wm!("ggml-large-v3",       "Large v3",         "3.0 GB",  "1550M",  true),
        // ── NVIDIA Parakeet ONNX ─────────────────────────────────────────
        pk!("parakeet-tdt-0.6b-v2", "Parakeet TDT v2 (English)", "~1.5 GB", "600M"),
        pk!("parakeet-tdt-1.1b-v2", "Parakeet TDT 1.1B v2 (English)", "~2.7 GB", "1100M"),
    ]
}

pub fn models_dir(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join("models")
}

pub fn model_path(app_data_dir: &Path, model_id: &str) -> PathBuf {
    let ext = if model_id.starts_with("parakeet-") { "onnx" } else { "bin" };
    models_dir(app_data_dir).join(format!("{}.{}", model_id, ext))
}

pub fn is_parakeet(model_id: &str) -> bool {
    model_id.starts_with("parakeet-")
}

pub fn model_installed(app_data_dir: &Path, model_id: &str) -> bool {
    let path = model_path(app_data_dir, model_id);
    path.exists() && path.metadata().map(|m| m.len() > 1_000_000).unwrap_or(false)
}

pub fn list_with_status(
    app_data_dir: &Path,
    active_downloads: &HashMap<String, ()>,
) -> Vec<WhisperModel> {
    catalog()
        .into_iter()
        .map(|mut m| {
            m.installed = model_installed(app_data_dir, &m.id);
            m.downloading = active_downloads.contains_key(&m.id);
            m
        })
        .collect()
}

pub type ActiveDownloads = Arc<Mutex<HashMap<String, tokio::task::AbortHandle>>>;

pub async fn download_model<F>(
    app_data_dir: PathBuf,
    model_id: String,
    on_progress: F,
) -> Result<()>
where
    F: Fn(u64, u64) + Send + 'static,
{
    let dir = models_dir(&app_data_dir);
    tokio::fs::create_dir_all(&dir).await?;

    let final_path = model_path(&app_data_dir, &model_id);
    let tmp_path = final_path.with_extension("bin.part");

    // Resume from partial download
    let resume_from = if tmp_path.exists() {
        tokio::fs::metadata(&tmp_path).await.map(|m| m.len()).unwrap_or(0)
    } else {
        0
    };

    let url = if is_parakeet(&model_id) {
        format!("{}/{}.onnx", HF_PARAKEET, model_id)
    } else {
        let bare = model_id.trim_start_matches("ggml-");
        format!("{}/ggml-{}.bin", HF_WHISPER, bare)
    };

    let client = reqwest::Client::new();
    let mut req = client.get(&url).header("User-Agent", "VANI/2.0");
    if resume_from > 0 {
        req = req.header("Range", format!("bytes={}-", resume_from));
    }

    let response = req.send().await?;
    let status = response.status();

    // Follow redirect chain; reqwest handles it automatically, but check final status
    if !status.is_success() {
        return Err(anyhow!("Download failed: HTTP {}", status));
    }

    let content_length = response.content_length().unwrap_or(0);
    let total = resume_from + content_length;

    let append = resume_from > 0 && status.as_u16() == 206;
    let mut file = if append {
        tokio::fs::OpenOptions::new().append(true).open(&tmp_path).await?
    } else {
        tokio::fs::File::create(&tmp_path).await?
    };

    let mut received = if append { resume_from } else { 0 };
    let mut stream = response.bytes_stream();

    use futures_util::StreamExt;
    while let Some(chunk) = stream.next().await {
        let chunk = chunk?;
        file.write_all(&chunk).await?;
        received += chunk.len() as u64;
        on_progress(received, total);
    }

    file.flush().await?;
    drop(file);
    tokio::fs::rename(&tmp_path, &final_path).await?;
    Ok(())
}

pub fn delete_model(app_data_dir: &Path, model_id: &str) -> bool {
    let path = model_path(app_data_dir, model_id);
    std::fs::remove_file(path).is_ok()
}

use anyhow::{anyhow, Result};
use std::path::Path;
use std::sync::{Arc, Mutex};
use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters};

pub struct WhisperEngine {
    ctx: WhisperContext,
    model_id: String,
}

impl WhisperEngine {
    pub fn load(model_path: &Path, model_id: &str) -> Result<Self> {
        let params = WhisperContextParameters::default();
        let ctx = WhisperContext::new_with_params(
            model_path.to_str().ok_or_else(|| anyhow!("invalid model path"))?,
            params,
        )
        .map_err(|e| anyhow!("failed to load whisper model: {}", e))?;
        Ok(Self { ctx, model_id: model_id.to_string() })
    }

    pub fn transcribe(
        &self,
        samples: &[f32],
        language: &str,
        threads: u32,
        translate: bool,
        initial_prompt: &str,
    ) -> Result<String> {
        // Beam search (beam_size=3) dramatically reduces word substitutions vs greedy best_of=1
        // while staying fast on Apple Silicon Metal GPU and multi-core CPUs.
        let mut params = FullParams::new(SamplingStrategy::BeamSearch {
            beam_size: 3,
            patience: -1.0,
        });
        params.set_n_threads(threads as i32);
        params.set_translate(translate);
        params.set_print_special(false);
        params.set_print_progress(false);
        params.set_print_realtime(false);
        params.set_print_timestamps(false);
        params.set_suppress_blank(true);
        // Treat segments with low speech probability as silence rather than
        // hallucinating sound-effect tags like "(vocalizing)" or "(keyboard clicking)".
        params.set_no_speech_thold(0.6);
        params.set_logprob_thold(-1.0);

        if language != "auto" && !language.is_empty() {
            // Whisper expects ISO-639-1 base language code ("en" rather than "en-IN" / "en_US")
            let base_lang = language.split(['-', '_']).next().unwrap_or(language);
            params.set_language(Some(base_lang));
        }
        if !initial_prompt.is_empty() {
            params.set_initial_prompt(initial_prompt);
        }

        let mut state = self.ctx.create_state().map_err(|e| anyhow!("{}", e))?;
        state.full(params, samples).map_err(|e| anyhow!("transcription failed: {}", e))?;

        let n_segments = state.full_n_segments().map_err(|e| anyhow!("{}", e))?;
        let mut text = String::new();
        for i in 0..n_segments {
            if let Ok(seg) = state.full_get_segment_text(i) {
                text.push_str(&seg);
            }
        }
        let raw = text.trim().to_string();
        let cleaned = strip_non_speech_tags(&raw);
        eprintln!("VANI whisper raw: {:?}  cleaned: {:?}", raw, cleaned);
        Ok(cleaned)
    }

    pub fn model_id(&self) -> &str {
        &self.model_id
    }
}

/// Remove Whisper hallucination tokens — parenthesised sound labels, brackets,
/// music/silence markers — that appear when the model hears noise instead of speech.
fn strip_non_speech_tags(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut depth = 0usize;
    let mut bracket_depth = 0usize;
    for ch in text.chars() {
        match ch {
            '(' => { depth += 1; }
            ')' => { if depth > 0 { depth -= 1; } }
            '[' => { bracket_depth += 1; }
            ']' => { if bracket_depth > 0 { bracket_depth -= 1; } }
            _ if depth == 0 && bracket_depth == 0 => { out.push(ch); }
            _ => {}
        }
    }
    // Also strip known literal markers Whisper emits
    let out = out
        .replace("[Music]", "")
        .replace("[music]", "")
        .replace("[MUSIC]", "")
        .replace("[Silence]", "")
        .replace("[silence]", "")
        .replace("[BLANK_AUDIO]", "")
        .replace("[ Silence ]", "");
    out.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// Unified backend — either Whisper (GGML via whisper-rs) or Parakeet (ONNX via ort).
/// Both arms expose the same `transcribe` method so callers are backend-agnostic.
pub enum TranscribeBackend {
    Whisper(WhisperEngine),
    Parakeet(crate::parakeet::OrtEngine),
}

impl TranscribeBackend {
    pub fn transcribe(
        &self,
        samples: &[f32],
        language: &str,
        threads: u32,
        translate: bool,
        initial_prompt: &str,
    ) -> Result<String> {
        match self {
            Self::Whisper(e) => e.transcribe(samples, language, threads, translate, initial_prompt),
            Self::Parakeet(e) => e.transcribe(samples),
        }
    }

    pub fn model_id(&self) -> &str {
        match self {
            Self::Whisper(e) => e.model_id(),
            Self::Parakeet(e) => e.model_id(),
        }
    }
}

pub type SharedEngine = Arc<Mutex<Option<TranscribeBackend>>>;

pub fn new_shared_engine() -> SharedEngine {
    Arc::new(Mutex::new(None))
}

/// Load or reload the correct backend based on the model ID prefix.
pub fn ensure_engine(engine: &SharedEngine, model_path: &Path, model_id: &str) -> Result<()> {
    let mut guard = engine.lock().map_err(|_| anyhow!("lock poisoned"))?;
    if guard.as_ref().map(|e| e.model_id()) == Some(model_id) {
        return Ok(());
    }
    let backend = if model_id.starts_with("parakeet-") {
        TranscribeBackend::Parakeet(crate::parakeet::OrtEngine::load(model_path, model_id)?)
    } else {
        TranscribeBackend::Whisper(WhisperEngine::load(model_path, model_id)?)
    };
    *guard = Some(backend);
    Ok(())
}

/// Decode a WAV byte buffer into 16 kHz f32 mono PCM samples.
pub fn wav_to_samples(wav_bytes: &[u8]) -> Result<Vec<f32>> {
    let cursor = std::io::Cursor::new(wav_bytes);
    let mut reader = hound::WavReader::new(cursor)?;
    let spec = reader.spec();

    let raw: Vec<f32> = match spec.sample_format {
        hound::SampleFormat::Float => reader
            .samples::<f32>()
            .collect::<std::result::Result<_, _>>()?,
        hound::SampleFormat::Int => {
            let max = (1i64 << (spec.bits_per_sample - 1)) as f32;
            reader
                .samples::<i32>()
                .map(|s| s.map(|v| v as f32 / max))
                .collect::<std::result::Result<_, _>>()?
        }
    };

    // Mix down channels to mono
    let samples: Vec<f32> = if spec.channels == 1 {
        raw
    } else {
        raw.chunks(spec.channels as usize)
            .map(|ch| ch.iter().sum::<f32>() / ch.len() as f32)
            .collect()
    };

    // Resample to 16 kHz if needed (simple linear interpolation)
    if spec.sample_rate == 16000 {
        return Ok(samples);
    }
    let ratio = spec.sample_rate as f64 / 16000.0;
    let out_len = (samples.len() as f64 / ratio) as usize;
    let resampled: Vec<f32> = (0..out_len)
        .map(|i| {
            let src = i as f64 * ratio;
            let idx = src as usize;
            let frac = (src - idx as f64) as f32;
            let a = samples.get(idx).copied().unwrap_or(0.0);
            let b = samples.get(idx + 1).copied().unwrap_or(0.0);
            a + frac * (b - a)
        })
        .collect();
    Ok(resampled)
}

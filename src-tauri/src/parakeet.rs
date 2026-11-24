use anyhow::{anyhow, Result};
use ndarray::{Array2, ArrayD, ArrayViewD, Axis};
use ort::{session::Session, value::Tensor};
use rustfft::{num_complex::Complex, FftPlanner};
use std::f32::consts::PI;
use std::path::Path;
use std::sync::Mutex;

const N_MELS: usize = 80;
const N_FFT: usize = 512;
const WIN_LEN: usize = 400;
const HOP_LEN: usize = 160;
const PREEMPH: f32 = 0.97;
const SAMPLE_RATE: usize = 16000;
const BLANK_IDX: usize = 1024;
const SENTENCEPIECE_SPACE: char = '\u{2581}';

static VOCAB_JSON: &str = include_str!("parakeet_vocab.json");

pub struct OrtEngine {
    model_id: String,
    session: Mutex<Session>,
    vocab: Vec<String>,
}

impl OrtEngine {
    pub fn load(model_path: &Path, model_id: &str) -> Result<Self> {
        if !model_path.exists() {
            return Err(anyhow!(
                "Parakeet model not found at {:?}. Import the .onnx from the Models page.",
                model_path
            ));
        }

        let session = Session::builder()
            .map_err(|e| anyhow!("ort builder: {}", e))?
            .with_intra_threads(4)
            .map_err(|e| anyhow!("ort threads: {}", e))?
            .commit_from_file(model_path)
            .map_err(|e| anyhow!("ort load: {}", e))?;

        let vocab: Vec<String> =
            serde_json::from_str(VOCAB_JSON).map_err(|e| anyhow!("vocab: {}", e))?;

        eprintln!("VANI parakeet: loaded {} ({} tokens)", model_id, vocab.len());
        Ok(Self { model_id: model_id.to_string(), session: Mutex::new(session), vocab })
    }

    pub fn transcribe(&self, samples: &[f32]) -> Result<String> {
        if samples.len() < WIN_LEN {
            return Ok(String::new());
        }

        // 1. Log-mel spectrogram [N_MELS, n_frames]
        let mel = compute_mel(samples)?;
        let n_frames = mel.ncols();

        // 2. Per-feature z-score normalization
        let mel_norm = normalize_per_feature(&mel);

        // 3. Build input tensors using (shape_vec, data_vec) which is always supported
        let audio_shape = vec![1i64, N_MELS as i64, n_frames as i64];
        let audio_data: Vec<f32> = mel_norm.into_raw_vec_and_offset().0;
        let length_data: Vec<i64> = vec![n_frames as i64];

        let audio_tensor = Tensor::<f32>::from_array((audio_shape, audio_data))
            .map_err(|e| anyhow!("audio tensor: {}", e))?;
        let length_tensor = Tensor::<i64>::from_array((vec![1i64], length_data))
            .map_err(|e| anyhow!("length tensor: {}", e))?;

        // 4. ONNX inference — inputs! macro returns Vec, not Result
        let mut sess = self.session.lock().map_err(|_| anyhow!("session lock poisoned"))?;
        let outputs = sess
            .run(ort::inputs![
                "audio_signal" => audio_tensor,
                "length" => length_tensor
            ])
            .map_err(|e| anyhow!("ort run: {}", e))?;

        // logprobs: [1, n_frames, 1025] as ArrayViewD<f32>
        let raw: ArrayD<f32> = outputs["logprobs"]
            .try_extract_array::<f32>()
            .map_err(|e| anyhow!("extract: {}", e))?
            .to_owned();

        // Remove batch dim → [n_frames, 1025]
        let lp = raw.index_axis(Axis(0), 0).to_owned();

        // 5. CTC greedy decode
        let text = ctc_greedy_decode_dyn(lp.view(), &self.vocab);
        eprintln!("VANI parakeet: {:?}", text);
        Ok(text)
    }

    pub fn model_id(&self) -> &str {
        &self.model_id
    }
}

// ─── Mel spectrogram ────────────────────────────────────────────────────────

fn compute_mel(samples: &[f32]) -> Result<Array2<f32>> {
    // Pre-emphasis filter
    let mut signal = Vec::with_capacity(samples.len());
    signal.push(samples[0]);
    for i in 1..samples.len() {
        signal.push(samples[i] - PREEMPH * samples[i - 1]);
    }

    // Hann window
    let hann: Vec<f32> = (0..WIN_LEN)
        .map(|n| 0.5 * (1.0 - (2.0 * PI * n as f32 / (WIN_LEN - 1) as f32).cos()))
        .collect();

    let mel_fb = mel_filterbank();
    let n_freqs = N_FFT / 2 + 1;
    let n_frames = (signal.len().saturating_sub(WIN_LEN)) / HOP_LEN + 1;
    let mut mel_out = Array2::<f32>::zeros((N_MELS, n_frames));

    let mut planner = FftPlanner::new();
    let fft = planner.plan_fft_forward(N_FFT);
    let mut buf: Vec<Complex<f32>> = vec![Complex::new(0.0, 0.0); N_FFT];

    for frame in 0..n_frames {
        let start = frame * HOP_LEN;

        for i in 0..N_FFT {
            let s = if i < WIN_LEN {
                signal.get(start + i).copied().unwrap_or(0.0) * hann[i]
            } else {
                0.0
            };
            buf[i] = Complex::new(s, 0.0);
        }

        fft.process(&mut buf);

        let power: Vec<f32> = (0..n_freqs)
            .map(|k| buf[k].re * buf[k].re + buf[k].im * buf[k].im)
            .collect();

        for m in 0..N_MELS {
            let val: f32 = (0..n_freqs).map(|k| mel_fb[[m, k]] * power[k]).sum();
            mel_out[[m, frame]] = val.max(1e-9).log10();
        }
    }

    Ok(mel_out)
}

fn mel_filterbank() -> Array2<f32> {
    let n_freqs = N_FFT / 2 + 1;
    let fmax = SAMPLE_RATE as f32 / 2.0;
    let mel_min = hz_to_mel(0.0);
    let mel_max = hz_to_mel(fmax);

    let centers_hz: Vec<f32> = (0..=(N_MELS + 1))
        .map(|i| mel_to_hz(mel_min + (mel_max - mel_min) * i as f32 / (N_MELS + 1) as f32))
        .collect();

    let bins: Vec<usize> = centers_hz
        .iter()
        .map(|&f| ((N_FFT + 1) as f32 * f / SAMPLE_RATE as f32) as usize)
        .collect();

    let mut fb = Array2::<f32>::zeros((N_MELS, n_freqs));
    for m in 0..N_MELS {
        let lo = bins[m];
        let center = bins[m + 1];
        let hi = bins[m + 2];
        for k in lo..center {
            if k < n_freqs && center > lo {
                fb[[m, k]] = (k - lo) as f32 / (center - lo) as f32;
            }
        }
        for k in center..=hi {
            if k < n_freqs && hi > center {
                fb[[m, k]] = (hi - k) as f32 / (hi - center) as f32;
            }
        }
    }
    fb
}

fn hz_to_mel(hz: f32) -> f32 {
    2595.0 * (1.0 + hz / 700.0).log10()
}

fn mel_to_hz(mel: f32) -> f32 {
    700.0 * (10.0_f32.powf(mel / 2595.0) - 1.0)
}

fn normalize_per_feature(mel: &Array2<f32>) -> Array2<f32> {
    let mut out = mel.clone();
    let n = mel.ncols() as f32;
    for m in 0..N_MELS {
        let row = mel.row(m);
        let mean = row.iter().sum::<f32>() / n;
        let var = row.iter().map(|&x| (x - mean).powi(2)).sum::<f32>() / n;
        let std = (var + 1e-5_f32).sqrt();
        for t in 0..mel.ncols() {
            out[[m, t]] = (mel[[m, t]] - mean) / std;
        }
    }
    out
}

// ─── CTC greedy decode ───────────────────────────────────────────────────────

fn ctc_greedy_decode_dyn(logprobs: ndarray::ArrayViewD<f32>, vocab: &[String]) -> String {
    // logprobs shape: [n_frames, vocab_size+1]
    let n_frames = logprobs.shape()[0];
    let n_vocab = logprobs.shape()[1];
    let mut prev = BLANK_IDX;
    let mut ids: Vec<usize> = Vec::new();

    for t in 0..n_frames {
        let best = (0..n_vocab)
            .max_by(|&a, &b| {
                logprobs[[t, a]]
                    .partial_cmp(&logprobs[[t, b]])
                    .unwrap_or(std::cmp::Ordering::Equal)
            })
            .unwrap_or(BLANK_IDX);
        if best != BLANK_IDX && best != prev {
            ids.push(best);
        }
        prev = best;
    }

    ids.iter()
        .filter_map(|&id| vocab.get(id).map(|s| s.as_str()))
        .collect::<String>()
        .replace(SENTENCEPIECE_SPACE, " ")
        .trim()
        .to_string()
}

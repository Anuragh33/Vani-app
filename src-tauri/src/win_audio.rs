#![cfg(target_os = "windows")]

use anyhow::{anyhow, Result};
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use std::path::PathBuf;
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter};

pub struct ActiveNativeRecording {
    stop_tx: Option<mpsc::Sender<bool>>,
    result_rx: Option<mpsc::Receiver<Result<(PathBuf, usize, f32)>>>,
}

fn high_pass_80hz(samples: &[f32], src_rate: u32) -> Vec<f32> {
    if samples.is_empty() || src_rate == 0 {
        return samples.to_vec();
    }
    let rc = 1.0_f64 / (2.0 * std::f64::consts::PI * 80.0);
    let dt = 1.0_f64 / src_rate as f64;
    let alpha = (rc / (rc + dt)) as f32;
    let mut out = Vec::with_capacity(samples.len());
    let mut prev_y = 0.0_f32;
    let mut prev_x = samples[0];
    for &x in samples {
        let y = alpha * (prev_y + x - prev_x);
        out.push(y);
        prev_y = y;
        prev_x = x;
    }
    out
}

/// Anti-aliased Lanczos-3 resampler to 16 kHz (avoids linear-interpolation high-frequency aliasing).
fn resample_to_16k(samples: &[f32], src_rate: u32) -> Vec<f32> {
    if src_rate == 16000 || samples.is_empty() {
        return samples.to_vec();
    }
    let ratio = src_rate as f64 / 16000.0;
    let out_len = (samples.len() as f64 / ratio) as usize;
    let scale = if ratio > 1.0 { 1.0 / ratio } else { 1.0 };
    let a = 3.0_f64;
    let radius = (a / scale).ceil() as isize;
    let len = samples.len() as isize;

    let sinc = |x: f64| -> f64 {
        if x.abs() < 1e-9 {
            1.0
        } else {
            let px = std::f64::consts::PI * x;
            px.sin() / px
        }
    };

    (0..out_len)
        .map(|i| {
            let center = i as f64 * ratio;
            let base = center.floor() as isize;
            let mut sum = 0.0_f64;
            let mut wsum = 0.0_f64;
            for k in (base - radius)..=(base + radius) {
                if k >= 0 && k < len {
                    let dist = (center - k as f64) * scale;
                    if dist.abs() < a {
                        let w = sinc(dist) * sinc(dist / a);
                        sum += samples[k as usize] as f64 * w;
                        wsum += w;
                    }
                }
            }
            if wsum > 1e-9 { (sum / wsum) as f32 } else { 0.0 }
        })
        .collect()
}

fn normalize_and_pad_16k(samples: &[f32]) -> (Vec<f32>, f32) {
    if samples.is_empty() {
        return (Vec::new(), 0.0);
    }
    let peak = samples.iter().fold(0.0_f32, |acc, &s| acc.max(s.abs()));
    let gain = if peak >= 0.008 && peak < 0.68 {
        (0.70 / peak).min(6.0)
    } else {
        1.0
    };
    let pad = 1920usize; // 120 ms clean silence padding at start and end
    let mut out = Vec::with_capacity(samples.len() + pad * 2);
    out.resize(pad, 0.0);
    let mut out_peak = 0.0_f32;
    for &s in samples {
        let boosted = s * gain;
        let limited = if boosted > 0.95 {
            0.95 + 0.05 * ((boosted - 0.95) * 4.0).tanh()
        } else if boosted < -0.95 {
            -0.95 + 0.05 * ((boosted + 0.95) * 4.0).tanh()
        } else {
            boosted
        };
        let c = limited.clamp(-1.0, 1.0);
        out_peak = out_peak.max(c.abs());
        out.push(c);
    }
    out.resize(out.len() + pad, 0.0);
    (out, peak.max(out_peak))
}

fn write_wav_16k(path: &PathBuf, samples: &[f32]) -> Result<()> {
    let spec = hound::WavSpec {
        channels: 1,
        sample_rate: 16000,
        bits_per_sample: 16,
        sample_format: hound::SampleFormat::Int,
    };
    let mut writer = hound::WavWriter::create(path, spec)?;
    for &s in samples {
        let clamped = s.clamp(-1.0, 1.0);
        let v = if clamped < 0.0 {
            (clamped * 32768.0) as i16
        } else {
            (clamped * 32767.0) as i16
        };
        writer.write_sample(v)?;
    }
    writer.finalize()?;
    Ok(())
}

fn push_mono_and_emit(
    mono: &[f32],
    buf: &Arc<Mutex<Vec<f32>>>,
    last_emit: &Arc<Mutex<Instant>>,
    app: &AppHandle,
) {
    if mono.is_empty() {
        return;
    }
    if let Ok(mut g) = buf.lock() {
        g.extend_from_slice(mono);
    }

    let should_emit = if let Ok(mut ts) = last_emit.lock() {
        if ts.elapsed() >= Duration::from_millis(40) {
            *ts = Instant::now();
            true
        } else {
            false
        }
    } else {
        false
    };

    if should_emit {
        let sum_sq: f32 = mono.iter().map(|s| s * s).sum();
        let rms = (sum_sq / mono.len() as f32).sqrt();
        let level = (rms * 4.5).clamp(0.06, 1.0);
        let _ = app.emit("native-audio-level", level);
    }
}

pub fn start_native_recording(app: &AppHandle) -> Result<ActiveNativeRecording> {
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let wav_path = std::env::temp_dir().join(format!("vani_win_rec_{}.wav", ts));

    let (ready_tx, ready_rx) = mpsc::channel::<Result<()>>();
    let (stop_tx, stop_rx) = mpsc::channel::<bool>();
    let (result_tx, result_rx) = mpsc::channel::<Result<(PathBuf, usize, f32)>>();
    let app_clone = app.clone();

    std::thread::spawn(move || {
        let host = cpal::default_host();
        let Some(device) = host.default_input_device() else {
            let _ = ready_tx.send(Err(anyhow!(
                "No input microphone found. Check Windows Settings → Privacy & security → Microphone."
            )));
            return;
        };

        let config = match device.default_input_config() {
            Ok(c) => c,
            Err(e) => {
                let _ = ready_tx.send(Err(anyhow!("Could not open default microphone: {}", e)));
                return;
            }
        };

        let channels = config.channels().max(1) as usize;
        let sample_rate = config.sample_rate().0;
        let sample_format = config.sample_format();
        let stream_config: cpal::StreamConfig = config.into();

        let captured: Arc<Mutex<Vec<f32>>> = Arc::new(Mutex::new(Vec::with_capacity(sample_rate as usize * 10)));
        let last_emit = Arc::new(Mutex::new(Instant::now() - Duration::from_millis(100)));

        let err_fn = |err| {
            eprintln!("VANI WASAPI input stream error: {}", err);
        };

        let stream_result = match sample_format {
            cpal::SampleFormat::F32 => {
                let buf = Arc::clone(&captured);
                let le = Arc::clone(&last_emit);
                let app_ev = app_clone.clone();
                device.build_input_stream(
                    &stream_config,
                    move |data: &[f32], _| {
                        let mono: Vec<f32> = if channels == 1 {
                            data.to_vec()
                        } else {
                            data.chunks(channels)
                                .map(|ch| ch.iter().sum::<f32>() / ch.len() as f32)
                                .collect()
                        };
                        push_mono_and_emit(&mono, &buf, &le, &app_ev);
                    },
                    err_fn,
                    None,
                )
            }
            cpal::SampleFormat::I16 => {
                let buf = Arc::clone(&captured);
                let le = Arc::clone(&last_emit);
                let app_ev = app_clone.clone();
                device.build_input_stream(
                    &stream_config,
                    move |data: &[i16], _| {
                        let mono: Vec<f32> = data
                            .chunks(channels)
                            .map(|ch| {
                                let sum: f32 = ch.iter().map(|&s| s as f32 / 32768.0).sum();
                                sum / ch.len() as f32
                            })
                            .collect();
                        push_mono_and_emit(&mono, &buf, &le, &app_ev);
                    },
                    err_fn,
                    None,
                )
            }
            cpal::SampleFormat::U16 => {
                let buf = Arc::clone(&captured);
                let le = Arc::clone(&last_emit);
                let app_ev = app_clone.clone();
                device.build_input_stream(
                    &stream_config,
                    move |data: &[u16], _| {
                        let mono: Vec<f32> = data
                            .chunks(channels)
                            .map(|ch| {
                                let sum: f32 = ch.iter().map(|&s| (s as f32 / 32768.0) - 1.0).sum();
                                sum / ch.len() as f32
                            })
                            .collect();
                        push_mono_and_emit(&mono, &buf, &le, &app_ev);
                    },
                    err_fn,
                    None,
                )
            }
            other => Err(cpal::BuildStreamError::StreamConfigNotSupported),
        };

        let stream = match stream_result {
            Ok(s) => s,
            Err(e) => {
                let _ = ready_tx.send(Err(anyhow!(
                    "Could not start Windows microphone stream ({}). Check Windows Privacy & security → Microphone.",
                    e
                )));
                return;
            }
        };

        if let Err(e) = stream.play() {
            let _ = ready_tx.send(Err(anyhow!("Could not start microphone capture: {}", e)));
            return;
        }

        let _ = ready_tx.send(Ok(()));

        // Wait until stop or cancel signal
        let cancelled = stop_rx.recv().unwrap_or(true);
        if !cancelled {
            // Brief drain so the final WASAPI capture packet lands before dropping the stream
            std::thread::sleep(Duration::from_millis(120));
        }
        drop(stream);

        if cancelled {
            let _ = std::fs::remove_file(&wav_path);
            let _ = result_tx.send(Err(anyhow!("Recording cancelled")));
            return;
        }

        let raw = captured.lock().map(|g| g.clone()).unwrap_or_default();
        let filtered = high_pass_80hz(&raw, sample_rate);
        let resampled = resample_to_16k(&filtered, sample_rate);
        let (samples_16k, peak) = normalize_and_pad_16k(&resampled);
        let count = samples_16k.len();

        match write_wav_16k(&wav_path, &samples_16k) {
            Ok(()) => {
                let _ = result_tx.send(Ok((wav_path, count, peak)));
            }
            Err(e) => {
                let _ = std::fs::remove_file(&wav_path);
                let _ = result_tx.send(Err(e));
            }
        }
    });

    match ready_rx.recv_timeout(Duration::from_secs(6)) {
        Ok(Ok(())) => Ok(ActiveNativeRecording {
            stop_tx: Some(stop_tx),
            result_rx: Some(result_rx),
        }),
        Ok(Err(e)) => Err(e),
        Err(_) => Err(anyhow!(
            "Timed out starting microphone capture. Check Windows Settings → Privacy & security → Microphone."
        )),
    }
}

pub fn stop_native_recording(mut rec: ActiveNativeRecording) -> Result<(PathBuf, usize, f32)> {
    if let Some(tx) = rec.stop_tx.take() {
        let _ = tx.send(false);
    }
    if let Some(rx) = rec.result_rx.take() {
        rx.recv_timeout(Duration::from_secs(6))
            .map_err(|_| anyhow!("Timed out finalizing recording"))?
    } else {
        Err(anyhow!("No active Windows recording"))
    }
}

pub fn cancel_native_recording(mut rec: ActiveNativeRecording) {
    if let Some(tx) = rec.stop_tx.take() {
        let _ = tx.send(true);
    }
}

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const TARGET_SAMPLE_RATE = 16000;

function averageMagnitude(arr) {
  if (!arr.length) return 0;
  let sum = 0;
  for (let i = 0; i < arr.length; i++) sum += Math.abs(arr[i]);
  return sum / arr.length;
}

function normalizeLevels(timeDomain, points = 26) {
  if (!timeDomain.length) return Array.from({ length: points }, () => 0.08);
  const chunkSize = Math.max(1, Math.floor(timeDomain.length / points));
  return Array.from({ length: points }, (_, i) => {
    let peak = 0;
    for (let j = 0; j < chunkSize; j++) {
      const v = Math.abs(timeDomain[i * chunkSize + j] || 0);
      if (v > peak) peak = v;
    }
    return Math.max(0.08, Math.min(1, peak * 2.2));
  });
}

function downsample(input, inputRate, outputRate) {
  if (outputRate === inputRate) return input;
  const ratio = inputRate / outputRate;
  const outLength = Math.floor(input.length / ratio);
  const out = new Float32Array(outLength);
  let pos = 0;
  for (let i = 0; i < outLength; i++) {
    const next = Math.floor((i + 1) * ratio);
    let sum = 0;
    let count = 0;
    for (let j = pos; j < next && j < input.length; j++) {
      sum += input[j];
      count++;
    }
    out[i] = count > 0 ? sum / count : 0;
    pos = next;
  }
  return out;
}

function encodeWav(samples, sampleRate) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeStr = (off, s) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)); };

  writeStr(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    offset += 2;
  }
  return buffer;
}

function useRecorder({
  enabledSilenceDetection = true,
  silenceDurationMs = 2000,
  onRecordingComplete,
  onStateChange,
  onError
}) {
  const streamRef = useRef(null);
  const audioContextRef = useRef(null);
  const processorRef = useRef(null);
  const analyserRef = useRef(null);
  const sourceRef = useRef(null);
  const chunksRef = useRef([]);
  const totalSamplesRef = useRef(0);
  const sampleRateRef = useRef(0);
  const rafRef = useRef(0);
  const silenceStartedAtRef = useRef(null);
  const isRecordingRef = useRef(false);
  const stopRequestedRef = useRef(false);
  const [levels, setLevels] = useState(Array.from({ length: 26 }, () => 0.08));
  const [isRecording, setIsRecording] = useState(false);

  const teardown = useCallback(() => {
    window.cancelAnimationFrame(rafRef.current);
    try { processorRef.current?.disconnect(); } catch (_) {}
    try { sourceRef.current?.disconnect(); } catch (_) {}
    try { analyserRef.current?.disconnect(); } catch (_) {}
    if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      audioContextRef.current.close().catch(() => {});
    }
    streamRef.current = null;
    audioContextRef.current = null;
    processorRef.current = null;
    analyserRef.current = null;
    sourceRef.current = null;
    silenceStartedAtRef.current = null;
  }, []);

  const finalize = useCallback(async () => {
    const chunks = chunksRef.current;
    const total = totalSamplesRef.current;
    const sourceRate = sampleRateRef.current;
    const merged = new Float32Array(total);
    let pos = 0;
    for (const c of chunks) { merged.set(c, pos); pos += c.length; }
    chunksRef.current = [];
    totalSamplesRef.current = 0;

    const resampled = downsample(merged, sourceRate, TARGET_SAMPLE_RATE);
    const wav = encodeWav(resampled, TARGET_SAMPLE_RATE);

    isRecordingRef.current = false;
    setIsRecording(false);
    onStateChange?.(false);
    teardown();
    await onRecordingComplete?.(wav);
  }, [onRecordingComplete, onStateChange, teardown]);

  const stop = useCallback(() => {
    if (!isRecordingRef.current || stopRequestedRef.current) return;
    stopRequestedRef.current = true;
    finalize();
  }, [finalize]);

  const start = useCallback(async () => {
    if (isRecordingRef.current) return;
    stopRequestedRef.current = false;
    chunksRef.current = [];
    totalSamplesRef.current = 0;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, noiseSuppression: true, echoCancellation: true }
      });
      streamRef.current = stream;

      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const audioContext = new AudioCtx();
      audioContextRef.current = audioContext;
      sampleRateRef.current = audioContext.sampleRate;

      const source = audioContext.createMediaStreamSource(stream);
      sourceRef.current = source;

      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);
      analyserRef.current = analyser;

      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;
      processor.onaudioprocess = (event) => {
        const channel = event.inputBuffer.getChannelData(0);
        const copy = new Float32Array(channel.length);
        copy.set(channel);
        chunksRef.current.push(copy);
        totalSamplesRef.current += copy.length;
      };
      source.connect(processor);
      processor.connect(audioContext.destination);

      const timeData = new Float32Array(analyser.fftSize);
      const tick = () => {
        analyser.getFloatTimeDomainData(timeData);
        setLevels(normalizeLevels(timeData));

        if (enabledSilenceDetection) {
          const mag = averageMagnitude(timeData);
          const threshold = 0.012;
          if (mag < threshold) {
            if (!silenceStartedAtRef.current) silenceStartedAtRef.current = Date.now();
            if (Date.now() - silenceStartedAtRef.current >= silenceDurationMs) {
              stop();
              return;
            }
          } else {
            silenceStartedAtRef.current = null;
          }
        }
        rafRef.current = window.requestAnimationFrame(tick);
      };

      isRecordingRef.current = true;
      setIsRecording(true);
      onStateChange?.(true);
      tick();
    } catch (error) {
      onError?.(error.message || "Unable to access the microphone.");
      teardown();
    }
  }, [enabledSilenceDetection, onError, onStateChange, silenceDurationMs, stop, teardown]);

  useEffect(() => () => teardown(), [teardown]);

  return useMemo(() => ({ start, stop, isRecording, levels }), [isRecording, levels, start, stop]);
}

export default useRecorder;

import { useEffect, useRef, useState } from "react";
import {
  Mic,
  Square,
  Copy,
  Check,
  FilePlus2,
  Sparkles,
  Shield,
  ShieldOff,
  Cpu,
  ArrowRight,
  Clock,
  MessageSquareText,
  Zap,
  AlertTriangle,
  Sliders,
  Volume2,
  RotateCcw,
} from "lucide-react";
import useRecorder from "../hooks/useRecorder";
import { LiveWaveform } from "./VaniLogo";
import { FloatingHudPill, BottomHudPill } from "../Overlay";

const CONTEXT_MODES = [
  { id: "general", label: "General", desc: "Balanced punctuation & clarity" },
  { id: "email", label: "Email", desc: "Polished paragraphs & sign-offs" },
  { id: "slack", label: "Slack", desc: "Concise, conversational tone" },
  { id: "notes", label: "Notes", desc: "Structured bullet points" },
  { id: "code", label: "Code", desc: "Technical terms & code comments" },
];

function countWords(text) {
  return (text || "").trim().split(/\s+/).filter(Boolean).length;
}

function formatTimer(ms) {
  const secs = Math.floor(ms / 1000);
  const tenths = Math.floor((ms % 1000) / 100);
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${tenths}`;
}

function FloatingPillSandbox({ settings, onOpenHudStudio }) {
  const [previewPhase, setPreviewPhase] = useState("recording");

  return (
    <div className="vani-card p-5 flex flex-col justify-between gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-[var(--brand)]" />
            <h3 className="text-sm font-semibold text-[var(--text)]">Floating HUD Preview</h3>
          </div>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Live pill triggered by holding <kbd className="vani-kbd">⌥ Option</kbd>.{" "}
            <button
              type="button"
              onClick={onOpenHudStudio}
              className="font-medium text-[var(--brand)] hover:underline"
            >
              Customize HUD &amp; Menu Bar →
            </button>
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-0.5">
          {[
            ["recording", "Rec"],
            ["processing", "AI"],
            ["done", "Done"],
            ["error", "Err"],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setPreviewPhase(key)}
              className={`rounded-md px-2 py-1 text-[11px] font-medium transition ${
                previewPhase === key
                  ? "bg-[var(--brand-soft)] text-[var(--brand)]"
                  : "text-[var(--muted)] hover:text-[var(--text)]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Simulated macOS desktop strip using the actual shared Overlay HUD */}
      <div className="relative flex h-24 items-center justify-center overflow-hidden rounded-xl border border-[var(--border)] bg-[radial-gradient(ellipse_at_top,rgba(244,114,182,0.14),transparent_65%),var(--bg-app)]">
        {(previewPhase === "recording" || previewPhase === "processing") && (
          <FloatingHudPill
            phase={previewPhase}
            simulatedEnergy={0.7}
            visible
            elapsedMs={4200}
            modeLabel={settings.cleanupContext || "general"}
            hudStyle={settings.hudStyle || "breathwave"}
            showTimer={settings.hudShowTimer !== false}
            showMode={settings.hudShowMode !== false}
            glass={settings.hudGlass !== false}
          />
        )}
        {(previewPhase === "done" || previewPhase === "error") && (
          <BottomHudPill
            phase={previewPhase}
            text={
              previewPhase === "done"
                ? "Pasted: “Ship the new VANI release…”"
                : "Microphone permission needed"
            }
            visible
            glass={settings.hudGlass !== false}
          />
        )}
      </div>
    </div>
  );
}

export default function HomeView({
  settings,
  onSaveSettings,
  permissions,
  whisperStatus,
  models,
  history,
  onNavigate,
  onSaveAsNote,
  onNotify,
}) {
  const [phase, setPhase] = useState("idle"); // idle | recording | processing | done | error
  const [result, setResult] = useState(null);
  const [showRaw, setShowRaw] = useState(false);
  const [copied, setCopied] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [simulatingMic, setSimulatingMic] = useState(false);
  const timerRef = useRef(null);
  const startedAtRef = useRef(0);

  const installedCount = (models || []).filter((m) => m.installed).length;
  const activeModelObj = (models || []).find((m) => m.id === settings.whisperModel);
  const totalWords = (history || []).reduce((acc, e) => acc + countWords(e.cleanedText || e.rawText), 0);
  const minutesSaved = Math.max(0, Math.round((totalWords / 42 - totalWords / 145) * 10) / 10);

  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const runTranscribe = async (wavBuffer) => {
    setPhase("processing");
    try {
      const r = await window.vani?.dictationComplete?.({ wavBuffer: wavBuffer || new ArrayBuffer(44) });
      if (r && r.ok === false) {
        setResult({ error: r.error || "Nothing heard." });
        setPhase("error");
      } else {
        setResult(r);
        setPhase("done");
        setShowRaw(false);
      }
    } catch (e) {
      setResult({ error: e.message || "Transcription failed." });
      setPhase("error");
    }
  };

  const recorder = useRecorder({
    enabledSilenceDetection: false,
    onError: (msg) => {
      // In browser preview without mic access, allow graceful simulated demo recording
      if (window.vani?.isPreview) {
        setSimulatingMic(true);
        return;
      }
      stopTimer();
      setPhase("error");
      setResult({ error: msg });
    },
    onRecordingComplete: async (wavBuffer) => {
      stopTimer();
      setSimulatingMic(false);
      await runTranscribe(wavBuffer);
    },
  });

  useEffect(() => () => stopTimer(), []);

  const startRecording = () => {
    setResult(null);
    setElapsedMs(0);
    setPhase("recording");
    startedAtRef.current = Date.now();
    stopTimer();
    timerRef.current = setInterval(() => {
      setElapsedMs(Date.now() - startedAtRef.current);
    }, 80);

    if (window.vani?.isPreview && !navigator.mediaDevices?.getUserMedia) {
      setSimulatingMic(true);
      return;
    }
    recorder.start();
  };

  const stopRecording = () => {
    stopTimer();
    if (simulatingMic || !recorder.isRecording) {
      setSimulatingMic(false);
      runTranscribe(new ArrayBuffer(44));
    } else {
      recorder.stop();
    }
  };

  const handleCopy = async (text) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      onNotify?.("Copied transcript to clipboard");
      setTimeout(() => setCopied(false), 1800);
    } catch {
      onNotify?.("Could not access clipboard", "error");
    }
  };

  const recent = (history || []).slice(0, 3);
  const displayResultText = showRaw && result?.rawText ? result.rawText : result?.text;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Top Hero Header & Quick Controls */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-[var(--text)]">Voice Studio</h1>
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
                whisperStatus?.modelInstalled || settings.transcriptionProvider === "openai"
                  ? "bg-[var(--emerald-soft)] text-[var(--emerald)]"
                  : "bg-[var(--amber-soft)] text-[var(--amber)]"
              }`}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-current" />
              {settings.transcriptionProvider === "openai"
                ? "Cloud Whisper"
                : whisperStatus?.modelInstalled
                ? `Ready · ${activeModelObj?.name || settings.whisperModel}`
                : "Model download needed"}
            </span>
          </div>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Hold <kbd className="vani-kbd">⌥ Option</kbd> anywhere on macOS to speak and paste, or test live right here.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              const next = !settings.privacyMode;
              onSaveSettings({ privacyMode: next });
              onNotify?.(next ? "Privacy Shield enabled — 100% local, no history saved" : "Privacy Shield disabled");
            }}
            className={`inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-semibold transition ${
              settings.privacyMode
                ? "border-emerald-500/40 bg-[var(--emerald-soft)] text-[var(--emerald)]"
                : "border-[var(--border)] bg-[var(--bg-surface)] text-[var(--text-soft)] hover:bg-[var(--bg-hover)]"
            }`}
          >
            {settings.privacyMode ? <Shield className="h-3.5 w-3.5" /> : <ShieldOff className="h-3.5 w-3.5" />}
            {settings.privacyMode ? "Privacy Shield On" : "Privacy Shield Off"}
          </button>

          <button
            type="button"
            onClick={() => onNavigate("models")}
            className="vani-btn-secondary inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold"
          >
            <Cpu className="h-3.5 w-3.5 text-[var(--brand)]" />
            Models ({installedCount})
          </button>
        </div>
      </div>

      {/* Warning banner if local model missing */}
      {settings.transcriptionProvider !== "openai" && !whisperStatus?.modelInstalled && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-500/35 bg-[var(--amber-soft)] px-4 py-3">
          <div className="flex items-center gap-2.5 text-sm text-[var(--amber)]">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>
              Your active model <strong className="font-semibold">{settings.whisperModel}</strong> isn’t downloaded yet.
            </span>
          </div>
          <button
            type="button"
            onClick={() => onNavigate("models")}
            className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500/20 px-3 py-1.5 text-xs font-semibold text-[var(--amber)] hover:bg-amber-500/30"
          >
            Download a model <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Interactive Live Dictation Playground */}
      <div className="vani-card relative overflow-hidden p-6">
        <div
          className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full opacity-20 blur-3xl"
          style={{ background: "radial-gradient(circle, var(--brand), transparent 70%)" }}
        />

        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Volume2 className="h-4 w-4 text-[var(--brand)]" />
              <h2 className="text-base font-semibold text-[var(--text)]">Live Dictation Playground</h2>
            </div>
            <p className="mt-0.5 text-xs text-[var(--muted)]">
              Record directly here to test acoustic clarity, filler removal, snippets, and mode formatting.
            </p>
          </div>

          {/* Mode Quick-Switcher Pills */}
          <div className="flex flex-wrap items-center gap-1 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-1">
            {CONTEXT_MODES.map((m) => {
              const active = (settings.cleanupContext || "general") === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    onSaveSettings({ cleanupContext: m.id });
                    onNotify?.(`Switched dictation mode to ${m.label}`);
                  }}
                  title={m.desc}
                  className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                    active
                      ? "bg-[var(--brand-soft)] text-[var(--brand)] shadow-sm"
                      : "text-[var(--muted)] hover:text-[var(--text)]"
                  }`}
                >
                  {m.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Waveform Stage */}
        <div className="relative mt-5 flex flex-col items-center justify-center gap-4 rounded-2xl border border-[var(--border)] bg-[var(--bg-app)] px-6 py-7">
          <div className="flex w-full items-center justify-between text-[11px] text-[var(--muted)]">
            <span className="inline-flex items-center gap-1.5">
              <span
                className={`h-2 w-2 rounded-full ${
                  phase === "recording"
                    ? "animate-pulse bg-pink-500"
                    : phase === "processing"
                    ? "animate-pulse bg-violet-400"
                    : "bg-[var(--emerald)]"
                }`}
              />
              {phase === "recording"
                ? "Listening — speak naturally"
                : phase === "processing"
                ? "Running local speech pipeline…"
                : "Mic standby"}
            </span>
            <span className="font-mono tabular-nums text-[var(--text-soft)]">
              {phase === "recording" ? formatTimer(elapsedMs) : "16 kHz PCM"}
            </span>
          </div>

          <LiveWaveform
            levels={recorder.levels}
            active={phase === "recording"}
            simulate={phase === "recording" && simulatingMic}
            width={420}
            height={56}
            className="max-w-full"
          />

          <div className="flex flex-wrap items-center justify-center gap-3">
            {phase === "recording" ? (
              <button
                type="button"
                onClick={stopRecording}
                className="inline-flex items-center gap-2 rounded-full border border-red-500/40 bg-red-500/15 px-5 py-2.5 text-sm font-semibold text-red-400 transition hover:bg-red-500/25"
              >
                <Square className="h-3.5 w-3.5 fill-current" />
                Stop &amp; Transcribe
              </button>
            ) : (
              <button
                type="button"
                onClick={startRecording}
                disabled={phase === "processing"}
                className="vani-btn-primary inline-flex items-center gap-2 rounded-full px-6 py-2.5 text-sm font-semibold"
              >
                <Mic className="h-4 w-4" />
                {phase === "processing" ? "Transcribing…" : phase === "done" ? "Record Again" : "Start Voice Test"}
              </button>
            )}

            {(phase === "done" || phase === "error") && (
              <button
                type="button"
                onClick={() => {
                  setPhase("idle");
                  setResult(null);
                }}
                className="vani-btn-secondary inline-flex items-center gap-1.5 rounded-full px-3.5 py-2.5 text-xs font-medium"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Reset
              </button>
            )}
          </div>

          {/* Pipeline chips */}
          <div className="flex flex-wrap items-center justify-center gap-1.5 pt-1 text-[11px] text-[var(--muted)]">
            <span className="rounded-md border border-[var(--border)] bg-[var(--bg-surface)] px-2 py-0.5">
              {settings.transcriptionProvider === "openai" ? "OpenAI Whisper" : `whisper-rs · ${settings.whisperModel}`}
            </span>
            <ArrowRight className="h-3 w-3 opacity-50" />
            <span
              className={`rounded-md border px-2 py-0.5 ${
                settings.fillerWordRemoval
                  ? "border-[var(--brand)]/30 bg-[var(--brand-soft)] text-[var(--brand)]"
                  : "border-[var(--border)] bg-[var(--bg-surface)]"
              }`}
            >
              Filler removal: {settings.fillerWordRemoval ? "On" : "Off"}
            </span>
            <ArrowRight className="h-3 w-3 opacity-50" />
            <span className="rounded-md border border-[var(--border)] bg-[var(--bg-surface)] px-2 py-0.5">
              Snippets: {(settings.snippets || []).length}
            </span>
            <ArrowRight className="h-3 w-3 opacity-50" />
            <span className="rounded-md border border-[var(--border)] bg-[var(--bg-surface)] px-2 py-0.5">
              Cleanup: {settings.cleanupProvider === "none" ? "Local" : settings.cleanupProvider}
            </span>
          </div>
        </div>

        {/* Result Output Card */}
        {phase === "done" && result && (
          <div className="mt-4 rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] p-4 animate-scale-in">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-[var(--border)]">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--brand)]">
                  Transcript Output
                </span>
                <span className="rounded-md bg-[var(--bg-subtle)] px-2 py-0.5 text-[11px] text-[var(--muted)]">
                  {countWords(displayResultText)} words
                </span>
                {result.providerLabel && (
                  <span className="font-mono text-[11px] text-[var(--muted)]">{result.providerLabel}</span>
                )}
              </div>

              <div className="flex items-center gap-1.5">
                {result.rawText && result.rawText !== result.text && (
                  <button
                    type="button"
                    onClick={() => setShowRaw((v) => !v)}
                    className={`rounded-lg border px-2.5 py-1 text-[11px] font-medium transition ${
                      showRaw
                        ? "border-[var(--brand)]/40 bg-[var(--brand-soft)] text-[var(--brand)]"
                        : "border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)]"
                    }`}
                  >
                    {showRaw ? "Showing Raw" : "Compare Raw"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleCopy(displayResultText)}
                  className="vani-btn-secondary inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-medium"
                >
                  {copied ? <Check className="h-3 w-3 text-[var(--emerald)]" /> : <Copy className="h-3 w-3" />}
                  {copied ? "Copied" : "Copy"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onSaveAsNote?.(result.text || result.rawText || "");
                  }}
                  className="vani-btn-secondary inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-medium"
                >
                  <FilePlus2 className="h-3 w-3" />
                  Save to Notes
                </button>
              </div>
            </div>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-[var(--text)]">
              {displayResultText || <span className="italic text-[var(--muted)]">No speech detected.</span>}
            </p>
          </div>
        )}

        {phase === "error" && result?.error && (
          <div className="mt-4 flex items-center gap-2.5 rounded-xl border border-red-500/30 bg-[var(--danger-soft)] px-4 py-3 text-xs text-[var(--danger)]">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>{result.error}</span>
          </div>
        )}
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        {[
          {
            label: "Words Dictated",
            value: totalWords.toLocaleString(),
            sub: `${(history || []).length} total sessions`,
            icon: MessageSquareText,
            accent: "text-[var(--brand)]",
          },
          {
            label: "Est. Time Saved",
            value: minutesSaved >= 60 ? `${(minutesSaved / 60).toFixed(1)} hrs` : `${minutesSaved} min`,
            sub: "vs 42 WPM typing",
            icon: Clock,
            accent: "text-[var(--emerald)]",
          },
          {
            label: "Active Mode",
            value: (settings.cleanupContext || "general").replace(/^\w/, (c) => c.toUpperCase()),
            sub: settings.cleanupProvider === "none" ? "Local pipeline" : `${settings.cleanupProvider} cleanup`,
            icon: Sliders,
            accent: "text-[var(--violet)]",
          },
          {
            label: "System Ready",
            value: permissions.accessibility ? "Full Access" : "Check Access",
            sub: `Mic: ${permissions.microphone || "ready"}`,
            icon: Zap,
            accent: permissions.accessibility ? "text-[var(--emerald)]" : "text-[var(--amber)]",
          },
        ].map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="vani-card p-4">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]">{card.label}</p>
                <Icon className={`h-4 w-4 ${card.accent}`} />
              </div>
              <p className="mt-2 text-2xl font-bold tracking-tight text-[var(--text)] tabular-nums">{card.value}</p>
              <p className="mt-0.5 text-xs text-[var(--muted)]">{card.sub}</p>
            </div>
          );
        })}
      </div>

      {/* Bottom Grid: Floating HUD Sandbox + Recent Transcriptions */}
      <div className="grid gap-4 lg:grid-cols-2">
        <FloatingPillSandbox settings={settings} onOpenHudStudio={() => onNavigate("hud")} />

        <div className="vani-card p-5 flex flex-col justify-between gap-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[var(--text)]">Recent Dictations</h3>
            <button
              type="button"
              onClick={() => onNavigate("history")}
              className="inline-flex items-center gap-1 text-xs font-medium text-[var(--brand)] hover:underline"
            >
              View all <ArrowRight className="h-3 w-3" />
            </button>
          </div>

          {recent.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-[var(--border)] py-6 text-center">
              <p className="text-xs text-[var(--muted)]">No dictations recorded yet.</p>
              <p className="mt-1 text-[11px] text-[var(--muted-strong)]">Hold ⌥ Option anywhere or use the playground above.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {recent.map((entry) => {
                const body = entry.cleanedText || entry.rawText;
                return (
                  <div
                    key={entry.id}
                    className="group flex items-start justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3.5 py-2.5 transition hover:border-[var(--border-strong)]"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-xs leading-relaxed text-[var(--text)]">{body}</p>
                      <p className="mt-1 text-[10px] text-[var(--muted)]">
                        {new Date(entry.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} ·{" "}
                        {countWords(body)} words
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCopy(body)}
                      className="shrink-0 rounded-lg border border-[var(--border)] p-1.5 text-[var(--muted)] opacity-70 transition hover:bg-[var(--bg-hover)] hover:text-[var(--text)] group-hover:opacity-100"
                      title="Copy transcript"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

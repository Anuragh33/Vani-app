import { useEffect, useRef, useState } from "react";
import {
  Mic,
  Square,
  Copy,
  Check,
  FilePlus2,
  Shield,
  ShieldOff,
  Cpu,
  ArrowRight,
  Zap,
  AlertTriangle,
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

function FloatingPillSandbox({ settings, systemInfo, onOpenHudStudio }) {
  const [previewPhase, setPreviewPhase] = useState("recording");
  const isMac = systemInfo ? Boolean(systemInfo.isMac) : true;
  const pushToTalkKey = systemInfo?.pushToTalkKey || (isMac ? "⌥ Option" : "Right Alt");

  return (
    <div className="vani-card flex h-full flex-col gap-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-medium text-[var(--text)]">Floating HUD preview</h3>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Triggered by holding <kbd className="vani-kbd">{pushToTalkKey}</kbd>.{" "}
            <button
              type="button"
              onClick={onOpenHudStudio}
              className="font-medium text-[var(--text-soft)] hover:text-[var(--text)] hover:underline"
            >
              {isMac ? "Customize HUD & menu bar" : "Customize HUD & system tray"}
            </button>
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-0.5 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-0.5">
          {[
            ["recording", "Rec"],
            ["processing", "AI"],
            ["error", "Err"],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setPreviewPhase(key)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                previewPhase === key
                  ? "bg-[var(--bg-surface)] text-[var(--text)]"
                  : "text-[var(--muted)] hover:text-[var(--text)]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Matte desktop strip using the actual shared Overlay HUD */}
      <div className="relative flex min-h-[124px] flex-1 items-center justify-center overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-app)]">
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
        {previewPhase === "error" && (
          <BottomHudPill
            phase="error"
            text="Microphone permission needed"
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
  systemInfo,
  onSaveSettings,
  permissions,
  whisperStatus,
  appleAi,
  models,
  history,
  onNavigate,
  onSaveAsNote,
  onNotify,
}) {
  const isMac = systemInfo ? Boolean(systemInfo.isMac) : true;
  const osName = systemInfo?.osName || (isMac ? "macOS" : "Windows");
  const pushToTalkKey = systemInfo?.pushToTalkKey || (isMac ? "⌥ Option" : "Right Alt");
  const usingAppleStt = isMac && settings.transcriptionProvider === "apple";
  const usingApplePolish = isMac && settings.cleanupProvider === "apple";
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

  const runTranscribe = async (payload) => {
    setPhase("processing");
    try {
      const arg =
        payload && typeof payload === "object" && ("wavPath" in payload || "wavBuffer" in payload)
          ? payload
          : { wavBuffer: payload || new ArrayBuffer(44) };
      const r = await window.vani?.dictationComplete?.(arg);
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
    onRecordingComplete: async (payload) => {
      stopTimer();
      setSimulatingMic(false);
      await runTranscribe(payload);
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
    if (simulatingMic || (window.vani?.isPreview && !recorder.isRecording)) {
      setSimulatingMic(false);
      runTranscribe({ wavBuffer: new ArrayBuffer(44) });
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
      {/* Top Header & Quick Controls */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-medium tracking-[-0.02em] text-[var(--text)]">VANI Studio</h1>
            <span className="inline-flex items-center gap-1.5 font-mono text-xs text-[var(--muted)]">
              <span
                className={`h-2 w-2 rounded-full ${
                  usingAppleStt ||
                  whisperStatus?.modelInstalled ||
                  settings.transcriptionProvider === "openai"
                    ? "bg-[var(--emerald)]"
                    : "bg-[var(--amber)]"
                }`}
              />
              {usingAppleStt
                ? "Apple SpeechAnalyzer"
                : settings.transcriptionProvider === "openai"
                ? "Cloud Whisper"
                : whisperStatus?.modelInstalled
                ? activeModelObj?.name || settings.whisperModel
                : "Model download needed"}
            </span>
          </div>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Hold <kbd className="vani-kbd">{pushToTalkKey}</kbd> anywhere on {osName} to transcribe at your cursor, or test below
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
            className={`inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-xs font-medium transition-colors ${
              settings.privacyMode
                ? "border-[var(--emerald)]/35 bg-[var(--emerald-soft)] text-[var(--emerald)]"
                : "border-[var(--border)] bg-[var(--bg-surface)] text-[var(--text-soft)] hover:bg-[var(--bg-hover)]"
            }`}
          >
            {settings.privacyMode ? (
              <Shield className="h-4 w-4" strokeWidth={1.5} />
            ) : (
              <ShieldOff className="h-4 w-4" strokeWidth={1.5} />
            )}
            {settings.privacyMode ? "Privacy Shield on" : "Privacy Shield off"}
          </button>

          <button
            type="button"
            onClick={() => onNavigate("models")}
            className="vani-btn-secondary inline-flex h-9 items-center gap-2 px-3 text-xs"
          >
            <Cpu className="h-4 w-4 text-[var(--muted)]" strokeWidth={1.5} />
            <span>Models ({installedCount})</span>
          </button>
        </div>
      </div>

      {/* Accessibility permission warning — macOS ONLY */}
      {isMac && !permissions.accessibility && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-500/35 bg-[var(--amber-soft)] px-4 py-3">
          <div className="flex items-center gap-2.5 text-sm text-[var(--amber)]">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>
              Enable <strong>VANI</strong> in macOS <strong>Accessibility</strong> so holding{" "}
              <kbd className="vani-kbd">⌥ Option</kbd> shows the Floating HUD and pastes into any app.
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => window.vani?.openAccessibilitySettings?.()}
              className="rounded-lg bg-amber-500/20 px-3 py-1.5 text-xs font-semibold text-[var(--amber)] hover:bg-amber-500/30"
            >
              Open Accessibility Settings
            </button>
          </div>
        </div>
      )}

      {/* Warning banner if local open-source model missing */}
      {!usingAppleStt && settings.transcriptionProvider !== "openai" && !whisperStatus?.modelInstalled && (
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
      <div className="vani-card p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Volume2 className="h-4 w-4 text-[var(--muted)]" strokeWidth={1.5} />
              <h2 className="text-base font-medium text-[var(--text)]">Live dictation playground</h2>
            </div>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Record here to test mic clarity, filler removal, snippets, and mode formatting
            </p>
          </div>

          {/* Mode Quick-Switcher */}
          <div className="flex flex-wrap items-center gap-0.5 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-0.5">
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
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    active
                      ? "bg-[var(--bg-surface)] text-[var(--text)]"
                      : "text-[var(--muted)] hover:text-[var(--text)]"
                  }`}
                >
                  {m.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Waveform Stage (The Bright Acoustic Moment) */}
        <div className="mt-5 flex flex-col items-center justify-center gap-4 rounded-xl border border-[var(--border)] bg-[var(--bg-app)] px-6 py-7">
          <div className="flex w-full items-center justify-between text-xs text-[var(--muted)]">
            <span className="inline-flex items-center gap-2">
              <span
                className={`h-2 w-2 rounded-full ${
                  phase === "recording"
                    ? "bg-[var(--brand)]"
                    : phase === "processing"
                    ? "bg-[var(--amber)]"
                    : "bg-[var(--emerald)]"
                }`}
              />
              {phase === "recording"
                ? "Listening"
                : phase === "processing"
                ? "Transcribing locally"
                : "Mic standby"}
            </span>
            <span className="font-mono text-xs tabular-nums text-[var(--text-soft)]">
              {phase === "recording" ? formatTimer(elapsedMs) : "16 kHz PCM"}
            </span>
          </div>

          <LiveWaveform
            levels={recorder.levels}
            active={phase === "recording"}
            simulate={phase === "recording" && simulatingMic}
            width={520}
            height={56}
            className="w-full max-w-[520px]"
          />

          <div className="flex flex-wrap items-center justify-center gap-2.5">
            {phase === "recording" ? (
              <button
                type="button"
                onClick={stopRecording}
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-[var(--danger)]/40 bg-[var(--danger-soft)] px-4 text-sm font-medium text-[var(--danger)] transition-colors"
              >
                <Square className="h-3.5 w-3.5 fill-current" />
                Stop and transcribe
              </button>
            ) : (
              <button
                type="button"
                onClick={startRecording}
                disabled={phase === "processing"}
                className="vani-btn-primary inline-flex h-10 items-center gap-2 px-5 text-sm"
              >
                <Mic className="h-4 w-4" strokeWidth={1.75} />
                {phase === "processing" ? "Transcribing" : phase === "done" ? "Record again" : "Start voice test"}
              </button>
            )}

            {(phase === "done" || phase === "error") && (
              <button
                type="button"
                onClick={() => {
                  setPhase("idle");
                  setResult(null);
                }}
                className="vani-btn-secondary inline-flex h-10 items-center gap-1.5 px-3.5 text-xs"
              >
                <RotateCcw className="h-3.5 w-3.5" strokeWidth={1.5} />
                Reset
              </button>
            )}
          </div>

          {/* Pipeline meta strip */}
          <div className="flex flex-wrap items-center justify-center gap-2 pt-1 font-mono text-[11px] text-[var(--muted)]">
            <span>
              {usingAppleStt
                ? "Apple SpeechAnalyzer"
                : settings.transcriptionProvider === "openai"
                ? "OpenAI Whisper"
                : isMac
                ? `Metal · ${settings.whisperModel}`
                : `Local · ${settings.whisperModel}`}
            </span>
            <ArrowRight className="h-3 w-3 opacity-50" strokeWidth={1.5} />
            <span className={settings.fillerWordRemoval ? "text-[var(--text-soft)]" : ""}>
              Filler removal: {settings.fillerWordRemoval ? "on" : "off"}
            </span>
            <ArrowRight className="h-3 w-3 opacity-50" strokeWidth={1.5} />
            <span>Snippets: {(settings.snippets || []).length}</span>
            <ArrowRight className="h-3 w-3 opacity-50" strokeWidth={1.5} />
            <span>
              Polish:{" "}
              {usingApplePolish
                ? "Apple Foundation Model"
                : !settings.cleanupProvider || settings.cleanupProvider === "none" || (!isMac && settings.cleanupProvider === "apple")
                ? "Local rules"
                : settings.cleanupProvider}
            </span>
          </div>
        </div>

        {/* Result Output Card */}
        {phase === "done" && result && (
          <div className="mt-4 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] p-4 animate-scale-in">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] pb-2.5">
              <div className="flex items-center gap-3">
                <span className="text-xs font-medium text-[var(--text)]">Transcript output</span>
                <span className="font-mono text-xs text-[var(--muted)] tabular-nums">
                  {countWords(displayResultText)} words
                </span>
                {result.providerLabel && (
                  <span className="font-mono text-xs text-[var(--muted)]">{result.providerLabel}</span>
                )}
              </div>

              <div className="flex items-center gap-1.5">
                {result.rawText && result.rawText !== result.text && (
                  <button
                    type="button"
                    onClick={() => setShowRaw((v) => !v)}
                    className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
                      showRaw
                        ? "border-[var(--brand)]/40 bg-[var(--brand-soft)] text-[var(--text)]"
                        : "border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)]"
                    }`}
                  >
                    {showRaw ? "Showing raw" : "Compare raw"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleCopy(displayResultText)}
                  className="vani-btn-secondary inline-flex items-center gap-1.5 px-2.5 py-1 text-xs"
                >
                  {copied ? (
                    <Check className="h-3.5 w-3.5 text-[var(--emerald)]" strokeWidth={1.5} />
                  ) : (
                    <Copy className="h-3.5 w-3.5" strokeWidth={1.5} />
                  )}
                  {copied ? "Copied" : "Copy"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onSaveAsNote?.(result.text || result.rawText || "");
                  }}
                  className="vani-btn-secondary inline-flex items-center gap-1.5 px-2.5 py-1 text-xs"
                >
                  <FilePlus2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                  Save to notes
                </button>
              </div>
            </div>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-[var(--text)]">
              {result.actionExecuted ? (
                <span className="inline-flex items-center gap-2 rounded-lg bg-[var(--emerald-soft)] px-3 py-1.5 text-xs font-medium text-[var(--emerald)]">
                  <Zap className="h-3.5 w-3.5" strokeWidth={1.5} />
                  Vani Action: {result.actionSummary || result.actionKind}
                </span>
              ) : (
                displayResultText || <span className="text-[var(--muted)]">No speech detected</span>
              )}
            </p>
          </div>
        )}

        {phase === "error" && result?.error && (
          <div className="mt-4 flex items-center gap-2.5 rounded-xl border border-[var(--danger)]/30 bg-[var(--danger-soft)] px-4 py-3 text-xs text-[var(--danger)]">
            <AlertTriangle className="h-4 w-4 shrink-0" strokeWidth={1.5} />
            <span>{result.error}</span>
          </div>
        )}
      </div>

      {/* KPI Strip — numbers only, no decorative icons */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          {
            label: "Words dictated",
            value: totalWords.toLocaleString(),
            sub: `${(history || []).length} sessions`,
          },
          {
            label: "Time saved",
            value: minutesSaved >= 60 ? `${(minutesSaved / 60).toFixed(1)}h` : `${minutesSaved}m`,
            sub: "vs 42 WPM typing",
          },
          {
            label: "Active mode",
            value: (settings.cleanupContext || "general").replace(/^\w/, (c) => c.toUpperCase()),
            sub:
              !settings.cleanupProvider || settings.cleanupProvider === "none" || (!isMac && settings.cleanupProvider === "apple")
                ? "Local rules"
                : `${settings.cleanupProvider} polish`,
          },
          {
            label: "System access",
            value: permissions.accessibility ? "Ready" : "Check access",
            sub: `Mic: ${permissions.microphone || "ready"}`,
          },
        ].map((card) => (
          <div key={card.label} className="vani-card p-5">
            <p className="text-xs text-[var(--muted)]">{card.label}</p>
            <p className="mt-2 font-mono text-2xl font-medium tracking-tight text-[var(--text)] tabular-nums">
              {card.value}
            </p>
            <p className="mt-1 text-xs text-[var(--muted)]">{card.sub}</p>
          </div>
        ))}
      </div>

      {/* Bottom Grid: Floating HUD Sandbox + Recent Transcriptions */}
      <div className="grid items-stretch gap-4 lg:grid-cols-2">
        <FloatingPillSandbox settings={settings} systemInfo={systemInfo} onOpenHudStudio={() => onNavigate("hud")} />

        <div className="vani-card flex h-full flex-col gap-3 p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-[var(--text)]">Recent dictations</h3>
            <button
              type="button"
              onClick={() => onNavigate("history")}
              className="inline-flex items-center gap-1 text-xs font-medium text-[var(--text-soft)] hover:text-[var(--text)]"
            >
              View all <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.5} />
            </button>
          </div>

          {recent.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-[var(--border)] py-6 text-center">
              <p className="text-xs text-[var(--muted)]">No dictations recorded yet</p>
              <p className="mt-1 text-xs text-[var(--muted-strong)]">
                Hold {pushToTalkKey} anywhere or use the playground above
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {recent.map((entry) => {
                const body = entry.cleanedText || entry.rawText;
                return (
                  <div
                    key={entry.id}
                    className="group flex items-start justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3.5 py-2.5 transition-colors hover:border-[var(--border-strong)]"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-xs leading-relaxed text-[var(--text)]">{body}</p>
                      <p className="mt-1 font-mono text-[11px] text-[var(--muted)] tabular-nums">
                        {new Date(entry.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} ·{" "}
                        {countWords(body)} words
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCopy(body)}
                      className="shrink-0 rounded-lg border border-[var(--border)] p-1.5 text-[var(--muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text)]"
                      title="Copy transcript"
                    >
                      <Copy className="h-3.5 w-3.5" strokeWidth={1.5} />
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

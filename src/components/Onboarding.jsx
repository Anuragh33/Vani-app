import { useEffect, useState } from "react";
import {
  Shield,
  Sparkles,
  WifiOff,
  Mic,
  Accessibility,
  Cpu,
  Download,
  KeyRound,
  Keyboard,
  CheckCircle2,
  ArrowRight,
  RefreshCw,
} from "lucide-react";
import { VaniLogo } from "./VaniLogo";

const STEPS = ["welcome", "permissions", "setup", "apikeys", "hotkey", "done"];

function StepDots({ current }) {
  const idx = STEPS.indexOf(current);
  return (
    <div className="flex items-center justify-center gap-2">
      {STEPS.map((s, i) => (
        <span
          key={s}
          className={`h-1.5 rounded-full transition-all duration-200 ${
            i === idx
              ? "w-6 bg-[var(--brand)]"
              : i < idx
              ? "w-2 bg-[var(--brand)]/45"
              : "w-1.5 bg-[var(--border-strong)]"
          }`}
        />
      ))}
    </div>
  );
}

function WelcomeStep({ systemInfo, onNext }) {
  const isMac = systemInfo ? Boolean(systemInfo.isMac) : true;
  const pushToTalkKey = systemInfo?.pushToTalkKey || (isMac ? "⌥ Option" : "Right Alt");
  return (
    <div className="flex flex-col items-center text-center space-y-6">
      <VaniLogo size={60} />
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[var(--text)]">Welcome to VANI</h1>
        <p className="mt-2 max-w-md text-sm text-[var(--muted)]">
          Hold <kbd className="vani-kbd">{pushToTalkKey}</kbd>, speak naturally, and your polished words appear at your cursor — powered by on-device speech recognition.
        </p>
      </div>
      <div className="grid w-full grid-cols-3 gap-3 text-left">
        {[
          { icon: Shield, title: "Private by design", desc: isMac ? "Audio stays on your Mac." : "Audio stays on your PC." },
          { icon: Sparkles, title: "Works everywhere", desc: "Slack, Mail, IDE, Docs." },
          { icon: WifiOff, title: "100% offline ready", desc: "Built-in whisper-rs engine." },
        ].map(({ icon: Icon, title, desc }) => (
          <div key={title} className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-3.5">
            <Icon className="h-4 w-4 text-[var(--brand)]" />
            <p className="mt-2 text-xs font-semibold text-[var(--text)]">{title}</p>
            <p className="mt-0.5 text-[11px] text-[var(--muted)]">{desc}</p>
          </div>
        ))}
      </div>
      <button type="button" onClick={onNext} className="vani-btn-primary inline-flex items-center gap-2 rounded-xl px-6 py-2.5 text-sm font-semibold">
        Get started <ArrowRight className="h-4 w-4" />
      </button>
    </div>
  );
}

function PermissionsStep({ systemInfo, onNext }) {
  const isMac = systemInfo ? Boolean(systemInfo.isMac) : true;
  const [micStatus, setMicStatus] = useState("unknown");
  const [accOk, setAccOk] = useState(!isMac);
  const [requesting, setRequesting] = useState(false);

  useEffect(() => {
    window.vani?.checkPermissions?.().then((r) => {
      if (r) {
        setAccOk(!!r.accessibility);
        if (r.microphone && r.microphone !== "unknown") setMicStatus(r.microphone);
      }
    });
  }, []);

  const requestMic = async () => {
    setRequesting(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      setMicStatus("granted");
    } catch {
      setMicStatus("denied");
    } finally {
      setRequesting(false);
    }
  };

  const recheck = async () => {
    const r = await window.vani?.checkPermissions?.();
    if (r) setAccOk(!!r.accessibility);
    if (micStatus === "unknown") await requestMic();
  };

  const micOk = micStatus === "granted";

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-[var(--text)]">System Permissions</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          {isMac
            ? "VANI needs two macOS permissions to listen and paste text."
            : "Allow microphone access so VANI can transcribe your voice locally."}
        </p>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--brand-soft)] text-[var(--brand)]">
              <Mic className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-semibold text-[var(--text)]">Microphone</p>
              <p className="text-xs text-[var(--muted)]">Captures your voice locally for transcription.</p>
              {micStatus === "denied" && (
                <p className="mt-1 text-[11px] text-[var(--amber)]">
                  {isMac
                    ? "System Settings → Privacy & Security → Microphone → enable VANI."
                    : "Windows Settings → Privacy & security → Microphone → allow desktop apps."}
                </p>
              )}
            </div>
          </div>
          {micStatus === "unknown" ? (
            <button
              type="button"
              onClick={requestMic}
              disabled={requesting}
              className="vani-btn-primary rounded-xl px-3.5 py-1.5 text-xs font-semibold"
            >
              {requesting ? "Requesting…" : "Allow"}
            </button>
          ) : (
            <span className={`text-xs font-semibold capitalize ${micOk ? "text-[var(--emerald)]" : "text-[var(--amber)]"}`}>
              {micStatus}
            </span>
          )}
        </div>

        {isMac && (
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--violet-soft)] text-[var(--violet)]">
                <Accessibility className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-semibold text-[var(--text)]">Accessibility</p>
                <p className="text-xs text-[var(--muted)]">Types transcribed text seamlessly into your active app.</p>
                {!accOk && (
                  <p className="mt-1 text-[11px] text-[var(--amber)]">
                    System Settings → Privacy &amp; Security → Accessibility → enable VANI.
                  </p>
                )}
              </div>
            </div>
            <span className={`text-xs font-semibold ${accOk ? "text-[var(--emerald)]" : "text-[var(--amber)]"}`}>
              {accOk ? "Granted" : "Needed"}
            </span>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 pt-2">
        <button
          type="button"
          onClick={recheck}
          className="vani-btn-secondary inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Re-check
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={micStatus === "denied"}
          className="vani-btn-primary inline-flex items-center gap-1.5 rounded-xl px-5 py-2 text-sm font-semibold"
        >
          Continue <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function SetupStep({ onNext, whisperStatus, models, downloads, onDownload }) {
  const modelOk = whisperStatus?.modelInstalled;
  const installedCount = (models || []).filter((m) => m.installed).length;
  const dl = downloads?.["ggml-base.en"];
  const pct = dl && dl.total ? Math.min(100, (dl.received / dl.total) * 100) : 0;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-[var(--text)]">Local Speech Engine</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          VANI bundles <code className="font-mono text-xs text-[var(--brand)]">whisper-rs</code> — just grab a lightweight model once.
        </p>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--emerald-soft)] text-[var(--emerald)]">
              <Cpu className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-semibold text-[var(--text)]">Built-in Engine</p>
              <p className="text-xs text-[var(--emerald)]">whisper-rs + ONNX ready</p>
            </div>
          </div>
          <span className="text-xs font-semibold text-[var(--emerald)]">Ready</span>
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--brand-soft)] text-[var(--brand)]">
                <Download className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-semibold text-[var(--text)]">Base (English) · 142 MB</p>
                <p className="text-xs text-[var(--muted)]">
                  {installedCount > 0
                    ? `${installedCount} local model${installedCount > 1 ? "s" : ""} installed.`
                    : "Fast, accurate starter model for English dictation."}
                </p>
              </div>
            </div>

            {modelOk ? (
              <span className="text-xs font-semibold text-[var(--emerald)]">Installed</span>
            ) : dl ? (
              <span className="font-mono text-xs text-[var(--brand)]">{pct.toFixed(0)}%</span>
            ) : (
              <button
                type="button"
                onClick={() => onDownload("ggml-base.en")}
                className="vani-btn-primary rounded-xl px-3.5 py-1.5 text-xs font-semibold"
              >
                Download
              </button>
            )}
          </div>

          {dl && (
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--bg-app)]">
              <div
                className="h-full rounded-full bg-[var(--brand)] transition-[width]"
                style={{ width: `${Math.max(4, pct)}%` }}
              />
            </div>
          )}
        </div>
      </div>

      <div className="flex justify-end pt-2">
        <button type="button" onClick={onNext} className="vani-btn-primary inline-flex items-center gap-1.5 rounded-xl px-5 py-2 text-sm font-semibold">
          {modelOk ? "Continue" : "Skip for now"} <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function ApiKeysStep({ onNext, onSaveKeys }) {
  const [openaiKey, setOpenaiKey] = useState("");
  const [anthropicKey, setAnthropicKey] = useState("");
  const [openaiStatus, setOpenaiStatus] = useState(null);
  const [anthropicStatus, setAnthropicStatus] = useState(null);

  const test = async (provider, key) => {
    if (!key) return;
    if (provider === "openai") {
      setOpenaiStatus("testing");
      const r = await window.vani?.testOpenAIKey?.(key);
      setOpenaiStatus(r?.valid ? "valid" : "invalid");
    } else {
      setAnthropicStatus("testing");
      const r = await window.vani?.testAnthropicKey?.(key);
      setAnthropicStatus(r?.valid ? "valid" : "invalid");
    }
  };

  const handleContinue = () => {
    if (openaiKey || anthropicKey) onSaveKeys({ openaiKey, anthropicKey });
    onNext();
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--violet-soft)] text-[var(--violet)]">
          <KeyRound className="h-4 w-4" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-[var(--text)]">Optional AI Cleanup Keys</h2>
          <p className="mt-0.5 text-sm text-[var(--muted)]">
            Skip to stay 100% local. You can add OpenAI or Anthropic keys later in Settings.
          </p>
        </div>
      </div>

      <div className="space-y-3">
        {[
          { provider: "openai", label: "OpenAI API Key", placeholder: "sk-...", value: openaiKey, set: setOpenaiKey, status: openaiStatus },
          { provider: "anthropic", label: "Anthropic API Key", placeholder: "sk-ant-...", value: anthropicKey, set: setAnthropicKey, status: anthropicStatus },
        ].map(({ provider, label, placeholder, value, set, status }) => (
          <div key={provider} className="rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-3.5 space-y-2">
            <p className="text-xs font-semibold text-[var(--text)]">{label}</p>
            <div className="flex gap-2">
              <input
                type="password"
                value={value}
                onChange={(e) => set(e.target.value)}
                placeholder={placeholder}
                className="vani-input flex-1 font-mono text-xs"
                autoComplete="off"
              />
              <button
                type="button"
                onClick={() => test(provider, value)}
                disabled={!value || status === "testing"}
                className={`vani-btn-secondary rounded-xl px-3 py-1.5 text-xs font-semibold ${
                  status === "valid" ? "text-[var(--emerald)]" : status === "invalid" ? "text-[var(--danger)]" : ""
                }`}
              >
                {status === "testing" ? "…" : status === "valid" ? "Valid" : status === "invalid" ? "Invalid" : "Test"}
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between pt-2">
        <button type="button" onClick={onNext} className="vani-btn-secondary rounded-xl px-4 py-2 text-xs font-semibold">
          Stay 100% Local
        </button>
        <button type="button" onClick={handleContinue} className="vani-btn-primary inline-flex items-center gap-1.5 rounded-xl px-5 py-2 text-sm font-semibold">
          Save &amp; continue <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function HotkeyStep({ systemInfo, onNext }) {
  const isMac = systemInfo ? Boolean(systemInfo.isMac) : true;
  const pushToTalkKey = systemInfo?.pushToTalkKey || (isMac ? "⌥ Option" : "Right Alt");
  const dashboardHotkey = systemInfo?.dashboardHotkey || (isMac ? "⌘ ⇧ D" : "Ctrl + Shift + D");
  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--brand-soft)] text-[var(--brand)]">
          <Keyboard className="h-4 w-4" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-[var(--text)]">Push-to-Talk Anywhere</h2>
          <p className="mt-0.5 text-sm text-[var(--muted)]">
            No windows to switch. Dictate directly into Slack, Mail, VS Code, or Notes.
          </p>
        </div>
      </div>

      <div className="flex flex-col items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--bg-app)] px-6 py-8">
        <kbd className="vani-kbd px-5 py-2.5 font-mono text-base font-semibold text-[var(--brand)]">
          {pushToTalkKey}
        </kbd>
        <p className="text-xs text-[var(--muted)]">
          Hold to speak · Release to transcribe &amp; paste right at your cursor
        </p>
      </div>

      <div className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-3 text-xs">
        <span className="text-[var(--muted)]">Toggle VANI Studio anytime</span>
        <kbd className="vani-kbd font-mono">{dashboardHotkey}</kbd>
      </div>

      <button type="button" onClick={onNext} className="vani-btn-primary w-full rounded-xl py-2.5 text-sm font-semibold">
        Got it
      </button>
    </div>
  );
}

function DoneStep({ systemInfo, onFinish }) {
  const isMac = systemInfo ? Boolean(systemInfo.isMac) : true;
  const pushToTalkKey = systemInfo?.pushToTalkKey || (isMac ? "⌥ Option" : "Right Alt");
  return (
    <div className="flex flex-col items-center text-center space-y-5 py-2">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--emerald-soft)] text-[var(--emerald)]">
        <CheckCircle2 className="h-8 w-8" />
      </div>
      <div>
        <h2 className="text-2xl font-bold text-[var(--text)]">You’re all set</h2>
        <p className="mt-2 max-w-sm text-sm text-[var(--muted)]">
          Click any text field on your {isMac ? "Mac" : "PC"}, hold <kbd className="vani-kbd">{pushToTalkKey}</kbd>, and start speaking.
        </p>
      </div>
      <button type="button" onClick={onFinish} className="vani-btn-primary rounded-xl px-6 py-2.5 text-sm font-semibold">
        Open VANI Studio
      </button>
    </div>
  );
}

export default function Onboarding({ systemInfo, onComplete, onSaveKeys, whisperStatus, models, downloads, onDownloadModel }) {
  const [step, setStep] = useState("welcome");

  const next = () => {
    const idx = STEPS.indexOf(step);
    if (idx < STEPS.length - 1) setStep(STEPS[idx + 1]);
  };

  const finish = () => {
    window.vani?.completeOnboarding?.();
    onComplete();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--modal-backdrop)] p-4 backdrop-blur-md">
      <div className="animate-scale-in flex w-full max-w-[540px] flex-col gap-6 rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-surface)] p-7 shadow-[var(--shadow-modal)]">
        <StepDots current={step} />

        {step === "welcome" && <WelcomeStep systemInfo={systemInfo} onNext={next} />}
        {step === "permissions" && <PermissionsStep systemInfo={systemInfo} onNext={next} />}
        {step === "setup" && (
          <SetupStep
            onNext={next}
            whisperStatus={whisperStatus}
            models={models}
            downloads={downloads}
            onDownload={onDownloadModel}
          />
        )}
        {step === "apikeys" && <ApiKeysStep onNext={next} onSaveKeys={onSaveKeys} />}
        {step === "hotkey" && <HotkeyStep systemInfo={systemInfo} onNext={next} />}
        {step === "done" && <DoneStep systemInfo={systemInfo} onFinish={finish} />}
      </div>
    </div>
  );
}

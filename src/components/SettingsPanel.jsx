import { useCallback, useState } from "react";
import {
  Cpu,
  Sliders,
  KeyRound,
  Activity,
  Info,
  Eye,
  EyeOff,
  Check,
  AlertCircle,
  FolderOpen,
  RefreshCw,
  Sparkles,
  Keyboard,
} from "lucide-react";
import { ToggleSwitch, VaniLogo } from "./VaniLogo";

const languageOptions = [
  ["auto", "Auto-detect"],
  ["en", "English"],
  ["es", "Spanish"],
  ["fr", "French"],
  ["de", "German"],
  ["it", "Italian"],
  ["pt", "Portuguese"],
  ["nl", "Dutch"],
  ["sv", "Swedish"],
  ["da", "Danish"],
  ["fi", "Finnish"],
  ["pl", "Polish"],
  ["tr", "Turkish"],
  ["cs", "Czech"],
  ["el", "Greek"],
  ["hi", "Hindi"],
  ["ja", "Japanese"],
  ["ko", "Korean"],
  ["zh", "Chinese"],
  ["ar", "Arabic"],
  ["ru", "Russian"],
  ["uk", "Ukrainian"],
];

function SettingRow({ title, desc, children }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-3.5">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-[var(--text)]">{title}</p>
        {desc && <p className="mt-0.5 text-xs text-[var(--muted)]">{desc}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function ApiKeyInput({ label, hint, placeholder, value, onChange, onTest }) {
  const [visible, setVisible] = useState(false);
  const [status, setStatus] = useState(null); // null | testing | valid | invalid
  const [error, setError] = useState("");

  const handleTest = useCallback(async () => {
    setStatus("testing");
    setError("");
    try {
      const res = await onTest(value);
      setStatus(res?.valid ? "valid" : "invalid");
      if (!res?.valid) setError(res?.error || "Invalid API key.");
    } catch (e) {
      setStatus("invalid");
      setError(e.message || "Connection error.");
    }
    setTimeout(() => setStatus(null), 4500);
  }, [value, onTest]);

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4 space-y-2.5">
      <div>
        <p className="text-sm font-semibold text-[var(--text)]">{label}</p>
        <p className="mt-0.5 text-xs text-[var(--muted)]">{hint}</p>
      </div>
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <input
            type={visible ? "text" : "password"}
            value={value || ""}
            onChange={(e) => {
              onChange(e.target.value);
              setStatus(null);
            }}
            placeholder={placeholder}
            autoComplete="off"
            className={`vani-input pr-9 font-mono text-xs ${
              status === "valid"
                ? "border-emerald-500/60"
                : status === "invalid"
                ? "border-red-500/60"
                : ""
            }`}
          />
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--muted)] hover:text-[var(--text)]"
            aria-label={visible ? "Hide key" : "Show key"}
          >
            {visible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          </button>
        </div>

        <button
          type="button"
          onClick={handleTest}
          disabled={!value || status === "testing"}
          className="vani-btn-secondary inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold"
        >
          {status === "valid" && <Check className="h-3.5 w-3.5 text-[var(--emerald)]" />}
          {status === "invalid" && <AlertCircle className="h-3.5 w-3.5 text-[var(--danger)]" />}
          {status === "testing" ? "Testing…" : status === "valid" ? "Valid" : status === "invalid" ? "Failed" : "Test"}
        </button>
      </div>
      {status === "invalid" && error && <p className="text-xs text-[var(--danger)]">{error}</p>}
    </div>
  );
}

function HotkeyCapture({ value, onChange, error }) {
  const [capturing, setCapturing] = useState(false);

  const handleKeyDown = (e) => {
    if (!capturing) return;
    e.preventDefault();
    if (e.key === "Escape") {
      setCapturing(false);
      return;
    }
    const parts = [];
    if (e.metaKey || e.ctrlKey) parts.push("CommandOrControl");
    if (e.altKey) parts.push("Alt");
    if (e.shiftKey) parts.push("Shift");
    const key = e.key.length === 1 ? e.key.toUpperCase() : e.key === " " ? "Space" : e.key;
    if (!["Meta", "Control", "Alt", "Shift"].includes(e.key)) {
      parts.push(key);
      onChange(parts.join("+"));
      setCapturing(false);
    }
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={capturing ? "Press shortcut keys… (Esc to cancel)" : value || ""}
          onChange={(e) => !capturing && onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => setCapturing(false)}
          className={`vani-input flex-1 font-mono text-xs ${
            capturing ? "border-[var(--brand)] ring-2 ring-[var(--brand-ring)]" : ""
          } ${error ? "border-red-500/60" : ""}`}
        />
        <button
          type="button"
          onClick={() => setCapturing((v) => !v)}
          className="vani-btn-secondary inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold"
        >
          <Keyboard className="h-3.5 w-3.5" />
          {capturing ? "Listening…" : "Record"}
        </button>
      </div>
      {error && (
        <p className="text-xs text-[var(--danger)]">
          Invalid or conflicting hotkey. Reverted to: {error}
        </p>
      )}
    </div>
  );
}

const TABS = [
  { id: "engine", label: "Engine & Audio", icon: Cpu },
  { id: "behavior", label: "Behavior & Hotkeys", icon: Sliders },
  { id: "cloud", label: "Cloud & APIs", icon: KeyRound },
  { id: "diagnostics", label: "Diagnostics", icon: Activity },
  { id: "about", label: "About VANI", icon: Info },
];

export default function SettingsPanel({
  settings,
  systemInfo,
  onChange,
  models,
  whisperStatus,
  appleAi,
  permissions,
  onRecheckPermissions,
  onOpenModelsDir,
  onReplayOnboarding,
  hotkeyError,
  onNotify,
}) {
  const [tab, setTab] = useState("engine");
  const isMac = systemInfo ? Boolean(systemInfo.isMac) : true;
  const osName = systemInfo?.osName || (isMac ? "macOS" : "Windows");
  const pushToTalkKey = systemInfo?.pushToTalkKey || (isMac ? "⌥ Option" : "Right Alt");
  const fileManagerName = systemInfo?.fileManagerName || (isMac ? "Finder" : "Explorer");
  const dashboardHotkey = systemInfo?.dashboardHotkey || (isMac ? "⌘⇧D" : "Ctrl+Shift+D");
  const installedModels = (models || []).filter((m) => m.installed);
  const effectiveStt =
    !isMac && settings.transcriptionProvider === "apple"
      ? "local"
      : settings.transcriptionProvider || (isMac ? "apple" : "local");
  const effectiveCleanup =
    !isMac && settings.cleanupProvider === "apple"
      ? "none"
      : settings.cleanupProvider || (isMac ? "apple" : "none");

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[var(--text)]">Settings</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Configure local speech inference, hotkeys, optional cloud APIs, and {osName} system permissions.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[210px_1fr]">
        {/* Left Sub-Navigation */}
        <nav className="vani-card h-fit p-2 space-y-0.5">
          {TABS.map((item) => {
            const Icon = item.icon;
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-medium transition ${
                  active
                    ? "bg-[var(--bg-active)] text-[var(--brand)]"
                    : "text-[var(--muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Right Tab Content */}
        <div className="vani-card p-5 space-y-4">
          {tab === "engine" && (
            <>
              <div>
                <h2 className="text-base font-semibold text-[var(--text)]">Transcription Engine</h2>
                <p className="mt-0.5 text-xs text-[var(--muted)]">
                  VANI bundles <code className="font-mono text-[var(--brand)]">whisper-rs</code> &amp; ONNX natively — zero external installs required.
                </p>
              </div>

              <SettingRow
                title="Speech-to-Text Engine"
                desc={
                  isMac
                    ? "Pick Apple’s zero-download on-device SpeechAnalyzer, open-source Whisper/Parakeet, or Cloud."
                    : "Run open-source Whisper/Parakeet 100% locally on your PC, or optionally use OpenAI Cloud."
                }
              >
                <div className="flex rounded-xl border border-[var(--border)] bg-[var(--bg-app)] p-0.5">
                  {[
                    ...(isMac ? [["apple", "Apple On-Device"]] : []),
                    ["local", "Whisper / Parakeet"],
                    ["openai", "OpenAI Cloud"],
                  ].map(([val, label]) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => onChange({ transcriptionProvider: val })}
                      className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
                        effectiveStt === val
                          ? "bg-[var(--brand-soft)] text-[var(--brand)]"
                          : "text-[var(--muted)] hover:text-[var(--text)]"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </SettingRow>

              {effectiveStt === "local" && (
                <>
                  <SettingRow
                    title="Active Speech Model"
                    desc="Download additional Whisper or NVIDIA Parakeet models in the Models tab."
                  >
                    <select
                      value={settings.whisperModel}
                      onChange={(e) => onChange({ whisperModel: e.target.value })}
                      className="vani-input w-56 text-xs"
                    >
                      {installedModels.length === 0 && (
                        <option value={settings.whisperModel}>{settings.whisperModel} (not downloaded)</option>
                      )}
                      {installedModels.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name} ({m.size})
                        </option>
                      ))}
                    </select>
                  </SettingRow>

                  <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-[var(--text)]">Inference CPU Threads</p>
                        <p className="text-xs text-[var(--muted)]">Higher threads speed up larger Whisper models.</p>
                      </div>
                      <span className="font-mono text-sm font-semibold text-[var(--brand)] tabular-nums">
                        {settings.threads} threads
                      </span>
                    </div>
                    <input
                      type="range"
                      min="1"
                      max="16"
                      step="1"
                      value={settings.threads || 4}
                      onChange={(e) => onChange({ threads: Number(e.target.value) })}
                      className="vani-range"
                    />
                  </div>
                </>
              )}

              <SettingRow title="Speech Language" desc="Auto-detect requires a multilingual Whisper model.">
                <select
                  value={settings.language || "auto"}
                  onChange={(e) => onChange({ language: e.target.value })}
                  className="vani-input w-48 text-xs"
                >
                  {languageOptions.map(([val, label]) => (
                    <option key={val} value={val}>
                      {label}
                    </option>
                  ))}
                </select>
              </SettingRow>

              <SettingRow
                title="Translate to English"
                desc="Automatically translate non-English speech into English text."
              >
                <ToggleSwitch
                  checked={Boolean(settings.translate)}
                  onChange={(val) => onChange({ translate: val })}
                  label="Translate to English"
                />
              </SettingRow>

              <SettingRow title="Models Directory" desc="Open where downloaded .bin and .onnx weights live.">
                <button
                  type="button"
                  onClick={onOpenModelsDir}
                  className="vani-btn-secondary inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold"
                >
                  <FolderOpen className="h-3.5 w-3.5" />
                  Reveal in {fileManagerName}
                </button>
              </SettingRow>
            </>
          )}

          {tab === "behavior" && (
            <>
              <div>
                <h2 className="text-base font-semibold text-[var(--text)]">Behavior &amp; Shortcuts</h2>
                <p className="mt-0.5 text-xs text-[var(--muted)]">
                  Hold <kbd className="vani-kbd">{pushToTalkKey}</kbd> for push-to-talk dictation anywhere, or customize secondary triggers.
                </p>
              </div>

              <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4 space-y-2.5">
                <div>
                  <p className="text-sm font-medium text-[var(--text)]">Secondary Global Hotkey</p>
                  <p className="text-xs text-[var(--muted)]">
                    Click Record and press your preferred shortcut combination.
                  </p>
                </div>
                <HotkeyCapture
                  value={settings.hotkey}
                  onChange={(hotkey) => onChange({ hotkey })}
                  error={hotkeyError}
                />
              </div>

              <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-[var(--text)]">Silence Auto-Stop Threshold</p>
                    <p className="text-xs text-[var(--muted)]">How long VANI waits in silence before finishing.</p>
                  </div>
                  <span className="font-mono text-sm font-semibold text-[var(--brand)] tabular-nums">
                    {((settings.silenceDurationMs || 2000) / 1000).toFixed(2)}s
                  </span>
                </div>
                <input
                  type="range"
                  min="500"
                  max="4000"
                  step="250"
                  value={settings.silenceDurationMs || 2000}
                  onChange={(e) => onChange({ silenceDurationMs: Number(e.target.value) })}
                  className="vani-range"
                />
              </div>

              {[
                ["voiceActionsEnabled", "Hands-free Voice Actions", "Launch apps (“Open Antigravity”), focus chat (“Start typing”), and submit (“Press enter”) by voice."],
                ["autoInject", "Auto-inject into active app", "Paste transcript directly at your cursor on release."],
                ["autoStopOnSilence", "Auto-stop on silence", "Stop recording automatically when you finish speaking."],
                ["fillerWordRemoval", "Remove filler words", "Clean out “um”, “uh”, and hesitations locally."],
                ["startAtLogin", `Launch VANI at ${osName} login`, isMac ? "Keep VANI ready in your menu bar after restart." : "Keep VANI ready in your system tray after restart."],
                ["privacyMode", "Privacy Shield mode", "Force local-only inference and never write to history."],
              ].map(([key, title, desc]) => (
                <SettingRow key={key} title={title} desc={desc}>
                  <ToggleSwitch
                    checked={Boolean(settings[key])}
                    onChange={(val) => onChange({ [key]: val })}
                    label={title}
                  />
                </SettingRow>
              ))}
            </>
          )}

          {tab === "cloud" && (
            <>
              <div>
                <h2 className="text-base font-semibold text-[var(--text)]">Cloud Providers &amp; BYOK Keys</h2>
                <p className="mt-0.5 text-xs text-[var(--muted)]">
                  Optional. Keys are stored locally in your app data directory and bypassed whenever Privacy Shield is on.
                </p>
              </div>

              <SettingRow
                title="AI Text Cleanup Provider"
                desc={
                  isMac
                    ? "Apple Foundation Model runs 100% on-device with zero API keys. Cloud BYOK is optional."
                    : "Local Rules run 100% offline. Optional Cloud BYOK adds LLM polishing."
                }
              >
                <select
                  value={effectiveCleanup}
                  onChange={(e) => onChange({ cleanupProvider: e.target.value })}
                  className="vani-input w-56 text-xs"
                >
                  {isMac && <option value="apple">Apple Foundation Model (On-Device)</option>}
                  <option value="none">Local Rules Only</option>
                  <option value="anthropic">Anthropic Claude (BYOK)</option>
                  <option value="openai">OpenAI GPT-4o mini (BYOK)</option>
                </select>
              </SettingRow>

              <ApiKeyInput
                label="OpenAI API Key"
                hint="Used for optional Cloud Whisper transcription and GPT-4o mini cleanup."
                placeholder="sk-..."
                value={settings.openaiKey}
                onChange={(openaiKey) => onChange({ openaiKey })}
                onTest={(key) => window.vani?.testOpenAIKey?.(key)}
              />

              <ApiKeyInput
                label="Anthropic API Key"
                hint="Used for optional Claude Haiku grammar and context formatting."
                placeholder="sk-ant-..."
                value={settings.anthropicKey}
                onChange={(anthropicKey) => onChange({ anthropicKey })}
                onTest={(key) => window.vani?.testAnthropicKey?.(key)}
              />
            </>
          )}

          {tab === "diagnostics" && (
            <>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-[var(--text)]">System Diagnostics</h2>
                  <p className="mt-0.5 text-xs text-[var(--muted)]">
                    Verify permissions and local model paths on this {isMac ? "Mac" : "PC"}.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    await onRecheckPermissions?.();
                    onNotify?.("Re-checked permissions & model status");
                  }}
                  className="vani-btn-secondary inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Re-check
                </button>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
                  <p className="text-xs font-semibold text-[var(--muted)]">Microphone Permission</p>
                  <p
                    className={`mt-1.5 text-sm font-semibold capitalize ${
                      permissions.microphone === "granted" ? "text-[var(--emerald)]" : "text-[var(--amber)]"
                    }`}
                  >
                    {permissions.microphone || "Unknown"}
                  </p>
                </div>

                {isMac ? (
                  <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
                    <p className="text-xs font-semibold text-[var(--muted)]">Accessibility (Auto-Paste)</p>
                    <p
                      className={`mt-1.5 text-sm font-semibold ${
                        permissions.accessibility ? "text-[var(--emerald)]" : "text-[var(--amber)]"
                      }`}
                    >
                      {permissions.accessibility ? "Granted" : "Required in System Settings"}
                    </p>
                  </div>
                ) : (
                  <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
                    <p className="text-xs font-semibold text-[var(--muted)]">Global Push-to-Talk &amp; Paste</p>
                    <p className="mt-1.5 text-sm font-semibold text-[var(--emerald)]">
                      Active ({pushToTalkKey} · Win32 Hook)
                    </p>
                  </div>
                )}

                {isMac && (
                  <>
                    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
                      <p className="text-xs font-semibold text-[var(--muted)]">Apple Foundation Model (LLM)</p>
                      <p
                        className={`mt-1.5 text-sm font-semibold ${
                          appleAi?.foundationModelAvailable ? "text-[var(--emerald)]" : "text-[var(--amber)]"
                        }`}
                      >
                        {appleAi?.foundationModelAvailable
                          ? "Available On-Device"
                          : appleAi?.foundationModelReason || "Unavailable"}
                      </p>
                    </div>

                    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
                      <p className="text-xs font-semibold text-[var(--muted)]">Apple SpeechAnalyzer</p>
                      <p
                        className={`mt-1.5 text-sm font-semibold ${
                          appleAi?.speechAnalyzerAvailable ? "text-[var(--emerald)]" : "text-[var(--amber)]"
                        }`}
                      >
                        {appleAi?.speechAnalyzerAvailable
                          ? `Ready (macOS ${appleAi.macosVersion})`
                          : "Requires macOS 26+"}
                      </p>
                    </div>
                  </>
                )}

                <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4 sm:col-span-2">
                  <p className="text-xs font-semibold text-[var(--muted)]">Open-Source Speech Engines</p>
                  <p className="mt-1 font-mono text-xs text-[var(--emerald)]">
                    {isMac
                      ? "whisper-rs (Apple Silicon Metal GPU) + NVIDIA Parakeet ONNX Runtime"
                      : "whisper-rs (Native Rust CPU) + NVIDIA Parakeet ONNX Runtime"}
                  </p>
                </div>

                <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4 sm:col-span-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-[var(--muted)]">Active Model Path</p>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        whisperStatus?.modelInstalled
                          ? "bg-[var(--emerald-soft)] text-[var(--emerald)]"
                          : "bg-[var(--amber-soft)] text-[var(--amber)]"
                      }`}
                    >
                      {whisperStatus?.modelInstalled ? "On Disk" : "Not Downloaded"}
                    </span>
                  </div>
                  <p className="mt-1.5 break-all font-mono text-xs text-[var(--text-soft)]">
                    {whisperStatus?.modelPath || "—"}
                  </p>
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={onReplayOnboarding}
                  className="vani-btn-secondary inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold"
                >
                  <Sparkles className="h-3.5 w-3.5 text-[var(--brand)]" />
                  Launch Onboarding Setup Guide
                </button>
              </div>
            </>
          )}

          {tab === "about" && (
            <div className="space-y-5">
              <div className="flex items-center gap-3.5">
                <VaniLogo size={46} />
                <div>
                  <h2 className="text-lg font-bold text-[var(--text)]">VANI v2.1</h2>
                  <p className="text-xs text-[var(--muted)]">
                    {isMac
                      ? "Hybrid Apple On-Device AI & Open-Source Dictation for macOS"
                      : "Local-First Open-Source Voice Dictation for Windows"}
                  </p>
                </div>
              </div>

              <div className="divide-y divide-[var(--border)] rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-4">
                {[
                  [
                    "Transcription",
                    effectiveStt === "apple"
                      ? "Apple On-Device SpeechAnalyzer"
                      : effectiveStt === "openai"
                      ? "OpenAI Whisper API"
                      : isMac
                      ? "whisper-rs (Metal GPU) / Parakeet ONNX"
                      : "whisper-rs (Local) / Parakeet ONNX",
                  ],
                  [
                    "Text Cleanup",
                    effectiveCleanup === "apple"
                      ? "Apple Foundation Model (On-Device LLM)"
                      : effectiveCleanup === "none"
                      ? "Local rules only"
                      : effectiveCleanup,
                  ],
                  ["Privacy Status", settings.privacyMode ? "Privacy Shield Active (Zero Cloud)" : "Local-first"],
                  [
                    "Storage",
                    isMac ? "Local JSON in macOS Application Support" : "Local JSON in Windows AppData",
                  ],
                  ["Global Trigger", `Hold ${pushToTalkKey} · Dashboard ${dashboardHotkey}`],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between py-3 text-xs">
                    <span className="text-[var(--muted)]">{label}</span>
                    <span className="font-medium text-[var(--text)]">{value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

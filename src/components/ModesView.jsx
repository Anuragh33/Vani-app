import { useMemo, useState } from "react";
import {
  AlignLeft,
  Mail,
  MessageSquare,
  FileText,
  Code2,
  ArrowRight,
  SlidersHorizontal,
  Shield,
} from "lucide-react";
import { ToggleSwitch } from "./VaniLogo";

const MODES = [
  {
    id: "general",
    name: "General",
    icon: AlignLeft,
    summary: "Everyday dictation with natural punctuation and capitalization",
    exampleIn: "um hey let's meet tomorrow around 3 pm to review the launch checklist",
    exampleOut: "Hey, let's meet tomorrow around 3 PM to review the launch checklist.",
  },
  {
    id: "email",
    name: "Email",
    icon: Mail,
    summary: "Structured paragraphs and sign-offs for messages and replies",
    exampleIn: "uh hi sarah just following up on the q3 roadmap send me your notes when ready sig",
    exampleOut: "Hi Sarah,\n\nJust following up on the Q3 roadmap. Send over your notes when ready.",
  },
  {
    id: "slack",
    name: "Slack",
    icon: MessageSquare,
    summary: "Short, direct messages without formal email framing",
    exampleIn: "like hey team shipping the ui update now ping me if anything looks off",
    exampleOut: "Hey team — shipping the UI update now, ping me if anything looks off.",
  },
  {
    id: "notes",
    name: "Notes",
    icon: FileText,
    summary: "Bullet points and structured takeaways while thinking aloud",
    exampleIn: "um action items first finish waveform animation second benchmark parakeet third publish release",
    exampleOut: "• Finish waveform animation\n• Benchmark Parakeet ONNX\n• Publish release",
  },
  {
    id: "code",
    name: "Code",
    icon: Code2,
    summary: "Preserves identifiers, filenames, and concise technical prompts",
    exampleIn: "uh refactor useRecorder hook to downsample audio to 16 kilohertz mono pcm",
    exampleOut: "Refactor `useRecorder` hook to downsample audio to 16kHz mono PCM.",
  },
];

function simulateTransform(input, settings) {
  let out = input.trim();
  if (!out) return "";

  if (settings.fillerWordRemoval) {
    out = out
      .replace(/\b(um|uh|er|ah|hmm|you know|like,)\b/gi, "")
      .replace(/\s{2,}/g, " ")
      .trim();
  }

  for (const s of settings.snippets || []) {
    if (!s.trigger) continue;
    const escaped = s.trigger.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(`\\b${escaped}\\b`, "gi"), s.expansion);
  }

  if (out.length > 0) {
    out = out.charAt(0).toUpperCase() + out.slice(1);
    if (!/[.!?]$/.test(out)) out += ".";
  }
  return out;
}

export default function ModesView({ settings, systemInfo, appleAi, onSaveSettings, onNotify }) {
  const isMac = systemInfo ? Boolean(systemInfo.isMac) : true;
  const activeModeId = settings.cleanupContext || "general";
  const activeMode = MODES.find((m) => m.id === activeModeId) || MODES[0];
  const effectiveCleanup =
    !isMac && settings.cleanupProvider === "apple"
      ? "none"
      : settings.cleanupProvider || (isMac ? "apple" : "none");
  const [sandboxText, setSandboxText] = useState(
    "um hey team uh let's book a review using cal and ship the VANI update today"
  );
  const [appleTestOut, setAppleTestOut] = useState("");
  const [appleTesting, setAppleTesting] = useState(false);

  const transformed = useMemo(() => simulateTransform(sandboxText, settings), [sandboxText, settings]);

  const runLiveApplePolish = async () => {
    if (!sandboxText.trim()) return;
    setAppleTesting(true);
    try {
      const res = await window.vani?.testApplePolish?.(sandboxText, activeModeId);
      if (res?.ok && res.text) {
        setAppleTestOut(res.text);
        onNotify?.("Polished with Apple Foundation Model on-device");
      } else {
        onNotify?.(res?.error || "Apple Foundation Model unavailable", "error");
      }
    } finally {
      setAppleTesting(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-medium tracking-[-0.02em] text-[var(--text)]">Modes &amp; pipeline</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Shape how VANI cleans and formats speech before pasting at your cursor
          </p>
        </div>

        <div className="flex h-9 items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 text-xs">
          <SlidersHorizontal className="h-4 w-4 text-[var(--muted)]" strokeWidth={1.5} />
          <span className="text-[var(--muted)]">Cleanup engine</span>
          <select
            value={effectiveCleanup}
            onChange={(e) => {
              onSaveSettings({ cleanupProvider: e.target.value });
              onNotify?.("Updated cleanup engine");
            }}
            className="bg-transparent font-medium text-[var(--text)] outline-none cursor-pointer"
          >
            {isMac && <option value="apple">Apple Foundation Model (On-Device)</option>}
            <option value="none">Local rules only</option>
            <option value="anthropic">Anthropic Claude (BYOK)</option>
            <option value="openai">OpenAI GPT-4o mini (BYOK)</option>
          </select>
        </div>
      </div>

      {/* Mode Selector Grid — zero overflow at any width */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {MODES.map((mode) => {
          const Icon = mode.icon;
          const selected = activeModeId === mode.id;
          return (
            <button
              key={mode.id}
              type="button"
              onClick={() => {
                onSaveSettings({ cleanupContext: mode.id });
                setSandboxText(mode.exampleIn);
                onNotify?.(`Active mode set to ${mode.name}`);
              }}
              className={`min-w-0 flex flex-col justify-between rounded-xl border p-4 text-left transition-colors ${
                selected
                  ? "border-[var(--border-strong)] bg-[var(--bg-elevated)] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
                  : "border-[var(--border)] bg-[var(--bg-surface)] hover:border-[var(--border-strong)]"
              }`}
            >
              <div className="min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <Icon
                      className={`h-4 w-4 shrink-0 ${
                        selected ? "text-[var(--brand)]" : "text-[var(--muted)]"
                      }`}
                      strokeWidth={1.5}
                    />
                    <span className="truncate text-sm font-medium text-[var(--text)]">{mode.name}</span>
                  </div>
                  {selected && (
                    <span className="inline-flex shrink-0 items-center gap-1.5 font-mono text-[11px] text-[var(--brand)]">
                      <span className="h-1.5 w-1.5 rounded-full bg-[var(--brand)]" />
                      Active
                    </span>
                  )}
                </div>
                <p className="mt-2.5 text-xs leading-relaxed text-[var(--muted)]">{mode.summary}</p>
              </div>

              <div className="mt-4 rounded-lg border border-[var(--border)] bg-[var(--bg-app)] px-3 py-2 font-mono text-[11px] leading-relaxed text-[var(--text-soft)]">
                <p className="line-clamp-2 whitespace-pre-line">{mode.exampleOut}</p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Pipeline Controls & Live Simulator */}
      <div className="grid gap-4 lg:grid-cols-12">
        <div className="vani-card p-5 lg:col-span-5 space-y-4">
          <h2 className="text-sm font-medium text-[var(--text)]">Processing pipeline</h2>

          <div className="space-y-2.5">
            {[
              {
                key: "fillerWordRemoval",
                title: "Remove filler words",
                desc: "Strip “um”, “uh”, “like”, and verbal hesitations locally",
              },
              {
                key: "autoInject",
                title: "Auto-inject at cursor",
                desc: "Paste directly into your active app right after release",
              },
              {
                key: "autoStopOnSilence",
                title: "Auto-stop on silence",
                desc: `End recording after ${(settings.silenceDurationMs / 1000).toFixed(1)}s of silence`,
              },
              {
                key: "privacyMode",
                title: "Privacy Shield (100% on-device)",
                desc: isMac
                  ? "Block cloud APIs and skip history while keeping Apple Foundation Model local"
                  : "Block cloud APIs and skip history for offline dictation",
              },
            ].map((item) => (
              <div
                key={item.key}
                className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3.5 py-3"
              >
                <div className="min-w-0">
                  <p className="text-xs font-medium text-[var(--text)]">{item.title}</p>
                  <p className="mt-0.5 text-xs text-[var(--muted)]">{item.desc}</p>
                </div>
                <ToggleSwitch
                  checked={Boolean(settings[item.key])}
                  onChange={(val) => onSaveSettings({ [item.key]: val })}
                  label={item.title}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Live Interactive Simulator */}
        <div className="vani-card p-5 lg:col-span-7 flex flex-col justify-between gap-4">
          <div>
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-medium text-[var(--text)]">Pipeline simulator</h2>
                <p className="mt-0.5 text-xs text-[var(--muted)]">
                  Enter spoken text with fillers or triggers like{" "}
                  <code className="font-mono text-[var(--text)]">
                    {settings.snippets?.[0]?.trigger || "addr"}
                  </code>{" "}
                  to preview local cleanup
                </p>
              </div>
              {settings.privacyMode && (
                <span className="inline-flex items-center gap-1.5 font-mono text-xs text-[var(--emerald)]">
                  <Shield className="h-3.5 w-3.5" strokeWidth={1.5} />
                  Local only
                </span>
              )}
            </div>

            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1.5 block text-xs text-[var(--muted)]">Spoken input</label>
                <textarea
                  value={sandboxText}
                  onChange={(e) => setSandboxText(e.target.value)}
                  rows={3}
                  className="vani-input resize-none text-sm"
                  placeholder="Try typing: um hello uh send this to addr"
                />
              </div>

              <div className="flex items-center gap-2 font-mono text-xs text-[var(--muted)]">
                <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.5} />
                <span>
                  Mode: {activeMode.name} · Fillers {settings.fillerWordRemoval ? "removed" : "kept"} ·{" "}
                  {(settings.snippets || []).length} snippets
                </span>
              </div>

              <div className="rounded-xl border border-[var(--border-strong)] bg-[var(--bg-app)] p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-mono text-xs text-[var(--muted)]">
                    {isMac && appleTestOut ? "Apple Foundation Model output" : "Preview output"}
                  </p>
                  {isMac && appleAi?.foundationModelAvailable && (
                    <button
                      type="button"
                      onClick={runLiveApplePolish}
                      disabled={appleTesting}
                      className="vani-btn-secondary h-7 px-2.5 text-xs disabled:opacity-50"
                    >
                      {appleTesting ? "Polishing" : "Test Apple LLM"}
                    </button>
                  )}
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-[var(--text)]">
                  {appleTestOut || transformed || (
                    <span className="text-[var(--muted)]">Enter text above to preview</span>
                  )}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

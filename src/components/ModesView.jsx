import { useMemo, useState } from "react";
import {
  Mail,
  MessageSquare,
  FileText,
  Code2,
  Sparkles,
  Check,
  ArrowRight,
  Wand2,
  Shield,
  SlidersHorizontal,
} from "lucide-react";
import { ToggleSwitch } from "./VaniLogo";

const MODES = [
  {
    id: "general",
    name: "General",
    icon: Sparkles,
    color: "text-[var(--brand)]",
    bg: "bg-[var(--brand-soft)]",
    summary: "Natural everyday dictation with clean punctuation and capitalization.",
    exampleIn: "um hey let's meet tomorrow around 3 pm to review the launch checklist",
    exampleOut: "Hey, let's meet tomorrow around 3 PM to review the launch checklist.",
  },
  {
    id: "email",
    name: "Email",
    icon: Mail,
    color: "text-sky-400",
    bg: "bg-sky-500/15",
    summary: "Professional tone, crisp paragraphs, and structured follow-ups.",
    exampleIn: "uh hi sarah just following up on the q3 roadmap send me your notes when ready sig",
    exampleOut: "Hi Sarah,\n\nJust following up on the Q3 roadmap. Please send over your notes whenever you're ready.\n\nBest regards,\nAnuragh",
  },
  {
    id: "slack",
    name: "Slack",
    icon: MessageSquare,
    color: "text-emerald-400",
    bg: "bg-emerald-500/15",
    summary: "Tight, punchy messages without stiff email formality.",
    exampleIn: "like hey team shipping the ui update now ping me if anything looks off",
    exampleOut: "Hey team — shipping the UI update now, ping me if anything looks off!",
  },
  {
    id: "notes",
    name: "Notes",
    icon: FileText,
    color: "text-amber-400",
    bg: "bg-amber-500/15",
    summary: "Scannable bullet points and concise takeaways for thinking out loud.",
    exampleIn: "um action items first finish waveform animation second benchmark parakeet third publish release",
    exampleOut: "• Finish waveform animation\n• Benchmark Parakeet ONNX\n• Publish release",
  },
  {
    id: "code",
    name: "Code",
    icon: Code2,
    color: "text-violet-400",
    bg: "bg-violet-500/15",
    summary: "Preserves technical identifiers, filenames, and concise developer instructions.",
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
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text)]">Modes &amp; Pipeline</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Shape how VANI cleans and formats your spoken words before pasting them at your cursor.
          </p>
        </div>

        <div className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] px-3.5 py-2 text-xs">
          <SlidersHorizontal className="h-3.5 w-3.5 text-[var(--brand)]" />
          <span className="text-[var(--muted)]">Cleanup Engine:</span>
          <select
            value={effectiveCleanup}
            onChange={(e) => {
              onSaveSettings({ cleanupProvider: e.target.value });
              onNotify?.("Updated cleanup engine");
            }}
            className="bg-transparent font-semibold text-[var(--text)] outline-none cursor-pointer"
          >
            {isMac && <option value="apple">Apple Foundation Model (On-Device)</option>}
            <option value="none">Local Rules Only</option>
            <option value="anthropic">Anthropic Claude (BYOK)</option>
            <option value="openai">OpenAI GPT-4o mini (BYOK)</option>
          </select>
        </div>
      </div>

      {/* Mode Cards Grid — 5 crisp equal columns on wide/fullscreen, responsive below */}
      <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
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
              className={`group relative flex flex-col justify-between rounded-2xl border p-4 text-left transition ${
                selected
                  ? "border-[var(--brand)] bg-[var(--bg-surface)] shadow-[0_0_0_1px_var(--brand-ring)]"
                  : "border-[var(--border)] bg-[var(--bg-surface)] hover:border-[var(--border-strong)] hover:bg-[var(--bg-elevated)]"
              }`}
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${mode.bg} ${mode.color}`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <p className="text-sm font-semibold text-[var(--text)]">{mode.name}</p>
                  </div>
                  {selected && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[var(--brand-soft)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--brand)]">
                      <Check className="h-3 w-3" /> Active
                    </span>
                  )}
                </div>
                <p className="mt-2.5 text-xs leading-relaxed text-[var(--muted)]">{mode.summary}</p>
              </div>

              <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--bg-app)] p-2.5 text-[11px] leading-relaxed text-[var(--text-soft)]">
                <p className="line-clamp-2 whitespace-pre-line">{mode.exampleOut}</p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Pipeline Controls & Live Simulator */}
      <div className="grid gap-4 lg:grid-cols-12">
        <div className="vani-card p-5 lg:col-span-5 space-y-4">
          <div className="flex items-center gap-2">
            <Wand2 className="h-4 w-4 text-[var(--brand)]" />
            <h2 className="text-sm font-semibold text-[var(--text)]">Processing Pipeline</h2>
          </div>

          <div className="space-y-3">
            {[
              {
                key: "fillerWordRemoval",
                title: "Remove Filler Words",
                desc: "Strip “um”, “uh”, “like”, and verbal stutters locally.",
              },
              {
                key: "autoInject",
                title: "Auto-Inject at Cursor",
                desc: "Paste directly into your active app right after release.",
              },
              {
                key: "autoStopOnSilence",
                title: "Auto-Stop on Silence",
                desc: `End recording after ${(settings.silenceDurationMs / 1000).toFixed(1)}s of quiet.`,
              },
              {
                key: "privacyMode",
                title: "Privacy Shield (100% On-Device)",
                desc: isMac
                  ? "Block all cloud APIs & skip history. Apple Foundation Model stays active locally."
                  : "Block all cloud APIs & skip history for 100% offline local dictation.",
              },
            ].map((item) => (
              <div
                key={item.key}
                className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3.5 py-3"
              >
                <div>
                  <p className="text-xs font-semibold text-[var(--text)]">{item.title}</p>
                  <p className="mt-0.5 text-[11px] text-[var(--muted)]">{item.desc}</p>
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
                <h2 className="text-sm font-semibold text-[var(--text)]">Interactive Pipeline Simulator</h2>
                <p className="mt-0.5 text-xs text-[var(--muted)]">
                  Type spoken speech with fillers or snippet triggers (e.g.{" "}
                  <code className="font-mono text-[var(--brand)]">
                    {(settings.snippets?.[0]?.trigger) || "addr"}
                  </code>
                  ) to preview VANI’s local transform live.
                </p>
              </div>
              {settings.privacyMode && (
                <span className="inline-flex items-center gap-1 rounded-full bg-[var(--emerald-soft)] px-2.5 py-1 text-[11px] font-medium text-[var(--emerald)]">
                  <Shield className="h-3 w-3" /> Local Only
                </span>
              )}
            </div>

            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]">
                  Raw Spoken Input
                </label>
                <textarea
                  value={sandboxText}
                  onChange={(e) => setSandboxText(e.target.value)}
                  rows={3}
                  className="vani-input resize-none text-sm"
                  placeholder="Try typing: um hello uh send this to addr"
                />
              </div>

              <div className="flex items-center justify-center gap-2 text-[11px] text-[var(--muted)]">
                <ArrowRight className="h-3.5 w-3.5 text-[var(--brand)]" />
                <span>
                  Mode: <strong className="text-[var(--text)]">{activeMode.name}</strong> · Fillers{" "}
                  {settings.fillerWordRemoval ? "removed" : "kept"} · {(settings.snippets || []).length} snippets active
                </span>
              </div>

              <div className="rounded-xl border border-[var(--brand)]/30 bg-[var(--bg-app)] p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--brand)]">
                    {isMac && appleTestOut ? "Apple Foundation Model Output" : "Local Preview Output"}
                  </p>
                  {isMac && appleAi?.foundationModelAvailable && (
                    <button
                      type="button"
                      onClick={runLiveApplePolish}
                      disabled={appleTesting}
                      className="inline-flex items-center gap-1 rounded-lg bg-[var(--violet-soft)] px-2.5 py-1 text-[11px] font-semibold text-[var(--violet)] transition hover:brightness-110 disabled:opacity-50"
                    >
                      <Sparkles className="h-3 w-3" />
                      {appleTesting ? "Polishing on-device…" : "Test Apple LLM"}
                    </button>
                  )}
                </div>
                <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-[var(--text)]">
                  {appleTestOut || transformed || <span className="italic text-[var(--muted)]">Type something above to preview…</span>}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import {
  Zap,
  Play,
  Plus,
  X,
  Search,
  AppWindow,
  CornerDownLeft,
  Keyboard,
  Mic,
  ArrowRight,
  CheckCircle2,
  Sparkles,
} from "lucide-react";
import { ToggleSwitch } from "./VaniLogo";

const EXAMPLE_PHRASES = [
  { label: "Open Antigravity", phrase: "Open Antigravity" },
  { label: "Open + Type", phrase: "Open Antigravity and type build a responsive navbar" },
  { label: "Open + Ask + Enter", phrase: "Open Antigravity and ask explain async rust" },
  { label: "Hands-Free Typing", phrase: "Start typing" },
  { label: "Submit Message", phrase: "Press enter" },
  { label: "Clear Input", phrase: "Clear input" },
];

const COMMAND_REFERENCE = [
  {
    category: "Open & Switch Apps",
    examples: ["Open Antigravity", "Launch Slack", "Switch to Chrome", "Go to Notes"],
    desc: "Launches or brings any installed app to the foreground and focuses its primary input.",
  },
  {
    category: "Chained Open + Type",
    examples: [
      "Open Antigravity and type <text>",
      "Open Antigravity and ask <question>",
      "Open Slack and message <text>",
      "Open Antigravity and start typing",
    ],
    desc: "Opens the app, focuses the chat/text box, and pastes your polished message (or starts hands-free listening).",
  },
  {
    category: "Hands-Free Chat Typing",
    examples: ["Start typing", "Start typing <text>", "Focus chat box", "Press enter / Send it"],
    desc: "Focuses the active app’s chat box and starts hands-free dictation — speak naturally and pause to paste.",
  },
  {
    category: "Quick Input Controls",
    examples: ["Press enter", "New line", "Select all", "Clear input"],
    desc: "Control message submission and editing without touching the keyboard.",
  },
];

function describeParsedAction(parsed) {
  if (!parsed || !parsed.matched || !parsed.action) return null;
  const a = parsed.action;
  switch (a.kind) {
    case "openApp":
      return {
        badge: "Open App",
        steps: [`Launch / activate ${a.appName}`, "Focus primary chat or text input"],
      };
    case "openAndType":
      return {
        badge: a.text ? "Open & Type" : "Open & Hands-Free Dictate",
        steps: [
          `Launch / activate ${a.appName}`,
          "Focus chat / text input",
          a.text ? `Paste: “${a.text}”` : "Start hands-free listening automatically",
          ...(a.pressEnter ? ["Press Enter to submit"] : []),
        ],
      };
    case "startTyping":
      return {
        badge: a.text ? "Focus & Type" : "Hands-Free Typing Mode",
        steps: [
          "Focus active app’s chat / text box",
          a.text ? `Paste: “${a.text}”` : "Start hands-free listening (auto-stops on pause)",
          ...(a.pressEnter ? ["Press Enter to submit"] : []),
        ],
      };
    case "pressEnter":
      return { badge: "Submit", steps: ["Send Enter / Return to active app"] };
    case "newLine":
      return { badge: "New Line", steps: ["Send Shift+Enter to active app"] };
    case "selectAll":
      return { badge: "Select All", steps: ["Select all text in focused input"] };
    case "clearInput":
      return { badge: "Clear Input", steps: ["Select all + Delete in focused input"] };
    default:
      return { badge: a.kind, steps: ["Execute voice action"] };
  }
}

export default function VoiceActionsView({ settings, systemInfo, onSaveSettings, onNotify }) {
  const isMac = systemInfo ? Boolean(systemInfo.isMac) : true;
  const pushToTalkKey = systemInfo?.pushToTalkKey || (isMac ? "⌥ Option" : "Right Alt");

  const [apps, setApps] = useState([]);
  const [appSearch, setAppSearch] = useState("");
  const [phrase, setPhrase] = useState("Open Antigravity and type hello from VANI");
  const [parsed, setParsed] = useState(null);
  const [running, setRunning] = useState(false);
  const [spokenAlias, setSpokenAlias] = useState("");
  const [targetAlias, setTargetAlias] = useState("");

  const enabled = settings.voiceActionsEnabled !== false;
  const aliases = settings.appAliases || [];

  useEffect(() => {
    let active = true;
    window.vani?.listInstalledApps?.().then((list) => {
      if (active && Array.isArray(list)) setApps(list);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const trimmed = phrase.trim();
    if (!trimmed) {
      setParsed(null);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const res = await window.vani?.testVoiceAction?.(trimmed, false);
        if (!cancelled) setParsed(res || null);
      } catch {
        if (!cancelled) setParsed(null);
      }
    }, 120);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [phrase, aliases]);

  const filteredApps = useMemo(() => {
    const q = appSearch.trim().toLowerCase();
    if (!q) return apps;
    return apps.filter((a) => a.name.toLowerCase().includes(q));
  }, [apps, appSearch]);

  const preview = useMemo(() => describeParsedAction(parsed), [parsed]);

  const handleRunNow = async () => {
    if (!phrase.trim()) return;
    setRunning(true);
    try {
      const res = await window.vani?.testVoiceAction?.(phrase.trim(), true);
      if (res?.executed && res?.result?.summary) {
        onNotify?.(res.result.summary);
      } else if (!res?.matched) {
        onNotify?.("Phrase did not match a voice action — it will dictate normally.", "error");
      }
    } catch (e) {
      onNotify?.(e?.message || "Failed to execute action", "error");
    } finally {
      setRunning(false);
    }
  };

  const addAlias = () => {
    const spoken = spokenAlias.trim();
    const target = targetAlias.trim();
    if (!spoken || !target) return;
    const filtered = aliases.filter((a) => a.spoken.toLowerCase() !== spoken.toLowerCase());
    onSaveSettings({ appAliases: [...filtered, { spoken, target }] });
    setSpokenAlias("");
    setTargetAlias("");
    onNotify?.(`Added voice alias “${spoken}” → ${target}`);
  };

  const removeAlias = (idx) => {
    onSaveSettings({ appAliases: aliases.filter((_, i) => i !== idx) });
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-[var(--text)]">Hands-Free Voice Actions</h1>
            <span className="rounded-full bg-[var(--brand-soft)] px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--brand)]">
              Phase 2
            </span>
          </div>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Hold <kbd className="vani-kbd">{pushToTalkKey}</kbd> and say{" "}
            <strong className="text-[var(--text)]">“Open Antigravity”</strong>,{" "}
            <strong className="text-[var(--text)]">“Start typing”</strong>, or{" "}
            <strong className="text-[var(--text)]">“Open Antigravity and type …”</strong> to control apps completely hands-free.
          </p>
        </div>

        <div className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] px-4 py-2.5">
          <div>
            <p className="text-xs font-semibold text-[var(--text)]">Voice Actions</p>
            <p className="text-[11px] text-[var(--muted)]">{enabled ? "Active on push-to-talk" : "Paused"}</p>
          </div>
          <ToggleSwitch
            checked={enabled}
            onChange={(val) => {
              onSaveSettings({ voiceActionsEnabled: val });
              onNotify?.(val ? "Hands-Free Voice Actions enabled" : "Hands-Free Voice Actions paused");
            }}
            label="Enable Voice Actions"
          />
        </div>
      </div>

      {/* Interactive Voice Action Simulator & Live Runner */}
      <div className="vani-card p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--brand-soft)] text-[var(--brand)]">
              <Zap className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-[var(--text)]">Live Intent Parser &amp; Action Tester</h2>
              <p className="text-xs text-[var(--muted)]">
                Test any spoken phrase to see if VANI runs a hands-free action or dictates normal text.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleRunNow}
            disabled={!parsed?.matched || running}
            className="vani-btn-primary inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold"
          >
            <Play className="h-3.5 w-3.5 fill-current" />
            {running ? "Running…" : "Run Action Now"}
          </button>
        </div>

        {/* Example Phrase Chips */}
        <div className="flex flex-wrap gap-1.5">
          {EXAMPLE_PHRASES.map((ex) => (
            <button
              key={ex.label}
              type="button"
              onClick={() => setPhrase(ex.phrase)}
              className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-2.5 py-1 text-[11px] font-medium text-[var(--text-soft)] transition hover:border-[var(--brand)]/45 hover:text-[var(--brand)]"
            >
              <Sparkles className="h-3 w-3" />
              {ex.label}
            </button>
          ))}
        </div>

        {/* Phrase Input */}
        <div className="relative">
          <Mic className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--brand)]" />
          <input
            type="text"
            value={phrase}
            onChange={(e) => setPhrase(e.target.value)}
            placeholder="Try: Open Antigravity and type write unit tests for auth"
            className="vani-input pl-9 text-sm"
          />
        </div>

        {/* Parsed Execution Plan Preview */}
        <div
          className={`rounded-xl border p-4 transition ${
            preview
              ? "border-emerald-500/35 bg-[var(--bg-app)]"
              : "border-[var(--border)] bg-[var(--bg-app)]"
          }`}
        >
          {preview ? (
            <div className="space-y-2.5">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-[var(--emerald)]" />
                <span className="rounded-full bg-[var(--emerald-soft)] px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--emerald)]">
                  Matched · {preview.badge}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text)]">
                {preview.steps.map((s, idx) => (
                  <span key={idx} className="inline-flex items-center gap-2">
                    <span className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-2.5 py-1 font-medium">
                      {s}
                    </span>
                    {idx < preview.steps.length - 1 && (
                      <ArrowRight className="h-3.5 w-3.5 text-[var(--brand)]" />
                    )}
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-xs text-[var(--muted)]">
              No voice action matched — VANI will treat this as normal dictation and paste it at your cursor (zero false triggers!).
            </p>
          )}
        </div>
      </div>

      {/* Bottom Grid: Custom App Aliases + Installed Apps + Cheat Sheet */}
      <div className="grid gap-5 lg:grid-cols-12">
        {/* Custom App Aliases */}
        <div className="vani-card p-5 lg:col-span-6 flex flex-col gap-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--violet-soft)] text-[var(--violet)]">
                <Keyboard className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-[var(--text)]">Custom App Aliases</h2>
                <p className="text-xs text-[var(--muted)]">Map nicknames like “editor” or “chat” to any app</p>
              </div>
            </div>
            <span className="rounded-full bg-[var(--bg-elevated)] px-2.5 py-0.5 text-[11px] font-medium text-[var(--muted)]">
              {aliases.length} aliases
            </span>
          </div>

          <div className="grid gap-2 sm:grid-cols-[120px_1fr_auto]">
            <input
              type="text"
              value={spokenAlias}
              onChange={(e) => setSpokenAlias(e.target.value)}
              placeholder="Say (e.g. editor)"
              className="vani-input text-xs"
            />
            <input
              type="text"
              list="vani-installed-apps-datalist"
              value={targetAlias}
              onChange={(e) => setTargetAlias(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") addAlias();
              }}
              placeholder="Target app (e.g. Antigravity)"
              className="vani-input text-xs"
            />
            <datalist id="vani-installed-apps-datalist">
              {apps.map((a) => (
                <option key={a.name} value={a.name} />
              ))}
            </datalist>
            <button
              type="button"
              onClick={addAlias}
              disabled={!spokenAlias.trim() || !targetAlias.trim()}
              className="vani-btn-primary inline-flex items-center justify-center gap-1 rounded-xl px-3.5 py-2 text-xs font-semibold"
            >
              <Plus className="h-3.5 w-3.5" /> Add
            </button>
          </div>

          <div className="space-y-2 max-h-[210px] overflow-y-auto pr-1">
            {aliases.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[var(--border)] py-6 text-center text-xs text-[var(--muted)]">
                No custom aliases yet. Built-in aliases (Antigravity, VS Code, Chrome, ChatGPT, Slack…) already work automatically.
              </div>
            ) : (
              aliases.map((a, idx) => (
                <div
                  key={`${a.spoken}-${idx}`}
                  className="flex items-center gap-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2"
                >
                  <code className="rounded-md bg-[var(--brand-soft)] px-2 py-0.5 font-mono text-xs font-semibold text-[var(--brand)]">
                    open {a.spoken}
                  </code>
                  <ArrowRight className="h-3 w-3 shrink-0 text-[var(--muted)]" />
                  <span className="min-w-0 flex-1 truncate text-xs font-medium text-[var(--text)]">{a.target}</span>
                  <button
                    type="button"
                    onClick={() => removeAlias(idx)}
                    className="rounded-md p-1 text-[var(--muted)] transition hover:bg-[var(--danger-soft)] hover:text-[var(--danger)]"
                    aria-label={`Remove alias ${a.spoken}`}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Discovered Installed Apps */}
        <div className="vani-card p-5 lg:col-span-6 flex flex-col gap-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--emerald-soft)] text-[var(--emerald)]">
                <AppWindow className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-[var(--text)]">Discovered Apps ({apps.length})</h2>
                <p className="text-xs text-[var(--muted)]">
                  Click any app to test opening it by voice
                </p>
              </div>
            </div>
          </div>

          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--muted)]" />
            <input
              type="search"
              value={appSearch}
              onChange={(e) => setAppSearch(e.target.value)}
              placeholder="Search installed apps…"
              className="vani-input pl-8 text-xs"
            />
          </div>

          <div className="max-h-[210px] overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--bg-app)] p-3">
            <div className="flex flex-wrap gap-1.5">
              {filteredApps.map((app) => (
                <button
                  key={app.name}
                  type="button"
                  onClick={() => setPhrase(`Open ${app.name}`)}
                  className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-2.5 py-1 text-xs font-medium text-[var(--text-soft)] transition hover:border-[var(--brand)]/45 hover:text-[var(--brand)]"
                >
                  {app.name}
                </button>
              ))}
              {filteredApps.length === 0 && (
                <p className="py-6 text-center text-xs text-[var(--muted)] w-full">No matching apps found.</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Supported Commands Reference */}
      <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        {COMMAND_REFERENCE.map((item) => (
          <div key={item.category} className="vani-card p-4 space-y-2.5">
            <div className="flex items-center gap-1.5">
              <CornerDownLeft className="h-3.5 w-3.5 text-[var(--brand)]" />
              <h3 className="text-xs font-semibold text-[var(--text)]">{item.category}</h3>
            </div>
            <p className="text-[11px] leading-relaxed text-[var(--muted)]">{item.desc}</p>
            <div className="flex flex-wrap gap-1 pt-1">
              {item.examples.map((ex) => (
                <code
                  key={ex}
                  className="rounded-md border border-[var(--border)] bg-[var(--bg-app)] px-2 py-0.5 font-mono text-[10px] text-[var(--text-soft)]"
                >
                  “{ex}”
                </code>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

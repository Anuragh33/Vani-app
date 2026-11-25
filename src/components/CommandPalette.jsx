import { useEffect, useMemo, useRef, useState } from "react";
import {
  Search,
  Mic,
  History,
  FileText,
  Sparkles,
  BookOpen,
  Cpu,
  BarChart3,
  Settings,
  Sun,
  Moon,
  Shield,
  ArrowRight,
  PanelTop,
  Zap,
} from "lucide-react";

export default function CommandPalette({
  open,
  onClose,
  settings,
  systemInfo,
  onNavigate,
  onSaveSettings,
  onNotify,
}) {
  const [query, setQuery] = useState("");
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef(null);
  const isMac = systemInfo ? Boolean(systemInfo.isMac) : true;
  const mod = systemInfo?.modifierSymbol || (isMac ? "⌘" : "Ctrl+");

  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIdx(0);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  const commands = useMemo(
    () => [
      { id: "nav-home", group: "Navigate", label: "VANI Studio", hint: `${mod}1`, icon: Mic, run: () => onNavigate("home") },
      { id: "nav-history", group: "Navigate", label: "Transcription History", hint: `${mod}2`, icon: History, run: () => onNavigate("history") },
      { id: "nav-notes", group: "Navigate", label: "Voice Notes", hint: `${mod}3`, icon: FileText, run: () => onNavigate("notes") },
      { id: "nav-hud", group: "Navigate", label: isMac ? "HUD & Menu Bar Preview" : "HUD & System Tray Preview", hint: `${mod}4`, icon: PanelTop, run: () => onNavigate("hud") },
      { id: "nav-actions", group: "Navigate", label: "Hands-Free Vani Actions", hint: `${mod}5`, icon: Zap, run: () => onNavigate("actions") },
      { id: "nav-modes", group: "Navigate", label: "Modes & Pipeline", hint: `${mod}6`, icon: Sparkles, run: () => onNavigate("modes") },
      { id: "nav-dict", group: "Navigate", label: "Dictionary & Snippets", hint: `${mod}7`, icon: BookOpen, run: () => onNavigate("dictionary") },
      { id: "nav-models", group: "Navigate", label: "Local Speech Models", hint: `${mod}8`, icon: Cpu, run: () => onNavigate("models") },
      { id: "nav-usage", group: "Navigate", label: "Productivity & Analytics", hint: `${mod}9`, icon: BarChart3, run: () => onNavigate("usage") },
      { id: "nav-settings", group: "Navigate", label: "Settings", hint: `${mod},`, icon: Settings, run: () => onNavigate("settings") },
      {
        id: "act-theme",
        group: "Actions",
        label: `Switch to ${settings.theme === "dark" ? "Light" : "Dark"} Theme`,
        icon: settings.theme === "dark" ? Sun : Moon,
        run: () => {
          const next = settings.theme === "dark" ? "light" : "dark";
          onSaveSettings({ theme: next });
          onNotify?.(`Switched to ${next} mode`);
        },
      },
      {
        id: "act-privacy",
        group: "Actions",
        label: `${settings.privacyMode ? "Disable" : "Enable"} Privacy Shield`,
        icon: Shield,
        run: () => {
          const next = !settings.privacyMode;
          onSaveSettings({ privacyMode: next });
          onNotify?.(next ? "Privacy Shield enabled" : "Privacy Shield disabled");
        },
      },
      ...["general", "email", "slack", "notes", "code"].map((mode) => ({
        id: `mode-${mode}`,
        group: "Modes",
        label: `Switch Dictation Mode → ${mode.charAt(0).toUpperCase() + mode.slice(1)}`,
        icon: Sparkles,
        run: () => {
          onSaveSettings({ cleanupContext: mode });
          onNotify?.(`Active mode set to ${mode}`);
        },
      })),
    ],
    [settings.theme, settings.privacyMode, isMac, mod, onNavigate, onSaveSettings, onNotify]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter(
      (c) => c.label.toLowerCase().includes(q) || c.group.toLowerCase().includes(q)
    );
  }, [commands, query]);

  useEffect(() => {
    setSelectedIdx(0);
  }, [query]);

  if (!open) return null;

  const execute = (item) => {
    if (!item) return;
    item.run();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-[var(--modal-backdrop)] pt-[14vh] px-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="animate-scale-in w-full max-w-lg overflow-hidden rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-surface)] shadow-[var(--shadow-modal)]">
        <div className="flex items-center gap-2.5 border-b border-[var(--border)] px-4 py-3">
          <Search className="h-4 w-4 text-[var(--muted)]" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
              else if (e.key === "ArrowDown") {
                e.preventDefault();
                setSelectedIdx((i) => (i + 1) % Math.max(1, filtered.length));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setSelectedIdx((i) => (i - 1 + Math.max(1, filtered.length)) % Math.max(1, filtered.length));
              } else if (e.key === "Enter") {
                e.preventDefault();
                execute(filtered[selectedIdx]);
              }
            }}
            placeholder="Jump to view, switch mode, or run action…"
            className="flex-1 bg-transparent text-sm text-[var(--text)] outline-none placeholder:text-[var(--muted)]"
          />
          <kbd className="vani-kbd font-mono text-[10px]">ESC</kbd>
        </div>

        <div className="max-h-72 overflow-y-auto p-2">
          {filtered.length === 0 ? (
            <p className="py-8 text-center text-xs text-[var(--muted)]">No matching commands.</p>
          ) : (
            filtered.map((item, idx) => {
              const Icon = item.icon;
              const selected = idx === selectedIdx;
              return (
                <button
                  key={item.id}
                  type="button"
                  onMouseEnter={() => setSelectedIdx(idx)}
                  onClick={() => execute(item)}
                  className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-xs transition ${
                    selected
                      ? "bg-[var(--bg-active)] text-[var(--brand)]"
                      : "text-[var(--text-soft)] hover:bg-[var(--bg-hover)]"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    <span className="font-medium">{item.label}</span>
                    <span className="text-[10px] text-[var(--muted)]">{item.group}</span>
                  </div>
                  {item.hint ? (
                    <kbd className="vani-kbd font-mono text-[10px]">{item.hint}</kbd>
                  ) : (
                    selected && <ArrowRight className="h-3 w-3" />
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

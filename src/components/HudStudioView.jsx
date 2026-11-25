import { useEffect, useRef, useState } from "react";
import {
  Wifi,
  BatteryMedium,
  SlidersHorizontal,
  Play,
  Mic,
  Settings,
  LayoutDashboard,
  Power,
  Shield,
  Check,
  ExternalLink,
  PanelTop,
  PanelBottom,
  CornerUpLeft,
  CornerUpRight,
} from "lucide-react";
import { FloatingHudPill, BottomHudPill } from "../Overlay";
import { ToggleSwitch } from "./VaniLogo";

const WALLPAPERS = [
  {
    id: "obsidian",
    label: "macOS Dark",
    barBg: "rgba(20, 20, 21, 0.92)",
    barText: "#ededed",
    desktopBg: "#0f0f10",
    isLightBar: false,
  },
  {
    id: "sequoia",
    label: "Slate",
    barBg: "rgba(25, 25, 27, 0.92)",
    barText: "#ededed",
    desktopBg: "#19191b",
    isLightBar: false,
  },
  {
    id: "daylight",
    label: "macOS Light",
    barBg: "rgba(250, 250, 250, 0.92)",
    barText: "#171717",
    desktopBg: "#f4f4f5",
    isLightBar: true,
  },
];

const HUD_STYLES = [
  { id: "breathwave", label: "Wave", desc: "Smooth acoustic bezier wave with reflection" },
  { id: "bars", label: "Bars", desc: "7-bar studio audio meter" },
  { id: "minimal", label: "Minimal", desc: "Compact 3-bar floating indicator" },
];

const HUD_POSITIONS = [
  { id: "top-left", label: "Top left", icon: CornerUpLeft },
  { id: "top-center", label: "Top center", icon: PanelTop },
  { id: "top-right", label: "Top right", icon: CornerUpRight },
  { id: "bottom-center", label: "Bottom", icon: PanelBottom },
];

const TRAY_STYLES = [
  { id: "monochrome", label: "Native template", desc: "Adaptive white or black menu bar bars" },
  { id: "accent", label: "VANI Rose", desc: "Flat 5-bar mark in VANI rose" },
  { id: "live-wave", label: "Active wave", desc: "Expands bars while listening" },
  { id: "dot-wave", label: "Minimal + dot", desc: "Compact 3-bar icon with status dot" },
];

function MenuBarTrayIcon({ style = "monochrome", phase = "idle", isLightBar = false }) {
  const recording = phase === "recording";
  const processing = phase === "processing";
  const baseColor =
    style === "accent"
      ? "#e14b7b"
      : isLightBar
      ? "#171717"
      : "#ededed";

  const activeColor = recording ? "#e14b7b" : processing ? "#a1a1a6" : baseColor;
  const barHeights = style === "dot-wave" ? [7, 12, 8] : [6, 10, 14, 10, 6];

  return (
    <span className="relative inline-flex h-[18px] items-center justify-center gap-[2px]">
      {barHeights.map((h, i) => (
        <span
          key={i}
          style={{
            width: 2,
            height: recording ? Math.max(4, h + (i % 2 === 0 ? 2 : -2)) : h,
            borderRadius: 1,
            background: style === "accent" ? "#e14b7b" : activeColor,
            opacity: style === "accent" && i !== 2 ? 0.78 : 1,
            transition: "height 140ms ease, background-color 140ms ease",
          }}
        />
      ))}
      {(style === "dot-wave" || recording || processing) && (
        <span
          style={{
            position: "absolute",
            right: -3,
            top: 0,
            width: 5,
            height: 5,
            borderRadius: "50%",
            background: recording ? "#e14b7b" : processing ? "#a1a1a6" : "#4cc38a",
          }}
        />
      )}
    </span>
  );
}

export default function HudStudioView({ settings, systemInfo, onSaveSettings, onNavigate, onNotify }) {
  const isMac = systemInfo ? Boolean(systemInfo.isMac) : true;
  const osName = systemInfo?.osName || (isMac ? "macOS" : "Windows");
  const pushToTalkKey = systemInfo?.pushToTalkKey || (isMac ? "⌥ Option" : "Right Alt");
  const dashboardHotkey = systemInfo?.dashboardHotkey || (isMac ? "⌘⇧D" : "Ctrl+Shift+D");
  const mod = systemInfo?.modifierSymbol || (isMac ? "⌘" : "Ctrl+");

  const [wallpaperId, setWallpaperId] = useState("obsidian");
  const [phase, setPhase] = useState("recording"); // idle | recording | processing | done | error
  const [trayOpen, setTrayOpen] = useState(false);
  const [energy, setEnergy] = useState(0.68);
  const [elapsedMs, setElapsedMs] = useState(3800);
  const [cycling, setCycling] = useState(false);
  const timersRef = useRef([]);

  const wallpapers = WALLPAPERS.map((wp) => ({
    ...wp,
    label: isMac
      ? wp.label
      : wp.id === "obsidian"
      ? "Windows Dark"
      : wp.id === "sequoia"
      ? "Bloom Dusk"
      : "Windows Light",
  }));
  const trayStyles = TRAY_STYLES.map((item) =>
    item.id === "monochrome" && !isMac
      ? { ...item, label: "Crisp White", desc: "High-contrast white Windows taskbar bars" }
      : item
  );

  const wallpaper = wallpapers.find((w) => w.id === wallpaperId) || wallpapers[0];
  const hudStyle = settings.hudStyle || "breathwave";
  const hudPosition = settings.hudPosition || "top-center";
  const hudShowTimer = settings.hudShowTimer !== false;
  const hudShowMode = settings.hudShowMode !== false;
  const hudGlass = settings.hudGlass !== false;
  const trayIconStyle = settings.trayIconStyle || "monochrome";

  const clearTimers = () => {
    timersRef.current.forEach((t) => clearTimeout(t));
    timersRef.current = [];
  };

  useEffect(() => {
    if (phase !== "recording") return;
    const iv = setInterval(() => setElapsedMs((ms) => ms + 200), 200);
    return () => clearInterval(iv);
  }, [phase]);

  useEffect(() => () => clearTimers(), []);

  const runFullCycle = () => {
    clearTimers();
    setCycling(true);
    setTrayOpen(false);
    setElapsedMs(0);
    setPhase("recording");
    timersRef.current.push(
      setTimeout(() => setPhase("processing"), 2600),
      setTimeout(() => {
        setPhase("idle");
        setCycling(false);
      }, 4200)
    );
  };

  const hudPositionClass =
    hudPosition === "top-left"
      ? isMac
        ? "top-11 left-5"
        : "top-5 left-5"
      : hudPosition === "bottom-center"
      ? isMac
        ? "bottom-6 left-1/2 -translate-x-1/2"
        : "bottom-14 left-1/2 -translate-x-1/2"
      : hudPosition === "top-right"
      ? isMac
        ? "top-11 right-5"
        : "top-5 right-5"
      : isMac
      ? "top-11 left-1/2 -translate-x-1/2"
      : "top-5 left-1/2 -translate-x-1/2";

  const showTop = phase === "recording" || phase === "processing";
  const showBottom = phase === "error";

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-medium tracking-[-0.02em] text-[var(--text)]">
            {isMac ? "HUD & menu bar" : "HUD & system tray"}
          </h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {isMac
              ? "Preview and customize VANI’s floating dictation pill and macOS menu bar icon"
              : "Preview and customize VANI’s floating dictation pill and Windows taskbar tray icon"}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={runFullCycle}
            disabled={cycling}
            className="vani-btn-primary inline-flex h-9 items-center gap-1.5 px-4 text-xs"
          >
            <Play className="h-3.5 w-3.5 fill-current" />
            {cycling ? `Simulating ${pushToTalkKey}` : "Run dictation cycle"}
          </button>

          <a
            href="/?window=overlay&demo=1"
            target="_blank"
            rel="noreferrer"
            className="vani-btn-secondary inline-flex h-9 items-center gap-1.5 px-3.5 text-xs"
          >
            <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.5} />
            Standalone HUD
          </a>
        </div>
      </div>

      {/* Live Interactive Desktop + Menu Bar Simulator */}
      <div className="vani-card overflow-hidden">
        {/* Simulator Controls Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-2.5">
          <div className="flex items-center gap-1.5">
            <span className="mr-1 text-xs text-[var(--muted)]">State</span>
            {[
              ["idle", "Idle"],
              ["recording", "Recording"],
              ["processing", "Transcribing"],
              ["error", "Error"],
            ].map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  clearTimers();
                  setCycling(false);
                  if (key === "recording") setElapsedMs(0);
                  setPhase(key);
                }}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  phase === key
                    ? "bg-[var(--bg-surface)] text-[var(--text)]"
                    : "text-[var(--muted)] hover:text-[var(--text)]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5">
            <span className="mr-1 text-xs text-[var(--muted)]">Desktop</span>
            {wallpapers.map((wp) => (
              <button
                key={wp.id}
                type="button"
                onClick={() => setWallpaperId(wp.id)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  wallpaperId === wp.id
                    ? "bg-[var(--bg-surface)] text-[var(--text)]"
                    : "text-[var(--muted)] hover:text-[var(--text)]"
                }`}
              >
                {wp.label}
              </button>
            ))}
          </div>
        </div>

        {/* Simulated macOS Screen */}
        <div
          className="relative h-[340px] w-full select-none overflow-hidden xl:h-[400px]"
          style={{ background: wallpaper.desktopBg }}
        >
          {/* OS Top Menu Bar (macOS) OR Bottom Taskbar (Windows) */}
          {isMac ? (
            <div
              className="relative z-20 flex h-7 w-full items-center justify-between px-3.5 text-[11px] font-medium backdrop-blur-xl"
              style={{
                background: wallpaper.barBg,
                color: wallpaper.barText,
                borderBottom: wallpaper.isLightBar
                  ? "1px solid rgba(0,0,0,0.08)"
                  : "1px solid rgba(255,255,255,0.08)",
              }}
            >
              {/* Left macOS App Menu */}
              <div className="flex items-center gap-3.5">
                <span className="text-[13px] font-bold leading-none"></span>
                <span className="font-semibold">Cursor</span>
                <span className="opacity-70 hidden sm:inline">File</span>
                <span className="opacity-70 hidden sm:inline">Edit</span>
                <span className="opacity-70 hidden sm:inline">View</span>
              </div>

              {/* Right macOS Status Icons + Clickable VANI Tray Icon */}
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setTrayOpen((v) => !v)}
                  className={`relative flex h-5 items-center gap-1.5 rounded px-2 transition ${
                    trayOpen
                      ? wallpaper.isLightBar
                        ? "bg-black/10"
                        : "bg-white/15"
                      : wallpaper.isLightBar
                      ? "hover:bg-black/10"
                      : "hover:bg-white/10"
                  }`}
                  title="Click to preview VANI Menu Bar Popover"
                >
                  <MenuBarTrayIcon style={trayIconStyle} phase={phase} isLightBar={wallpaper.isLightBar} />
                </button>
                <Wifi className="h-3.5 w-3.5 opacity-80" />
                <BatteryMedium className="h-4 w-4 opacity-80" />
                <SlidersHorizontal className="h-3 w-3 opacity-80" />
                <span className="font-mono text-[11px] opacity-90">Tue 17:04</span>
              </div>
            </div>
          ) : (
            <div
              className="absolute bottom-0 left-0 right-0 z-20 flex h-10 w-full items-center justify-between px-3.5 text-[11px] font-medium backdrop-blur-xl"
              style={{
                background: wallpaper.barBg,
                color: wallpaper.barText,
                borderTop: wallpaper.isLightBar
                  ? "1px solid rgba(0,0,0,0.08)"
                  : "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <div className="flex items-center gap-2 opacity-75 text-[10px]">
                <span className="font-semibold">Windows 11</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="grid h-6 w-6 place-items-center rounded bg-sky-500/20 text-sky-400 text-[10px] font-bold">
                  ⊞
                </span>
                <span className="rounded bg-white/10 px-2 py-0.5 text-[10px] font-medium">Cursor</span>
              </div>
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setTrayOpen((v) => !v)}
                  className={`relative flex h-6 items-center gap-1.5 rounded px-2 transition ${
                    trayOpen
                      ? wallpaper.isLightBar
                        ? "bg-black/10"
                        : "bg-white/15"
                      : wallpaper.isLightBar
                      ? "hover:bg-black/10"
                      : "hover:bg-white/10"
                  }`}
                  title="Click to preview VANI System Tray Menu"
                >
                  <MenuBarTrayIcon style={trayIconStyle} phase={phase} isLightBar={wallpaper.isLightBar} />
                </button>
                <Wifi className="h-3.5 w-3.5 opacity-80" />
                <BatteryMedium className="h-4 w-4 opacity-80" />
                <span className="font-mono text-[10.5px] opacity-90">17:04</span>
              </div>
            </div>
          )}

          {/* Clickable Menu Bar / System Tray Popover */}
          {trayOpen && (
            <div
              className={`animate-scale-in absolute z-30 w-60 overflow-hidden rounded-xl p-1.5 backdrop-blur-2xl ${
                isMac ? "right-14 top-8" : "right-10 bottom-12"
              }`}
              style={{
                background: wallpaper.isLightBar ? "rgba(255, 255, 255, 0.94)" : "rgba(18, 17, 26, 0.93)",
                color: wallpaper.isLightBar ? "#18181b" : "#ffffff",
                border: wallpaper.isLightBar
                  ? "1px solid rgba(24, 24, 27, 0.12)"
                  : "1px solid rgba(255, 255, 255, 0.15)",
                boxShadow: wallpaper.isLightBar
                  ? "0 18px 42px rgba(24, 24, 27, 0.16)"
                  : "0 20px 50px rgba(0, 0, 0, 0.58)",
              }}
            >
              <div className="flex items-center justify-between rounded-lg px-2.5 py-2">
                <div>
                  <p className="text-xs font-semibold">VANI Local Dictation</p>
                  <p className={`text-[10px] ${wallpaper.isLightBar ? "text-zinc-500" : "text-white/60"}`}>
                    {phase === "recording"
                      ? "Listening via microphone…"
                      : settings.privacyMode
                      ? "Privacy Shield Active"
                      : `Ready · ${settings.whisperModel}`}
                  </p>
                </div>
                <span
                  className={`h-2 w-2 rounded-full ${
                    phase === "recording"
                      ? "animate-pulse bg-pink-500"
                      : phase === "processing"
                      ? "bg-violet-500"
                      : "bg-emerald-500"
                  }`}
                />
              </div>

              <div className={`my-1 h-px ${wallpaper.isLightBar ? "bg-zinc-200" : "bg-white/10"}`} />

              <button
                type="button"
                onClick={() => {
                  if (phase === "recording") setPhase("processing");
                  else {
                    setElapsedMs(0);
                    setPhase("recording");
                  }
                }}
                className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs transition ${
                  wallpaper.isLightBar
                    ? "text-zinc-800 hover:bg-pink-500/10 hover:text-pink-700"
                    : "text-white/90 hover:bg-pink-500/20 hover:text-pink-200"
                }`}
              >
                <span className="flex items-center gap-2">
                  <Mic className="h-3.5 w-3.5 text-pink-500" />
                  {phase === "recording" ? "Stop Dictation" : "Start Dictation"}
                </span>
                <span className={`font-mono text-[10px] ${wallpaper.isLightBar ? "text-zinc-400" : "text-white/50"}`}>
                  {isMac ? "⌥" : "RAlt"}
                </span>
              </button>

              {/* Quick Mode Pills inside Tray */}
              <div className="px-2 py-1.5">
                <p className={`mb-1 text-[9.5px] font-semibold uppercase tracking-wider ${wallpaper.isLightBar ? "text-zinc-400" : "text-white/45"}`}>
                  Active Mode
                </p>
                <div className="flex flex-wrap gap-1">
                  {["general", "email", "slack", "notes", "code"].map((m) => {
                    const isMode = (settings.cleanupContext || "general") === m;
                    return (
                      <button
                        key={m}
                        type="button"
                        onClick={() => {
                          onSaveSettings({ cleanupContext: m });
                          onNotify?.(`Mode set to ${m}`);
                        }}
                        className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium capitalize transition ${
                          isMode
                            ? wallpaper.isLightBar
                              ? "bg-pink-500/15 text-pink-700"
                              : "bg-pink-500/25 text-pink-300"
                            : wallpaper.isLightBar
                            ? "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                            : "bg-white/5 text-white/65 hover:bg-white/10"
                        }`}
                      >
                        {m}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className={`my-1 h-px ${wallpaper.isLightBar ? "bg-zinc-200" : "bg-white/10"}`} />

              <button
                type="button"
                onClick={() => onNavigate("home")}
                className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs transition ${
                  wallpaper.isLightBar ? "text-zinc-700 hover:bg-zinc-100" : "text-white/85 hover:bg-white/10"
                }`}
              >
                <span className="flex items-center gap-2">
                  <LayoutDashboard className={`h-3.5 w-3.5 ${wallpaper.isLightBar ? "text-zinc-500" : "text-white/60"}`} />
                  Open VANI Studio
                </span>
                <span className={`font-mono text-[10px] ${wallpaper.isLightBar ? "text-zinc-400" : "text-white/45"}`}>{dashboardHotkey}</span>
              </button>
              <button
                type="button"
                onClick={() => onNavigate("settings")}
                className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs transition ${
                  wallpaper.isLightBar ? "text-zinc-700 hover:bg-zinc-100" : "text-white/85 hover:bg-white/10"
                }`}
              >
                <span className="flex items-center gap-2">
                  <Settings className={`h-3.5 w-3.5 ${wallpaper.isLightBar ? "text-zinc-500" : "text-white/60"}`} />
                  Settings…
                </span>
                <span className={`font-mono text-[10px] ${wallpaper.isLightBar ? "text-zinc-400" : "text-white/45"}`}>{mod},</span>
              </button>
              <div className={`my-1 h-px ${wallpaper.isLightBar ? "bg-zinc-200" : "bg-white/10"}`} />
              <div className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs ${wallpaper.isLightBar ? "text-zinc-400" : "text-white/45"}`}>
                <span className="flex items-center gap-2">
                  <Power className="h-3.5 w-3.5" />
                  Quit VANI
                </span>
                <span className="font-mono text-[10px]">{isMac ? "⌘Q" : "Alt+F4"}</span>
              </div>
            </div>
          )}

          {/* Subtle mocked background editor window */}
          <div className="pointer-events-none mx-auto mt-14 w-[74%] max-w-[520px] rounded-xl border border-white/10 bg-[#141415]/95 p-5">
            <div className="flex items-center justify-between gap-2 border-b border-white/[0.06] pb-3">
              {isMac ? (
                <div className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
                  <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
                  <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
                  <span className="ml-2 font-mono text-[11px] text-[#a1a1a6]">release-notes.md — Antigravity</span>
                </div>
              ) : (
                <>
                  <span className="font-mono text-[11px] text-[#a1a1a6]">release-notes.md — VS Code</span>
                  <div className="flex items-center gap-2.5 font-mono text-[11px] text-[#85858b]">
                    <span>─</span>
                    <span>□</span>
                    <span>×</span>
                  </div>
                </>
              )}
            </div>
            <div className="mt-4 space-y-2 font-mono text-xs text-[#a1a1a6]">
              <p className="text-[#ededed]">## VANI 2.1</p>
              <p>
                Hold <span className="rounded bg-white/10 px-1.5 py-0.5 text-[#ededed]">{pushToTalkKey}</span> to dictate locally into any app.
                <span className="ml-1 inline-block h-3.5 w-[2px] bg-[#e14b7b] align-middle" />
              </p>
            </div>
          </div>

          {/* ACTUAL Shared Floating HUD Pill positioned on screen */}
          <div className={`absolute z-20 flex flex-col items-center gap-2 ${hudPositionClass}`}>
            {showTop && (
              <FloatingHudPill
                phase={phase}
                simulatedEnergy={energy}
                visible={showTop}
                elapsedMs={elapsedMs}
                modeLabel={settings.cleanupContext || "general"}
                hudStyle={hudStyle}
                showTimer={hudShowTimer}
                showMode={hudShowMode}
                glass={hudGlass}
              />
            )}
            {showBottom && (
              <BottomHudPill
                phase={phase}
                text={phase === "done" ? "Done" : "Microphone permission required"}
                visible={showBottom}
                glass={hudGlass}
              />
            )}
            {phase === "idle" && (
              <span className="rounded-lg border border-white/10 bg-[#0f0f10]/90 px-3 py-1 font-mono text-[11px] text-[#a1a1a6]">
                HUD hidden until you hold {pushToTalkKey}
              </span>
            )}
          </div>

          {/* Quiet hint */}
          <div
            className={`absolute left-4 font-mono text-[11px] ${
              wallpaper.isLightBar ? "text-[#525252]" : "text-[#85858b]"
            } ${isMac ? "bottom-3" : "bottom-12"}`}
          >
            {isMac
              ? "Click the 5-bar icon in the menu bar to preview the tray menu"
              : "Click the 5-bar icon in the taskbar to preview the tray menu"}
          </div>
        </div>
      </div>

      {/* Bottom Configuration Grid */}
      <div className="grid gap-5 lg:grid-cols-12">
        {/* Floating HUD Controls */}
        <div className="vani-card p-5 lg:col-span-7 space-y-5">
          <div>
            <h2 className="text-sm font-medium text-[var(--text)]">Floating HUD appearance</h2>
            <p className="mt-0.5 text-xs text-[var(--muted)]">
              Changes sync immediately to the live {osName} overlay window
            </p>
          </div>

          {/* Visual Style */}
          <div className="space-y-2">
            <p className="text-xs text-[var(--muted)]">Waveform style</p>
            <div className="grid gap-2.5 sm:grid-cols-3">
              {HUD_STYLES.map((item) => {
                const active = hudStyle === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      onSaveSettings({ hudStyle: item.id });
                      setPhase("recording");
                      onNotify?.(`HUD style set to ${item.label}`);
                    }}
                    className={`rounded-xl border p-3 text-left transition-colors ${
                      active
                        ? "border-[var(--border-strong)] bg-[var(--bg-elevated)]"
                        : "border-[var(--border)] bg-[var(--bg-surface)] hover:border-[var(--border-strong)]"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-[var(--text)]">{item.label}</span>
                      {active && <Check className="h-3.5 w-3.5 text-[var(--brand)]" strokeWidth={1.75} />}
                    </div>
                    <p className="mt-1 text-xs leading-snug text-[var(--muted)]">{item.desc}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Screen Position */}
          <div className="space-y-2">
            <p className="text-xs text-[var(--muted)]">Screen position</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {HUD_POSITIONS.map((pos) => {
                const Icon = pos.icon;
                const active = hudPosition === pos.id;
                return (
                  <button
                    key={pos.id}
                    type="button"
                    onClick={() => {
                      onSaveSettings({ hudPosition: pos.id });
                      if (pos.id === "top-right") setTrayOpen(false);
                      onNotify?.(`HUD position set to ${pos.label}`);
                    }}
                    className={`flex h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 text-xs font-medium transition-colors ${
                      active
                        ? "border-[var(--border-strong)] bg-[var(--bg-elevated)] text-[var(--text)]"
                        : "border-[var(--border)] bg-[var(--bg-surface)] text-[var(--muted)] hover:text-[var(--text)]"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" strokeWidth={1.5} />
                    {pos.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Voice Energy Slider + Display Toggles */}
          <div className="space-y-3">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-3.5 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-[var(--text)]">Preview wave intensity</span>
                <span className="font-mono text-[var(--text-soft)] tabular-nums">{Math.round(energy * 100)}%</span>
              </div>
              <input
                type="range"
                min="0.15"
                max="1"
                step="0.05"
                value={energy}
                onChange={(e) => {
                  setEnergy(Number(e.target.value));
                  if (phase !== "recording") setPhase("recording");
                }}
                className="vani-range"
              />
            </div>

            <div className="grid gap-2.5 sm:grid-cols-3">
              {[
                ["hudShowTimer", "Elapsed timer", hudShowTimer],
                ["hudShowMode", "Mode label", hudShowMode],
                ["hudGlass", "Translucent blur", hudGlass],
              ].map(([key, label, val]) => (
                <div
                  key={key}
                  className="flex items-center justify-between gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2.5"
                >
                  <span className="text-xs text-[var(--text)]">{label}</span>
                  <ToggleSwitch
                    checked={val}
                    onChange={(next) => onSaveSettings({ [key]: next })}
                    label={label}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Menu Bar / System Tray Icon Style Selector */}
        <div className="vani-card p-5 lg:col-span-5 flex flex-col justify-between gap-4">
          <div className="space-y-4">
            <div>
              <h2 className="text-sm font-medium text-[var(--text)]">
                {isMac ? "Menu bar icon" : "System tray icon"}
              </h2>
              <p className="mt-0.5 text-xs text-[var(--muted)]">
                {isMac
                  ? "Choose how VANI appears in the macOS menu bar"
                  : "Choose how VANI appears in the Windows taskbar tray"}
              </p>
            </div>

            <div className="space-y-2">
              {trayStyles.map((item) => {
                const active = trayIconStyle === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      onSaveSettings({ trayIconStyle: item.id });
                      onNotify?.(`${isMac ? "Menu bar" : "System tray"} icon updated: ${item.label}`);
                    }}
                    className={`flex w-full items-center justify-between gap-3 rounded-xl border p-3 text-left transition-colors ${
                      active
                        ? "border-[var(--border-strong)] bg-[var(--bg-elevated)]"
                        : "border-[var(--border)] bg-[var(--bg-surface)] hover:border-[var(--border-strong)]"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-11 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-[#0f0f10]">
                        <MenuBarTrayIcon style={item.id} phase={phase} isLightBar={false} />
                      </div>
                      <div>
                        <p className="text-xs font-medium text-[var(--text)]">{item.label}</p>
                        <p className="mt-0.5 text-xs text-[var(--muted)]">{item.desc}</p>
                      </div>
                    </div>
                    {active && <Check className="h-4 w-4 shrink-0 text-[var(--brand)]" strokeWidth={1.75} />}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-app)] p-3.5 text-xs text-[var(--muted)] flex items-start gap-2.5">
            <Shield className="h-4 w-4 shrink-0 text-[var(--muted)] mt-0.5" strokeWidth={1.5} />
            <span>
              {isMac
                ? "Left-click the menu bar icon to toggle dictation; right-click for Studio, Settings, and Quit."
                : "Left-click the tray icon to toggle dictation; right-click for Studio, Settings, and Quit."}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

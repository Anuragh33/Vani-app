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
  Sparkles,
  ExternalLink,
  PanelTop,
  PanelBottom,
  CornerUpRight,
} from "lucide-react";
import { FloatingHudPill, BottomHudPill } from "../Overlay";
import { ToggleSwitch } from "./VaniLogo";

const WALLPAPERS = [
  {
    id: "obsidian",
    label: "macOS Dark",
    barBg: "rgba(18, 18, 22, 0.72)",
    barText: "#f4f4f6",
    desktopBg:
      "radial-gradient(circle at 22% 28%, rgba(244,114,182,0.22), transparent 52%), radial-gradient(circle at 82% 76%, rgba(167,139,250,0.20), transparent 52%), linear-gradient(160deg, #0d0c14 0%, #161224 55%, #0c0d14 100%)",
    isLightBar: false,
  },
  {
    id: "sequoia",
    label: "Sequoia Dusk",
    barBg: "rgba(24, 18, 32, 0.56)",
    barText: "#ffffff",
    desktopBg:
      "radial-gradient(circle at 75% 20%, rgba(251,146,60,0.30), transparent 46%), radial-gradient(circle at 25% 75%, rgba(236,72,153,0.32), transparent 54%), linear-gradient(150deg, #1d1533 0%, #3a1c4a 52%, #19243b 100%)",
    isLightBar: false,
  },
  {
    id: "daylight",
    label: "macOS Light",
    barBg: "rgba(255, 255, 255, 0.78)",
    barText: "#18181b",
    desktopBg:
      "radial-gradient(circle at 20% 25%, rgba(244,114,182,0.22), transparent 52%), radial-gradient(circle at 85% 75%, rgba(103,232,249,0.25), transparent 52%), linear-gradient(155deg, #f7eef4 0%, #eef2fb 55%, #f5f2f7 100%)",
    isLightBar: true,
  },
];

const HUD_STYLES = [
  { id: "breathwave", label: "Breathwave", desc: "Smooth glowing cubic-bezier wave with reflection" },
  { id: "bars", label: "Equalizer Bars", desc: "7-bar gradient audio spectrum matching VANI mark" },
  { id: "minimal", label: "Minimal Pill", desc: "Ultra-compact Wispr-style floating indicator" },
];

const HUD_POSITIONS = [
  { id: "top-center", label: "Top Center", icon: PanelTop },
  { id: "bottom-center", label: "Bottom Center", icon: PanelBottom },
  { id: "top-right", label: "Top Right", icon: CornerUpRight },
];

const TRAY_STYLES = [
  { id: "monochrome", label: "Native Template", desc: "Adaptive white/black macOS menu bar bars" },
  { id: "accent", label: "Rose Accent", desc: "Signature pink-to-violet VANI bars" },
  { id: "live-wave", label: "Animated Live", desc: "Pulses gently while actively listening" },
  { id: "dot-wave", label: "Minimal + Dot", desc: "Compact 3-bar icon with status indicator" },
];

function MenuBarTrayIcon({ style = "monochrome", phase = "idle", isLightBar = false }) {
  const recording = phase === "recording";
  const processing = phase === "processing";
  const baseColor =
    style === "accent"
      ? "#f472b6"
      : isLightBar
      ? "#18181b"
      : "#f4f4f6";

  const activeColor = recording ? "#f472b6" : processing ? "#a78bfa" : baseColor;
  const barHeights =
    style === "dot-wave"
      ? [7, 12, 8]
      : [6, 10, 14, 10, 6];

  return (
    <span className="relative inline-flex h-[18px] items-center justify-center gap-[1.8px]">
      {barHeights.map((h, i) => (
        <span
          key={i}
          className={
            (style === "live-wave" || recording) && (recording || processing)
              ? "animate-pulse"
              : ""
          }
          style={{
            width: 2,
            height: recording ? Math.max(4, h + (i % 2 === 0 ? 2 : -2)) : h,
            borderRadius: 99,
            background:
              style === "accent"
                ? i === 2
                  ? "#ec4899"
                  : i > 2
                  ? "#a78bfa"
                  : "#f472b6"
                : activeColor,
            transition: "height 160ms ease, background-color 160ms ease",
            animationDelay: `${i * 80}ms`,
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
            background: recording ? "#f472b6" : processing ? "#a78bfa" : "#34d399",
            boxShadow: recording ? "0 0 6px rgba(244,114,182,0.9)" : "none",
          }}
        />
      )}
    </span>
  );
}

export default function HudStudioView({ settings, onSaveSettings, onNavigate, onNotify }) {
  const [wallpaperId, setWallpaperId] = useState("obsidian");
  const [phase, setPhase] = useState("recording"); // idle | recording | processing | done | error
  const [trayOpen, setTrayOpen] = useState(true);
  const [energy, setEnergy] = useState(0.68);
  const [elapsedMs, setElapsedMs] = useState(3800);
  const [cycling, setCycling] = useState(false);
  const timersRef = useRef([]);

  const wallpaper = WALLPAPERS.find((w) => w.id === wallpaperId) || WALLPAPERS[0];
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
      setTimeout(() => setPhase("done"), 4200),
      setTimeout(() => {
        setPhase("idle");
        setCycling(false);
      }, 6400)
    );
  };

  const hudPositionClass =
    hudPosition === "bottom-center"
      ? "bottom-6 left-1/2 -translate-x-1/2"
      : hudPosition === "top-right"
      ? "top-11 right-5"
      : "top-11 left-1/2 -translate-x-1/2";

  const showTop = phase === "recording" || phase === "processing";
  const showBottom = phase === "done" || phase === "error";

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text)]">Floating HUD &amp; Menu Bar</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Preview and customize VANI’s always-on-top dictation pill and macOS menu bar presence in real time.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={runFullCycle}
            disabled={cycling}
            className="vani-btn-primary inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold"
          >
            <Play className="h-3.5 w-3.5 fill-current" />
            {cycling ? "Simulating ⌥ Option…" : "Run Full Dictation Cycle"}
          </button>

          <a
            href="/?window=overlay&demo=1"
            target="_blank"
            rel="noreferrer"
            className="vani-btn-secondary inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Standalone HUD
          </a>
        </div>
      </div>

      {/* Live Interactive macOS Desktop + Menu Bar Simulator */}
      <div className="vani-card overflow-hidden">
        {/* Simulator Controls Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-2.5">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)] mr-1">
              State
            </span>
            {[
              ["idle", "Idle"],
              ["recording", "Recording"],
              ["processing", "Transcribing"],
              ["done", "Pasted"],
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
                className={`rounded-lg px-2.5 py-1 text-[11px] font-medium transition ${
                  phase === key
                    ? "bg-[var(--brand-soft)] text-[var(--brand)]"
                    : "text-[var(--muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)] mr-1">
              Desktop
            </span>
            {WALLPAPERS.map((wp) => (
              <button
                key={wp.id}
                type="button"
                onClick={() => setWallpaperId(wp.id)}
                className={`rounded-lg px-2.5 py-1 text-[11px] font-medium transition ${
                  wallpaperId === wp.id
                    ? "bg-[var(--bg-surface)] text-[var(--text)] border border-[var(--border-strong)]"
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
          className="relative h-[340px] w-full select-none overflow-hidden"
          style={{ background: wallpaper.desktopBg }}
        >
          {/* macOS Top Menu Bar */}
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

          {/* Clickable Menu Bar Tray Popover */}
          {trayOpen && (
            <div
              className="animate-scale-in absolute right-14 top-8 z-30 w-60 overflow-hidden rounded-xl p-1.5 backdrop-blur-2xl"
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
                <span className={`font-mono text-[10px] ${wallpaper.isLightBar ? "text-zinc-400" : "text-white/50"}`}>⌥</span>
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
                  Dashboard
                </span>
                <span className={`font-mono text-[10px] ${wallpaper.isLightBar ? "text-zinc-400" : "text-white/45"}`}>⌘⇧D</span>
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
                <span className={`font-mono text-[10px] ${wallpaper.isLightBar ? "text-zinc-400" : "text-white/45"}`}>⌘,</span>
              </button>
              <div className={`my-1 h-px ${wallpaper.isLightBar ? "bg-zinc-200" : "bg-white/10"}`} />
              <div className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs ${wallpaper.isLightBar ? "text-zinc-400" : "text-white/45"}`}>
                <span className="flex items-center gap-2">
                  <Power className="h-3.5 w-3.5" />
                  Quit VANI
                </span>
                <span className="font-mono text-[10px]">⌘Q</span>
              </div>
            </div>
          )}

          {/* Subtle mocked background editor window to show translucency */}
          <div className="pointer-events-none mx-auto mt-14 w-[74%] max-w-[520px] rounded-2xl border border-white/10 bg-black/25 p-5 backdrop-blur-md">
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-red-400/80" />
              <span className="h-2.5 w-2.5 rounded-full bg-amber-400/80" />
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/80" />
              <span className="ml-2 font-mono text-[10px] text-white/45">release-notes.md — Cursor</span>
            </div>
            <div className="mt-4 space-y-2 font-mono text-xs text-white/75">
              <p className="text-pink-300/80">## VANI v2.0 Highlights</p>
              <p>
                Hold <span className="rounded bg-white/10 px-1 py-0.5 text-white">⌥ Option</span> to dictate anywhere
                with local whisper-rs...
                {phase === "done" && (
                  <span className="ml-1 rounded bg-emerald-500/20 px-1 text-emerald-200">
                    Ship the new HUD and menu bar preview today!
                  </span>
                )}
                <span className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse bg-pink-400 align-middle" />
              </p>
            </div>
          </div>

          {/* ACTUAL Shared Floating HUD Pill positioned on screen */}
          <div className={`absolute z-20 flex flex-col items-center gap-2 transition-all duration-300 ${hudPositionClass}`}>
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
                onCancel={() => setPhase("idle")}
              />
            )}
            {showBottom && (
              <BottomHudPill
                phase={phase}
                text={
                  phase === "done"
                    ? "Pasted: “Ship the new HUD and menu bar preview today!”"
                    : "Microphone permission required"
                }
                visible={showBottom}
                glass={hudGlass}
              />
            )}
            {phase === "idle" && (
              <span className="rounded-full border border-white/15 bg-black/40 px-3 py-1 text-[11px] text-white/70 backdrop-blur-md">
                HUD hidden until you hold ⌥ Option or click the menu bar icon
              </span>
            )}
          </div>

          {/* Interactive hint pill at bottom-left */}
          <div className="absolute bottom-3 left-3.5 flex items-center gap-2 rounded-full border border-white/10 bg-black/40 px-3 py-1 text-[10.5px] text-white/75 backdrop-blur-md">
            <Sparkles className="h-3 w-3 text-pink-400" />
            <span>Click VANI’s waveform icon in the top bar to toggle the tray menu</span>
          </div>
        </div>
      </div>

      {/* Bottom Configuration Grid: Floating HUD Customization + Menu Bar Icon Style */}
      <div className="grid gap-5 lg:grid-cols-12">
        {/* Floating HUD Controls */}
        <div className="vani-card p-5 lg:col-span-7 space-y-5">
          <div>
            <h2 className="text-sm font-semibold text-[var(--text)]">Floating HUD Appearance</h2>
            <p className="mt-0.5 text-xs text-[var(--muted)]">
              Changes sync immediately to the live macOS overlay window.
            </p>
          </div>

          {/* Visual Style */}
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]">Waveform Style</p>
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
                    className={`rounded-xl border p-3 text-left transition ${
                      active
                        ? "border-[var(--brand)] bg-[var(--bg-active)]"
                        : "border-[var(--border)] bg-[var(--bg-elevated)] hover:border-[var(--border-strong)]"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-[var(--text)]">{item.label}</span>
                      {active && <Check className="h-3.5 w-3.5 text-[var(--brand)]" />}
                    </div>
                    <p className="mt-1 text-[11px] leading-snug text-[var(--muted)]">{item.desc}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Screen Position */}
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]">Screen Position</p>
            <div className="grid grid-cols-3 gap-2">
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
                    className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium transition ${
                      active
                        ? "border-[var(--brand)] bg-[var(--bg-active)] text-[var(--brand)]"
                        : "border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text-soft)] hover:border-[var(--border-strong)]"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {pos.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Voice Energy Slider + Display Toggles */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-3.5 space-y-2 sm:col-span-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-[var(--text)]">Simulated Voice Level</span>
                <span className="font-mono text-[var(--brand)]">{Math.round(energy * 100)}%</span>
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

            {[
              ["hudShowTimer", "Show Elapsed Timer", hudShowTimer],
              ["hudShowMode", "Show Mode Pill", hudShowMode],
              ["hudGlass", "Frosted Glass Blur", hudGlass],
            ].map(([key, label, val]) => (
              <div
                key={key}
                className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3.5 py-2.5"
              >
                <span className="text-xs font-medium text-[var(--text)]">{label}</span>
                <ToggleSwitch
                  checked={val}
                  onChange={(next) => onSaveSettings({ [key]: next })}
                  label={label}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Menu Bar Icon Style Selector */}
        <div className="vani-card p-5 lg:col-span-5 flex flex-col justify-between gap-4">
          <div className="space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-[var(--text)]">Menu Bar Icon Style</h2>
              <p className="mt-0.5 text-xs text-[var(--muted)]">
                Choose how VANI appears in the macOS top menu bar alongside Wi-Fi and Control Center.
              </p>
            </div>

            <div className="space-y-2.5">
              {TRAY_STYLES.map((item) => {
                const active = trayIconStyle === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      onSaveSettings({ trayIconStyle: item.id });
                      onNotify?.(`Menu bar icon preview: ${item.label}`);
                    }}
                    className={`flex w-full items-center justify-between gap-3 rounded-xl border p-3 text-left transition ${
                      active
                        ? "border-[var(--brand)] bg-[var(--bg-active)]"
                        : "border-[var(--border)] bg-[var(--bg-elevated)] hover:border-[var(--border-strong)]"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-11 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-[#14131a]">
                        <MenuBarTrayIcon style={item.id} phase={phase} isLightBar={false} />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-[var(--text)]">{item.label}</p>
                        <p className="mt-0.5 text-[11px] text-[var(--muted)]">{item.desc}</p>
                      </div>
                    </div>
                    {active && <Check className="h-4 w-4 shrink-0 text-[var(--brand)]" />}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-app)] p-3.5 text-xs text-[var(--muted)] flex items-start gap-2.5">
            <Shield className="h-4 w-4 shrink-0 text-[var(--emerald)] mt-0.5" />
            <span>
              Left-clicking VANI’s macOS menu bar icon toggles the floating overlay instantly; right-clicking opens Dashboard, Settings, and Quit.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

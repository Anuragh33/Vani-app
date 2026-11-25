import { useCallback, useEffect, useId, useRef, useState } from "react";
import useRecorder from "./hooks/useRecorder";

function smoothPath(pts) {
  if (pts.length < 2) return "";
  let d = `M${pts[0].x.toFixed(2)},${pts[0].y.toFixed(2)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const cx = (pts[i].x + pts[i + 1].x) / 2;
    d += ` C${cx.toFixed(2)},${pts[i].y.toFixed(2)} ${cx.toFixed(2)},${pts[i + 1].y.toFixed(2)} ${pts[i + 1].x.toFixed(2)},${pts[i + 1].y.toFixed(2)}`;
  }
  return d;
}

function levelsToPath(levels, W, H, flip = false) {
  const mid = H / 2;
  const pts = levels.map((v, i) => ({
    x: (i / (levels.length - 1)) * W,
    y: flip ? mid + v * mid * 0.8 : mid - v * mid * 0.8,
  }));
  return smoothPath(pts);
}

const WAVE_PTS = 22;

function useSmoothLevels(rawLevels, active, simulatedEnergy = 0) {
  const [levels, setLevels] = useState(() =>
    Array.from({ length: WAVE_PTS }, (_, i) => 0.05 + 0.02 * Math.sin(i * 0.5))
  );
  const phaseRef = useRef(0);

  useEffect(() => {
    if (active && rawLevels?.length && simulatedEnergy <= 0) return;
    let raf;
    const tick = () => {
      phaseRef.current += simulatedEnergy > 0 ? 0.14 : 0.028;
      const t = phaseRef.current;
      setLevels(
        Array.from({ length: WAVE_PTS }, (_, i) => {
          const env = Math.sin((i / (WAVE_PTS - 1)) * Math.PI);
          if (simulatedEnergy > 0 && active) {
            const v =
              (0.14 +
                0.78 *
                  simulatedEnergy *
                  Math.abs(Math.sin(t + i * 0.38)) *
                  Math.abs(Math.cos(t * 0.72 - i * 0.24))) *
              env;
            return Math.min(1, Math.max(0.05, v));
          }
          return (0.04 + 0.03 * Math.sin(t + i * 0.36) + 0.012 * Math.sin(t * 1.8 + i * 0.85)) * (0.4 + 0.6 * env);
        })
      );
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, rawLevels, simulatedEnergy]);

  useEffect(() => {
    if (!active || !rawLevels?.length || simulatedEnergy > 0) return;
    const src = rawLevels;
    const interp = Array.from({ length: WAVE_PTS }, (_, i) => {
      const t = (i / (WAVE_PTS - 1)) * (src.length - 1);
      const lo = Math.floor(t);
      const hi = Math.min(lo + 1, src.length - 1);
      const env = 0.25 + 0.75 * Math.sin((i / (WAVE_PTS - 1)) * Math.PI);
      return ((src[lo] ?? 0) * (1 - (t - lo)) + (src[hi] ?? 0) * (t - lo)) * env;
    });
    setLevels((prev) => prev.map((v, i) => v * 0.4 + interp[i] * 0.6));
  }, [rawLevels, active, simulatedEnergy]);

  return levels;
}

function Breathwave({ levels, active, peak }) {
  const W = 108;
  const H = 26;
  const uid = useId();
  const topPath = levelsToPath(levels, W, H, false);
  const botPath = levelsToPath(levels, W, H, true);

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ overflow: "visible" }}>
      <defs>
        <linearGradient id={`${uid}g`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#f472b6" />
          <stop offset="50%" stopColor="#a78bfa" />
          <stop offset="100%" stopColor="#67e8f9" />
        </linearGradient>
        <filter id={`${uid}f`}>
          <feGaussianBlur in="SourceGraphic" stdDeviation="1.6" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <path d={botPath} fill="none" stroke={`url(#${uid}g)`} strokeWidth="1.2" strokeLinecap="round" opacity={0.24} />
      <path
        d={topPath}
        fill="none"
        stroke={`url(#${uid}g)`}
        strokeWidth="2"
        strokeLinecap="round"
        opacity={active ? Math.min(1, 0.58 + peak * 0.42) : 0.45}
        filter={active ? `url(#${uid}f)` : undefined}
      />
    </svg>
  );
}

// VANI signature 5-bar / 7-bar reactive equalizer style
function EqualizerBars({ levels, active }) {
  const barIndices = [3, 6, 8, 11, 14, 16, 19];
  const colors = ["#f9a8d4", "#f472b6", "#ec4899", "#c084fc", "#a78bfa", "#818cf8", "#67e8f9"];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 3.5, height: 24, padding: "0 4px" }}>
      {barIndices.map((idx, i) => {
        const val = active ? Math.max(0.18, Math.min(1, (levels[idx] ?? 0.2) * 1.25)) : 0.2;
        const h = Math.round(5 + val * 18);
        return (
          <span
            key={idx}
            style={{
              width: 3,
              height: h,
              borderRadius: 999,
              background: colors[i],
              boxShadow: active && val > 0.45 ? `0 0 8px ${colors[i]}88` : "none",
              transition: "height 75ms ease-out",
            }}
          />
        );
      })}
    </div>
  );
}

// Ultra-compact 3-bar Wispr-style minimal indicator
function MinimalBars({ levels, active }) {
  const idxs = [6, 11, 16];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 2.5, height: 18 }}>
      {idxs.map((idx, i) => {
        const val = active ? Math.max(0.22, Math.min(1, (levels[idx] ?? 0.2) * 1.2)) : 0.24;
        const h = Math.round(5 + val * 13);
        return (
          <span
            key={idx}
            style={{
              width: 2.8,
              height: h,
              borderRadius: 999,
              background: i === 1 ? "#f472b6" : "#f9a8d4",
              transition: "height 75ms ease-out",
            }}
          />
        );
      })}
    </div>
  );
}

function OrbitDots({ compact = false }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div className="relative flex h-[26px] w-[32px] items-center justify-center">
        <style>{`
          @keyframes vaniOrbit {
            from { transform: rotate(var(--od)) translateX(7.5px) rotate(calc(-1*var(--od))); }
            to   { transform: rotate(calc(var(--od) + 360deg)) translateX(7.5px) rotate(calc(-1*(var(--od)+360deg))); }
          }
        `}</style>
        {[
          { deg: 0, color: "#f472b6", dur: "0.88s" },
          { deg: 120, color: "#a78bfa", dur: "0.96s" },
          { deg: 240, color: "#67e8f9", dur: "1.04s" },
        ].map(({ deg, color, dur }, i) => (
          <span
            key={i}
            className="absolute h-[4px] w-[4px] rounded-full"
            style={{
              "--od": `${deg}deg`,
              background: color,
              boxShadow: `0 0 6px 1px ${color}88`,
              animation: `vaniOrbit ${dur} linear infinite`,
            }}
          />
        ))}
      </div>
      {!compact && (
        <span style={{ fontSize: 12, fontWeight: 500, color: "rgba(255,255,255,0.84)", letterSpacing: "0.01em" }}>
          Transcribing…
        </span>
      )}
    </div>
  );
}

function formatClock(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${String(rem).padStart(2, "0")}`;
}

// Shared Floating HUD pill — rendered identically in Overlay.jsx and HudStudioView.jsx
export function FloatingHudPill({
  phase = "recording",
  levels: rawLevels,
  simulatedEnergy = 0,
  visible = true,
  elapsedMs = 0,
  modeLabel = "general",
  hudStyle = "breathwave",
  showTimer = true,
  showMode = true,
  glass = true,
  handsFree = false,
}) {
  const recording = phase === "recording";
  const processing = phase === "processing";

  const smoothLevels = useSmoothLevels(rawLevels, recording, simulatedEnergy);
  const peak = Math.max(...smoothLevels);
  const compact = hudStyle === "minimal";

  return (
    <div
      style={{
        height: compact ? 32 : 40,
        paddingLeft: compact ? 11 : 14,
        paddingRight: compact ? 11 : 14,
        borderRadius: 999,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: compact ? 8 : 10,
        background: glass ? "rgba(11, 9, 18, 0.78)" : "rgba(11, 9, 18, 0.96)",
        backdropFilter: glass ? "blur(28px) saturate(160%)" : "none",
        WebkitBackdropFilter: glass ? "blur(28px) saturate(160%)" : "none",
        boxShadow: [
          "0 0 0 1px rgba(255,255,255,0.11) inset",
          recording
            ? `0 8px 26px rgba(0,0,0,0.45), 0 0 ${10 + peak * 20}px ${2 + peak * 4}px rgba(244,114,182,${0.18 + peak * 0.36})`
            : processing
            ? "0 8px 26px rgba(0,0,0,0.45), 0 0 14px 2px rgba(167,139,250,0.26)"
            : "0 6px 20px rgba(0,0,0,0.35)",
        ]
          .filter(Boolean)
          .join(", "),
        opacity: visible ? 1 : 0,
        transform: visible
          ? `scale(${recording ? 1 + peak * 0.025 : 1})`
          : "scale(0.88) translateY(-6px)",
        transition: "opacity 200ms ease, transform 180ms cubic-bezier(0.34,1.56,0.64,1), box-shadow 80ms linear",
      }}
    >
      {processing ? (
        <OrbitDots compact={compact} />
      ) : (
        <>
          <span
            style={{
              height: compact ? 6 : 7,
              width: compact ? 6 : 7,
              borderRadius: "50%",
              background: handsFree ? "#34d399" : "#f472b6",
              boxShadow: handsFree
                ? "0 0 8px rgba(52,211,153,0.95)"
                : "0 0 8px rgba(244,114,182,0.95)",
              flexShrink: 0,
            }}
          />

          {handsFree && (
            <span
              style={{
                fontSize: compact ? 8.5 : 9,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                color: "#6ee7b7",
                background: "rgba(52,211,153,0.16)",
                padding: compact ? "1.5px 5px" : "2px 6px",
                borderRadius: 999,
                whiteSpace: "nowrap",
              }}
            >
              Hands-Free
            </span>
          )}

          {hudStyle === "bars" ? (
            <EqualizerBars levels={smoothLevels} active={recording} />
          ) : hudStyle === "minimal" ? (
            <MinimalBars levels={smoothLevels} active={recording} />
          ) : (
            <Breathwave levels={smoothLevels} active={recording} peak={peak} />
          )}

          {showTimer && (
            <span
              style={{
                fontSize: compact ? 10.5 : 11,
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                color: "rgba(255,255,255,0.74)",
                fontVariantNumeric: "tabular-nums",
                minWidth: 26,
              }}
            >
              {formatClock(elapsedMs)}
            </span>
          )}

          {showMode && modeLabel && modeLabel !== "general" && (
            <span
              style={{
                fontSize: 9.5,
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                color: "#f9a8d4",
                background: "rgba(244,114,182,0.18)",
                padding: "2px 6px",
                borderRadius: 999,
              }}
            >
              {modeLabel}
            </span>
          )}
        </>
      )}
    </div>
  );
}

export function BottomHudPill({ phase, text, visible, glass = true }) {
  return (
    <div
      style={{
        minHeight: 38,
        maxWidth: 296,
        borderRadius: 14,
        padding: "7px 14px",
        display: "inline-flex",
        alignItems: "center",
        background: glass ? "rgba(11, 9, 18, 0.84)" : "rgba(11, 9, 18, 0.96)",
        backdropFilter: glass ? "blur(32px) saturate(160%)" : "none",
        WebkitBackdropFilter: glass ? "blur(32px) saturate(160%)" : "none",
        boxShadow: [
          "0 0 0 1px rgba(255,255,255,0.10) inset",
          "0 10px 28px rgba(0,0,0,0.45)",
          phase === "done" ? "0 0 16px 2px rgba(52,211,153,0.18)" : "",
          phase === "error" ? "0 0 16px 2px rgba(248,113,113,0.22)" : "",
        ]
          .filter(Boolean)
          .join(", "),
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0) scale(1)" : "translateY(-8px) scale(0.96)",
        transition: "opacity 220ms ease, transform 220ms cubic-bezier(0.34,1.56,0.64,1)",
      }}
    >
      {phase === "done" && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, width: "100%" }}>
          <span
            style={{
              height: 6,
              width: 6,
              borderRadius: "50%",
              background: "#34d399",
              boxShadow: "0 0 6px rgba(52,211,153,0.9)",
              flexShrink: 0,
            }}
          />
          <span
            style={{
              fontSize: 12.5,
              color: "#a7f3d0",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {text || "Pasted"}
          </span>
        </div>
      )}
      {phase === "error" && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, width: "100%" }}>
          <span style={{ height: 6, width: 6, borderRadius: "50%", background: "#f87171", flexShrink: 0 }} />
          <span
            style={{
              fontSize: 12.5,
              color: "#fca5a5",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {text}
          </span>
        </div>
      )}
    </div>
  );
}

export default function Overlay() {
  const isDemo =
    typeof window !== "undefined" && new URLSearchParams(window.location.search).get("demo") === "1";

  const [phase, setPhase] = useState(isDemo ? "recording" : "idle");
  const [visible, setVisible] = useState(isDemo);
  const [text, setText] = useState("");
  const [meta, setMeta] = useState({});
  const [hudCfg, setHudCfg] = useState({
    silenceDurationMs: 2000,
    autoStopOnSilence: true,
    cleanupContext: "general",
    hudStyle: "breathwave",
    hudShowTimer: true,
    hudShowMode: true,
    hudGlass: true,
    handsFreeIdleTimeoutSec: 60,
  });
  const [elapsedMs, setElapsedMs] = useState(isDemo ? 4200 : 0);
  const autoHideRef = useRef(null);
  const idleExitRef = useRef(null);
  const clockRef = useRef(null);
  const startTsRef = useRef(0);
  const recorderRef = useRef(null);
  const handsFreeRef = useRef(false);
  const [handsFreeMode, setHandsFreeMode] = useState(false);

  const clearIdleExit = useCallback(() => {
    if (idleExitRef.current) {
      clearTimeout(idleExitRef.current);
      idleExitRef.current = null;
    }
  }, []);

  const stopClock = useCallback(() => {
    if (clockRef.current) {
      clearInterval(clockRef.current);
      clockRef.current = null;
    }
  }, []);

  const scheduleHide = useCallback(
    (delay = 600) => {
      stopClock();
      clearIdleExit();
      handsFreeRef.current = false;
      setHandsFreeMode(false);
      if (autoHideRef.current) clearTimeout(autoHideRef.current);
      autoHideRef.current = setTimeout(() => {
        setVisible(false);
        setTimeout(() => {
          window.vani?.cancelDictation?.();
          setPhase("idle");
          setText("");
          setElapsedMs(0);
        }, 220);
      }, delay);
    },
    [stopClock, clearIdleExit]
  );

  const armIdleExit = useCallback(() => {
    clearIdleExit();
    const timeoutSec = hudCfg.handsFreeIdleTimeoutSec ?? 60;
    if (!handsFreeRef.current || !timeoutSec || timeoutSec <= 0) return;
    idleExitRef.current = setTimeout(() => {
      if (!handsFreeRef.current) return;
      recorderRef.current?.cancel?.();
      scheduleHide(0);
    }, timeoutSec * 1000);
  }, [clearIdleExit, hudCfg.handsFreeIdleTimeoutSec, scheduleHide]);

  const startHandsFreeTurn = useCallback(() => {
    if (!handsFreeRef.current) return;
    setPhase("recording");
    setText("");
    setElapsedMs(0);
    startTsRef.current = Date.now();
    stopClock();
    clockRef.current = setInterval(() => setElapsedMs(Date.now() - startTsRef.current), 200);
    setVisible(true);
    armIdleExit();
    setTimeout(() => {
      if (handsFreeRef.current) recorderRef.current?.start?.();
    }, 220);
  }, [stopClock, armIdleExit]);

  useEffect(() => {
    let cancelled = false;
    const apply = (s) => {
      if (!s) return;
      setHudCfg((prev) => ({
        silenceDurationMs: typeof s.silenceDurationMs === "number" ? s.silenceDurationMs : prev.silenceDurationMs,
        autoStopOnSilence: typeof s.autoStopOnSilence === "boolean" ? s.autoStopOnSilence : prev.autoStopOnSilence,
        cleanupContext: typeof s.cleanupContext === "string" ? s.cleanupContext : prev.cleanupContext,
        hudStyle: typeof s.hudStyle === "string" ? s.hudStyle : prev.hudStyle,
        hudShowTimer: typeof s.hudShowTimer === "boolean" ? s.hudShowTimer : prev.hudShowTimer,
        hudShowMode: typeof s.hudShowMode === "boolean" ? s.hudShowMode : prev.hudShowMode,
        hudGlass: typeof s.hudGlass === "boolean" ? s.hudGlass : prev.hudGlass,
        handsFreeIdleTimeoutSec:
          typeof s.handsFreeIdleTimeoutSec === "number" ? s.handsFreeIdleTimeoutSec : prev.handsFreeIdleTimeoutSec,
      }));
    };
    window.vani?.getSettings?.().then((s) => {
      if (!cancelled) apply(s);
    });
    const off = window.vani?.onSettingsUpdated?.(apply);
    return () => {
      cancelled = true;
      off?.();
    };
  }, []);

  const doInject = useCallback(
    async (injText, extraMeta = {}, autoSend = false) => {
      await window.vani?.injectOverlayText?.({ text: injText, ...meta, ...extraMeta, autoSend });
      if (handsFreeRef.current) {
        startHandsFreeTurn();
      } else {
        scheduleHide(0);
      }
    },
    [meta, scheduleHide, startHandsFreeTurn]
  );

  const recorder = useRecorder({
    enabledSilenceDetection: handsFreeMode || hudCfg.autoStopOnSilence,
    silenceDurationMs: handsFreeMode ? Math.min(hudCfg.silenceDurationMs || 1600, 1600) : hudCfg.silenceDurationMs,
    waitForSpeech: handsFreeMode,
    onStateChange: (recording) => {
      if (recording) setPhase("recording");
    },
    onSilentFinish: () => {
      if (handsFreeRef.current) {
        startHandsFreeTurn();
      } else {
        scheduleHide(0);
      }
    },
    onError: (msg) => {
      stopClock();
      if (handsFreeRef.current) {
        // Don't drop hands-free on transient silence; only show error on real mic failure
        if (String(msg || "").toLowerCase().includes("no speech")) {
          startHandsFreeTurn();
          return;
        }
      }
      setPhase("error");
      setText(msg || "Mic error");
      scheduleHide(2400);
    },
    onRecordingComplete: async (payload) => {
      stopClock();
      clearIdleExit();
      setPhase("processing");
      setText("");
      try {
        const isHandsFree = handsFreeRef.current;
        const arg =
          payload && typeof payload === "object" && ("wavPath" in payload || "wavBuffer" in payload)
            ? { ...payload, allowActions: true, handsFree: isHandsFree }
            : { wavBuffer: payload, allowActions: true, handsFree: isHandsFree };
        const result = await window.vani?.dictationComplete?.(arg);
        if (!result?.ok) {
          if (!result?.error || result.error === "Nothing heard.") {
            if (handsFreeRef.current) {
              startHandsFreeTurn();
            } else {
              scheduleHide(0);
            }
          } else {
            setPhase("error");
            setText(result.error);
            scheduleHide(2000);
          }
          return;
        }
        if (result.actionExecuted) {
          if (result.stopHandsFree) {
            scheduleHide(0);
          } else if (result.followUpDictation || handsFreeRef.current) {
            handsFreeRef.current = true;
            setHandsFreeMode(true);
            startHandsFreeTurn();
          } else {
            scheduleHide(0);
          }
          return;
        }
        if (result.command === "delete" || result.command === "undo") {
          if (handsFreeRef.current) startHandsFreeTurn();
          else scheduleHide(0);
          return;
        }
        const nextMeta = {
          rawText: result.rawText,
          providerLabel: result.providerLabel,
          privacyMode: result.privacyMode,
        };
        setMeta(nextMeta);
        // In Hands-Free mode, automatically send (press Enter) after pasting directly into the active app!
        await doInject(result.text || "", nextMeta, handsFreeRef.current);
      } catch (err) {
        setPhase("error");
        setText(err.message || "Failed");
        scheduleHide(2000);
      }
    },
  });

  recorderRef.current = recorder;

  useEffect(() => {
    const offShown = window.vani?.onOverlayShown?.(() => {
      if (autoHideRef.current) {
        clearTimeout(autoHideRef.current);
        autoHideRef.current = null;
      }
      setPhase("idle");
      setText("");
      requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
    });
    const offStart = window.vani?.onDictationStart?.(() => {
      if (autoHideRef.current) {
        clearTimeout(autoHideRef.current);
        autoHideRef.current = null;
      }
      handsFreeRef.current = false;
      setHandsFreeMode(false);
      setPhase("recording");
      setText("");
      setElapsedMs(0);
      startTsRef.current = Date.now();
      stopClock();
      clockRef.current = setInterval(() => setElapsedMs(Date.now() - startTsRef.current), 200);
      setVisible(true);
      recorder.start();
    });
    const offStop = window.vani?.onDictationStop?.(() => {
      if (handsFreeRef.current) return;
      stopClock();
      setPhase("processing");
      setVisible(true);
      recorder.stop();
    });
    const offHandsFreeStart = window.vani?.onHandsFreeStart?.((payload) => {
      if (autoHideRef.current) {
        clearTimeout(autoHideRef.current);
        autoHideRef.current = null;
      }
      handsFreeRef.current = true;
      setHandsFreeMode(true);
      setPhase("recording");
      setVisible(true);
      armIdleExit();
      if (!payload?.alreadyRecording) {
        setText("");
        setElapsedMs(0);
        startTsRef.current = Date.now();
        stopClock();
        clockRef.current = setInterval(() => setElapsedMs(Date.now() - startTsRef.current), 200);
        recorder.start();
      }
    });
    const offHandsFreeStop = window.vani?.onHandsFreeStop?.(() => {
      handsFreeRef.current = false;
      setHandsFreeMode(false);
      clearIdleExit();
      recorder.cancel?.();
      scheduleHide(0);
    });
    return () => {
      offShown?.();
      offStart?.();
      offStop?.();
      offHandsFreeStart?.();
      offHandsFreeStop?.();
      stopClock();
      clearIdleExit();
      if (autoHideRef.current) clearTimeout(autoHideRef.current);
    };
  }, [recorder, scheduleHide, stopClock, armIdleExit, clearIdleExit]);

  const showTop = phase === "recording" || phase === "processing";
  const showBottom = phase === "error";

  return (
    <div
      style={{
        height: "100vh",
        width: "100vw",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        paddingTop: 10,
        background: "transparent",
        userSelect: "none",
        overflow: "hidden",
        pointerEvents: "none",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, pointerEvents: "none" }}>
        <FloatingHudPill
          phase={phase}
          levels={recorder.levels}
          simulatedEnergy={isDemo ? 0.65 : 0}
          visible={showTop && visible}
          elapsedMs={elapsedMs}
          modeLabel={hudCfg.cleanupContext}
          hudStyle={hudCfg.hudStyle}
          showTimer={hudCfg.hudShowTimer}
          showMode={hudCfg.hudShowMode}
          glass={hudCfg.hudGlass}
          handsFree={handsFreeMode}
        />
        {showBottom && <BottomHudPill phase={phase} text={text} visible={showBottom && visible} glass={hudCfg.hudGlass} />}
      </div>
    </div>
  );
}

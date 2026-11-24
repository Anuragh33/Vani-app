import { useEffect, useId, useRef, useState } from "react";

// Razor-sharp vector reproduction of VANI's iconic 5-bar waveform squircle
export function VaniLogo({ size = 34, className = "" }) {
  const uid = useId();
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      className={`shrink-0 ${className}`}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={`${uid}-bg`} x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#1e141c" />
          <stop offset="100%" stopColor="#0f0a0e" />
        </linearGradient>
        <linearGradient id={`${uid}-bars`} x1="8" y1="6" x2="32" y2="34" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#f9a8d4" />
          <stop offset="52%" stopColor="#f472b6" />
          <stop offset="100%" stopColor="#ec4899" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="38" height="38" rx="10.5" fill={`url(#${uid}-bg)`} stroke="rgba(244,114,182,0.28)" strokeWidth="1.2" />
      <rect x="8.5" y="15.5" width="2.8" height="9" rx="1.4" fill={`url(#${uid}-bars)`} opacity="0.78" />
      <rect x="13.5" y="11" width="2.8" height="18" rx="1.4" fill={`url(#${uid}-bars)`} opacity="0.92" />
      <rect x="18.6" y="7" width="2.8" height="26" rx="1.4" fill={`url(#${uid}-bars)`} />
      <rect x="23.7" y="11" width="2.8" height="18" rx="1.4" fill={`url(#${uid}-bars)`} opacity="0.92" />
      <rect x="28.7" y="15.5" width="2.8" height="9" rx="1.4" fill={`url(#${uid}-bars)`} opacity="0.78" />
    </svg>
  );
}

// Smooth cubic bezier audio wave — responds to real mic levels or gentle breathing idle state
function smoothPath(pts) {
  if (pts.length < 2) return "";
  let d = `M${pts[0].x.toFixed(2)},${pts[0].y.toFixed(2)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const cx = (pts[i].x + pts[i + 1].x) / 2;
    d += ` C${cx.toFixed(2)},${pts[i].y.toFixed(2)} ${cx.toFixed(2)},${pts[i + 1].y.toFixed(2)} ${pts[i + 1].x.toFixed(2)},${pts[i + 1].y.toFixed(2)}`;
  }
  return d;
}

export function LiveWaveform({ levels, active = false, simulate = false, width = 260, height = 48, className = "" }) {
  const uid = useId();
  const POINTS = 28;
  const [smooth, setSmooth] = useState(() =>
    Array.from({ length: POINTS }, (_, i) => 0.08 + 0.04 * Math.sin(i * 0.45))
  );
  const phaseRef = useRef(0);

  useEffect(() => {
    if (active && !simulate) return;
    let raf;
    const tick = () => {
      phaseRef.current += simulate ? 0.14 : 0.035;
      const t = phaseRef.current;
      setSmooth(
        Array.from({ length: POINTS }, (_, i) => {
          const env = Math.sin((i / (POINTS - 1)) * Math.PI);
          if (simulate) {
            const amp = 0.22 + 0.55 * Math.abs(Math.sin(t + i * 0.34)) * Math.abs(Math.cos(t * 0.65 - i * 0.21));
            return Math.max(0.06, amp * env);
          }
          return (0.06 + 0.045 * Math.sin(t + i * 0.32) + 0.02 * Math.cos(t * 1.6 + i * 0.7)) * (0.45 + 0.55 * env);
        })
      );
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, simulate]);

  useEffect(() => {
    if (!active || simulate || !levels?.length) return;
    const src = levels;
    const interp = Array.from({ length: POINTS }, (_, i) => {
      const t = (i / (POINTS - 1)) * (src.length - 1);
      const lo = Math.floor(t);
      const hi = Math.min(lo + 1, src.length - 1);
      const env = 0.25 + 0.75 * Math.sin((i / (POINTS - 1)) * Math.PI);
      const val = (src[lo] ?? 0.08) * (1 - (t - lo)) + (src[hi] ?? 0.08) * (t - lo);
      return Math.min(1, val * env);
    });
    setSmooth((prev) => prev.map((v, i) => v * 0.38 + interp[i] * 0.62));
  }, [levels, active, simulate]);

  const mid = height / 2;
  const topPts = smooth.map((v, i) => ({
    x: (i / (POINTS - 1)) * width,
    y: mid - v * mid * 0.84,
  }));
  const botPts = smooth.map((v, i) => ({
    x: (i / (POINTS - 1)) * width,
    y: mid + v * mid * 0.84,
  }));

  const topD = smoothPath(topPts);
  const botD = smoothPath(botPts);
  const peak = Math.max(...smooth);

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={`overflow-visible ${className}`}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={`${uid}-grad`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#f472b6" />
          <stop offset="50%" stopColor="#a78bfa" />
          <stop offset="100%" stopColor="#67e8f9" />
        </linearGradient>
        <filter id={`${uid}-glow`}>
          <feGaussianBlur in="SourceGraphic" stdDeviation="2.2" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Center hairline */}
      <line
        x1="0"
        y1={mid}
        x2={width}
        y2={mid}
        stroke="currentColor"
        strokeWidth="1"
        opacity="0.08"
      />

      {/* Mirror reflection */}
      <path
        d={botD}
        fill="none"
        stroke={`url(#${uid}-grad)`}
        strokeWidth="1.4"
        strokeLinecap="round"
        opacity={active || simulate ? 0.34 : 0.16}
      />

      {/* Primary glow wave */}
      <path
        d={topD}
        fill="none"
        stroke={`url(#${uid}-grad)`}
        strokeWidth="2.2"
        strokeLinecap="round"
        opacity={active || simulate ? Math.min(1, 0.58 + peak * 0.42) : 0.52}
        filter={active || simulate ? `url(#${uid}-glow)` : undefined}
      />
    </svg>
  );
}

// Reusable tactile switch control
export function ToggleSwitch({ checked, onChange, disabled = false, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors duration-200 ${
        checked
          ? "border-transparent bg-[var(--brand)]"
          : "border-[var(--border-strong)] bg-[var(--bg-elevated)]"
      } ${disabled ? "cursor-not-allowed opacity-45" : "cursor-pointer"}`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200 ${
          checked ? "translate-x-[22px]" : "translate-x-[3px]"
        }`}
      />
    </button>
  );
}

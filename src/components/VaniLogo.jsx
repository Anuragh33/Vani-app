import { useEffect, useId, useRef, useState } from "react";

// Flat 5-bar acoustic mark in solid VANI rose — no gradients, no glow
export function VaniLogo({ size = 32, className = "" }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      className={`shrink-0 ${className}`}
      aria-hidden="true"
    >
      <rect
        x="0.5"
        y="0.5"
        width="31"
        height="31"
        rx="7.5"
        fill="var(--bg-surface)"
        stroke="var(--border-strong)"
      />
      <rect x="6.5" y="12.5" width="2.4" height="7" rx="1.2" fill="var(--brand)" opacity="0.58" />
      <rect x="10.7" y="9" width="2.4" height="14" rx="1.2" fill="var(--brand)" opacity="0.82" />
      <rect x="14.8" y="6" width="2.4" height="20" rx="1.2" fill="var(--brand)" />
      <rect x="18.9" y="9" width="2.4" height="14" rx="1.2" fill="var(--brand)" opacity="0.82" />
      <rect x="23.1" y="12.5" width="2.4" height="7" rx="1.2" fill="var(--brand)" opacity="0.58" />
    </svg>
  );
}

// Smooth cubic bezier acoustic waveform — responds to real mic levels
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
    Array.from({ length: POINTS }, (_, i) => 0.06 + 0.03 * Math.sin(i * 0.45))
  );
  const phaseRef = useRef(0);

  useEffect(() => {
    if (active && !simulate) return;
    let raf;
    const tick = () => {
      phaseRef.current += simulate ? 0.13 : 0.025;
      const t = phaseRef.current;
      setSmooth(
        Array.from({ length: POINTS }, (_, i) => {
          const env = Math.sin((i / (POINTS - 1)) * Math.PI);
          if (simulate) {
            const amp = 0.22 + 0.55 * Math.abs(Math.sin(t + i * 0.34)) * Math.abs(Math.cos(t * 0.65 - i * 0.21));
            return Math.max(0.06, amp * env);
          }
          return (0.04 + 0.025 * Math.sin(t + i * 0.32)) * (0.45 + 0.55 * env);
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
        <linearGradient id={`${uid}-tone`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="var(--brand)" stopOpacity="0.45" />
          <stop offset="50%" stopColor="var(--brand)" stopOpacity="1" />
          <stop offset="100%" stopColor="var(--brand)" stopOpacity="0.45" />
        </linearGradient>
      </defs>

      <line
        x1="0"
        y1={mid}
        x2={width}
        y2={mid}
        stroke="currentColor"
        strokeWidth="1"
        opacity="0.08"
      />

      <path
        d={botD}
        fill="none"
        stroke={`url(#${uid}-tone)`}
        strokeWidth="1.2"
        strokeLinecap="round"
        opacity={active || simulate ? 0.3 : 0.14}
      />

      <path
        d={topD}
        fill="none"
        stroke={`url(#${uid}-tone)`}
        strokeWidth="2"
        strokeLinecap="round"
        opacity={active || simulate ? Math.min(1, 0.62 + peak * 0.38) : 0.45}
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
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors duration-150 ${
        checked
          ? "border-transparent bg-[var(--brand)]"
          : "border-[var(--border-strong)] bg-[var(--bg-elevated)]"
      } ${disabled ? "cursor-not-allowed opacity-45" : "cursor-pointer"}`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform duration-150 ${
          checked ? "translate-x-[18px]" : "translate-x-[2px]"
        }`}
      />
    </button>
  );
}

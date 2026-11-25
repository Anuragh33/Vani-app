import { useMemo, useState } from "react";

function countWords(text) {
  return (text || "").trim().split(/\s+/).filter(Boolean).length;
}

export default function UsageView({ history }) {
  const [typingWpm, setTypingWpm] = useState(45);
  const [hoveredDay, setHoveredDay] = useState(null);
  const speakingWpm = 148;

  const stats = useMemo(() => {
    const entries = history || [];
    const totalSessions = entries.length;
    const injectedCount = entries.filter((e) => e.injected).length;
    const totalWords = entries.reduce((sum, e) => sum + countWords(e.cleanedText || e.rawText), 0);
    const totalChars = entries.reduce((sum, e) => sum + ((e.cleanedText || e.rawText)?.length || 0), 0);
    const injectionRate = totalSessions ? Math.round((injectedCount / totalSessions) * 100) : 0;

    const days = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      days.push({
        key,
        label: d.toLocaleDateString(undefined, { weekday: "short" }),
        fullDate: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
        isToday: i === 0,
        words: 0,
        sessions: 0,
      });
    }
    const dayMap = new Map(days.map((d) => [d.key, d]));

    const providers = new Map();
    for (const e of entries) {
      const w = countWords(e.cleanedText || e.rawText);
      const dayKey = new Date(e.timestamp).toISOString().slice(0, 10);
      if (dayMap.has(dayKey)) {
        const bucket = dayMap.get(dayKey);
        bucket.words += w;
        bucket.sessions += 1;
      }
      const p = e.provider || "whisper-rs";
      providers.set(p, (providers.get(p) || 0) + 1);
    }

    const maxWords = Math.max(10, ...days.map((d) => d.words));
    const providerList = Array.from(providers.entries())
      .map(([name, count]) => ({
        name,
        count,
        pct: totalSessions ? Math.round((count / totalSessions) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count);

    return {
      totalSessions,
      injectedCount,
      totalWords,
      totalChars,
      injectionRate,
      days,
      maxWords,
      providerList,
    };
  }, [history]);

  const typingMins = stats.totalWords / Math.max(15, typingWpm);
  const speakingMins = stats.totalWords / speakingWpm;
  const savedMins = Math.max(0, typingMins - speakingMins);
  const speedMultiplier = (speakingWpm / Math.max(15, typingWpm)).toFixed(1);

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-medium tracking-[-0.02em] text-[var(--text)]">Analytics</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Computed locally from your on-device transcription history with zero telemetry
        </p>
      </div>

      {/* Top KPI Cards — pure numbers, no decorative icons */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            label: "Words dictated",
            value: stats.totalWords.toLocaleString(),
            sub: `${stats.totalChars.toLocaleString()} characters`,
          },
          {
            label: "Time saved",
            value: savedMins >= 60 ? `${(savedMins / 60).toFixed(1)}h` : `${savedMins.toFixed(1)}m`,
            sub: `${speedMultiplier}× faster than ${typingWpm} WPM`,
          },
          {
            label: "Sessions",
            value: stats.totalSessions.toLocaleString(),
            sub: `Avg ${stats.totalSessions ? Math.round(stats.totalWords / stats.totalSessions) : 0} words / session`,
          },
          {
            label: "Auto-inject rate",
            value: `${stats.injectionRate}%`,
            sub: `${stats.injectedCount} pasted directly`,
          },
        ].map((item) => (
          <div key={item.label} className="vani-card p-5">
            <p className="text-xs text-[var(--muted)]">{item.label}</p>
            <p className="mt-2 font-mono text-2xl font-medium tracking-tight text-[var(--text)] tabular-nums">
              {item.value}
            </p>
            <p className="mt-1 text-xs text-[var(--muted)]">{item.sub}</p>
          </div>
        ))}
      </div>

      {/* 7-Day Activity Chart + Speed Comparison */}
      <div className="grid gap-4 lg:grid-cols-12">
        <div className="vani-card p-5 lg:col-span-7 flex flex-col justify-between gap-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-medium text-[var(--text)]">7-day dictation volume</h2>
              <p className="mt-0.5 text-xs text-[var(--muted)]">Hover a day to inspect word count and sessions</p>
            </div>
            {hoveredDay ? (
              <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-2.5 py-1 font-mono text-xs tabular-nums">
                <span className="text-[var(--text)]">{hoveredDay.fullDate}</span>{" "}
                <span className="text-[var(--brand)]">{hoveredDay.words} words</span>{" "}
                <span className="text-[var(--muted)]">({hoveredDay.sessions})</span>
              </div>
            ) : (
              <span className="font-mono text-xs text-[var(--muted)]">Last 7 days</span>
            )}
          </div>

          <div className="grid grid-cols-7 items-end gap-3 pt-4">
            {stats.days.map((day) => {
              const barPx = day.words > 0 ? Math.max(12, Math.round((day.words / stats.maxWords) * 140)) : 4;
              const isHovered = hoveredDay?.key === day.key;
              const highlight = day.words > 0 && (isHovered || day.isToday);
              return (
                <div
                  key={day.key}
                  onMouseEnter={() => setHoveredDay(day)}
                  onMouseLeave={() => setHoveredDay(null)}
                  className="flex flex-col items-center justify-end gap-2 cursor-pointer"
                >
                  <span className="h-4 font-mono text-[11px] text-[var(--muted)] tabular-nums">
                    {day.words > 0 ? day.words : ""}
                  </span>
                  <div className="flex h-36 w-full items-end">
                    <div
                      className="w-full rounded-t-md transition-colors duration-150"
                      style={{
                        height: `${barPx}px`,
                        background:
                          day.words === 0
                            ? "var(--border)"
                            : highlight
                            ? "var(--brand)"
                            : "var(--border-strong)",
                      }}
                    />
                  </div>
                  <span className="font-mono text-[11px] text-[var(--muted)]">{day.label}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Speed Savings Calculator */}
        <div className="vani-card p-5 lg:col-span-5 flex flex-col justify-between gap-4">
          <div>
            <h2 className="text-sm font-medium text-[var(--text)]">Voice vs typing speed</h2>
            <p className="mt-0.5 text-xs text-[var(--muted)]">
              Adjust your typing speed to compare against 148 WPM speech
            </p>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-[var(--muted)]">Your typing speed</span>
                <span className="font-mono text-[var(--text)] tabular-nums">{typingWpm} WPM</span>
              </div>
              <input
                type="range"
                min="25"
                max="110"
                step="5"
                value={typingWpm}
                onChange={(e) => setTypingWpm(Number(e.target.value))}
                className="vani-range"
              />
            </div>

            <div className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--bg-app)] p-3.5 text-xs">
              <div>
                <div className="flex justify-between">
                  <span className="text-[var(--text)]">VANI voice ({speakingWpm} WPM)</span>
                  <span className="font-mono text-[var(--brand)] tabular-nums">{speakingMins.toFixed(1)} min</span>
                </div>
                <div className="mt-1.5 h-1.5 w-full rounded-full bg-[var(--bg-elevated)]">
                  <div
                    className="h-full rounded-full bg-[var(--brand)]"
                    style={{ width: `${Math.min(100, Math.round((speakingMins / Math.max(0.01, typingMins)) * 100))}%` }}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between">
                  <span className="text-[var(--muted)]">Keyboard ({typingWpm} WPM)</span>
                  <span className="font-mono text-[var(--muted)] tabular-nums">{typingMins.toFixed(1)} min</span>
                </div>
                <div className="mt-1.5 h-1.5 w-full rounded-full bg-[var(--bg-elevated)]">
                  <div className="h-full w-full rounded-full bg-[var(--border-strong)]" />
                </div>
              </div>
            </div>
          </div>

          <p className="font-mono text-xs text-[var(--text-soft)] tabular-nums">
            {speedMultiplier}× faster than typing at {typingWpm} WPM
          </p>
        </div>
      </div>

      {/* Engine / Provider Distribution */}
      <div className="vani-card p-5">
        <h2 className="text-sm font-medium text-[var(--text)]">Model and engine breakdown</h2>

        {stats.providerList.length === 0 ? (
          <p className="mt-3 text-xs text-[var(--muted)]">No sessions recorded yet</p>
        ) : (
          <div className="mt-4 space-y-3">
            {stats.providerList.map((p, idx) => (
              <div key={p.name} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-mono text-[var(--text)]">{p.name}</span>
                  <span className="font-mono text-[var(--muted)] tabular-nums">
                    {p.count} session{p.count === 1 ? "" : "s"} · {p.pct}%
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--bg-elevated)]">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${p.pct}%`,
                      background: idx === 0 ? "var(--brand)" : "var(--border-strong)",
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

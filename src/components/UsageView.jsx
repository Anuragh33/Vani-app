import { useMemo, useState } from "react";
import { Clock, MessageSquareText, Zap, CheckCircle2, TrendingUp, Cpu } from "lucide-react";

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

    // 7-day rolling buckets
    const days = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      days.push({
        key,
        label: d.toLocaleDateString(undefined, { weekday: "short" }),
        fullDate: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
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
        <h1 className="text-2xl font-bold tracking-tight text-[var(--text)]">Productivity &amp; Analytics</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Computed 100% locally from your on-device transcription history — zero telemetry.
        </p>
      </div>

      {/* Top KPI Cards */}
      <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            label: "Words Dictated",
            value: stats.totalWords.toLocaleString(),
            sub: `${stats.totalChars.toLocaleString()} characters`,
            icon: MessageSquareText,
            accent: "text-[var(--brand)]",
          },
          {
            label: "Time Saved",
            value: savedMins >= 60 ? `${(savedMins / 60).toFixed(1)} hr` : `${savedMins.toFixed(1)} min`,
            sub: `${speedMultiplier}× faster than ${typingWpm} WPM`,
            icon: Clock,
            accent: "text-[var(--emerald)]",
          },
          {
            label: "Total Sessions",
            value: stats.totalSessions.toLocaleString(),
            sub: `Avg ${stats.totalSessions ? Math.round(stats.totalWords / stats.totalSessions) : 0} words / session`,
            icon: Zap,
            accent: "text-[var(--violet)]",
          },
          {
            label: "Auto-Inject Rate",
            value: `${stats.injectionRate}%`,
            sub: `${stats.injectedCount} pasted directly`,
            icon: CheckCircle2,
            accent: "text-sky-400",
          },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.label} className="vani-card p-4">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]">{item.label}</p>
                <Icon className={`h-4 w-4 ${item.accent}`} />
              </div>
              <p className="mt-2 text-2xl font-bold tracking-tight text-[var(--text)] tabular-nums">{item.value}</p>
              <p className="mt-0.5 text-xs text-[var(--muted)]">{item.sub}</p>
            </div>
          );
        })}
      </div>

      {/* Interactive 7-Day Activity Chart + Speed Comparison */}
      <div className="grid gap-4 lg:grid-cols-12">
        <div className="vani-card p-5 lg:col-span-7 flex flex-col justify-between gap-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-[var(--brand)]" />
                <h2 className="text-sm font-semibold text-[var(--text)]">7-Day Dictation Volume</h2>
              </div>
              <p className="mt-0.5 text-xs text-[var(--muted)]">Hover any day to inspect words and sessions.</p>
            </div>
            {hoveredDay ? (
              <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-2.5 py-1 text-xs">
                <span className="font-semibold text-[var(--text)]">{hoveredDay.fullDate}:</span>{" "}
                <span className="text-[var(--brand)]">{hoveredDay.words} words</span>{" "}
                <span className="text-[var(--muted)]">({hoveredDay.sessions} runs)</span>
              </div>
            ) : (
              <span className="text-xs text-[var(--muted)]">Last 7 days</span>
            )}
          </div>

          <div className="grid grid-cols-7 items-end gap-3 pt-4">
            {stats.days.map((day) => {
              const barPx = day.words > 0 ? Math.max(16, Math.round((day.words / stats.maxWords) * 124)) : 6;
              const isHovered = hoveredDay?.key === day.key;
              return (
                <div
                  key={day.key}
                  onMouseEnter={() => setHoveredDay(day)}
                  onMouseLeave={() => setHoveredDay(null)}
                  className="flex flex-col items-center justify-end gap-2 cursor-pointer"
                >
                  <span className="h-4 font-mono text-[10px] text-[var(--muted)] tabular-nums">
                    {day.words > 0 ? day.words : ""}
                  </span>
                  <div className="flex h-32 w-full items-end">
                    <div
                      className="w-full rounded-t-lg transition-all duration-200"
                      style={{
                        height: `${barPx}px`,
                        background:
                          day.words > 0
                            ? isHovered
                              ? "var(--brand)"
                              : "linear-gradient(180deg, var(--brand), var(--brand-3))"
                            : "var(--border-strong)",
                        boxShadow:
                          day.words > 0 && isHovered
                            ? "0 0 18px color-mix(in srgb, var(--brand) 48%, transparent)"
                            : "none",
                      }}
                    />
                  </div>
                  <span className="text-[11px] font-medium text-[var(--muted)]">{day.label}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Interactive Speed Savings Calculator */}
        <div className="vani-card p-5 lg:col-span-5 flex flex-col justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-[var(--text)]">Voice vs Typing Speed</h2>
            <p className="mt-0.5 text-xs text-[var(--muted)]">
              Adjust your typical typing speed to estimate real time saved by dictating.
            </p>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-[var(--muted)]">Your typing speed</span>
                <span className="font-mono font-semibold text-[var(--text)]">{typingWpm} WPM</span>
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

            <div className="space-y-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg-app)] p-3.5 text-xs">
              <div>
                <div className="flex justify-between">
                  <span className="text-[var(--text)] font-medium">VANI Voice (~{speakingWpm} WPM)</span>
                  <span className="font-mono text-[var(--brand)]">{speakingMins.toFixed(1)} min</span>
                </div>
                <div className="mt-1.5 h-2 w-full rounded-full bg-[var(--bg-elevated)]">
                  <div
                    className="h-full rounded-full bg-[var(--brand)]"
                    style={{ width: `${Math.min(100, Math.round((speakingMins / Math.max(0.01, typingMins)) * 100))}%` }}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between">
                  <span className="text-[var(--muted)]">Keyboard Typing ({typingWpm} WPM)</span>
                  <span className="font-mono text-[var(--muted)]">{typingMins.toFixed(1)} min</span>
                </div>
                <div className="mt-1.5 h-2 w-full rounded-full bg-[var(--bg-elevated)]">
                  <div className="h-full w-full rounded-full bg-[var(--border-strong)]" />
                </div>
              </div>
            </div>
          </div>

          <p className="text-xs text-[var(--emerald)] font-medium">
            Speaking with VANI is ~{speedMultiplier}× faster than typing at {typingWpm} WPM.
          </p>
        </div>
      </div>

      {/* Engine / Provider Distribution */}
      <div className="vani-card p-5">
        <div className="flex items-center gap-2">
          <Cpu className="h-4 w-4 text-[var(--brand)]" />
          <h2 className="text-sm font-semibold text-[var(--text)]">Model &amp; Engine Breakdown</h2>
        </div>

        {stats.providerList.length === 0 ? (
          <p className="mt-3 text-xs text-[var(--muted)]">No sessions recorded yet.</p>
        ) : (
          <div className="mt-4 space-y-3">
            {stats.providerList.map((p) => (
              <div key={p.name} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-mono text-[var(--text)]">{p.name}</span>
                  <span className="text-[var(--muted)] tabular-nums">
                    {p.count} session{p.count === 1 ? "" : "s"} ({p.pct}%)
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--bg-elevated)]">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[var(--brand)] to-[var(--brand-3)]"
                    style={{ width: `${p.pct}%` }}
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

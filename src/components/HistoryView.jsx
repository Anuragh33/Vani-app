import { useMemo, useState } from "react";
import {
  Search,
  Copy,
  Check,
  FilePlus2,
  Trash2,
  Sparkles,
  CornerDownLeft,
  Clock,
  Diff,
} from "lucide-react";

function countWords(text) {
  return (text || "").trim().split(/\s+/).filter(Boolean).length;
}

function getDateBucket(iso) {
  const d = new Date(iso);
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startYesterday = startToday - 86_400_000;
  const ts = d.getTime();
  if (ts >= startToday) return "Today";
  if (ts >= startYesterday) return "Yesterday";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function HistoryView({ history, onClear, onSaveAsNote, onReinject, onNotify }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all"); // all | local | cloud | injected | cleaned
  const [rawMap, setRawMap] = useState({});
  const [copiedId, setCopiedId] = useState(null);
  const [confirmClear, setConfirmClear] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (history || []).filter((entry) => {
      const text = `${entry.cleanedText || ""}\n${entry.rawText || ""}\n${entry.provider || ""}`.toLowerCase();
      if (q && !text.includes(q)) return false;
      if (filter === "local" && (entry.provider || "").includes("openai")) return false;
      if (filter === "cloud" && !(entry.provider || "").includes("openai")) return false;
      if (filter === "injected" && !entry.injected) return false;
      if (filter === "cleaned" && entry.rawText === entry.cleanedText) return false;
      return true;
    });
  }, [history, query, filter]);

  const grouped = useMemo(() => {
    const map = new Map();
    for (const item of filtered) {
      const bucket = getDateBucket(item.timestamp);
      if (!map.has(bucket)) map.set(bucket, []);
      map.get(bucket).push(item);
    }
    return Array.from(map.entries());
  }, [filtered]);

  const copyText = async (id, text) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      onNotify?.("Copied to clipboard");
      setTimeout(() => setCopiedId((curr) => (curr === id ? null : curr)), 1600);
    } catch {
      onNotify?.("Clipboard unavailable", "error");
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text)]">Transcription History</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Every local dictation is searchable, diffable against raw Whisper output, and stored only on this Mac.
          </p>
        </div>

        {history.length > 0 && (
          <div className="flex items-center gap-2">
            {confirmClear ? (
              <>
                <button
                  type="button"
                  onClick={() => setConfirmClear(false)}
                  className="vani-btn-secondary rounded-xl px-3 py-1.5 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onClear();
                    setConfirmClear(false);
                    onNotify?.("Cleared transcription history");
                  }}
                  className="rounded-xl border border-red-500/40 bg-[var(--danger-soft)] px-3 py-1.5 text-xs font-semibold text-[var(--danger)] hover:brightness-110"
                >
                  Confirm Clear ({history.length})
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmClear(true)}
                className="vani-btn-secondary inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold text-[var(--muted)] hover:text-[var(--danger)]"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Clear all
              </button>
            )}
          </div>
        )}
      </div>

      {/* Search & Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search transcripts, phrases, or models…"
            className="vani-input pl-9"
          />
        </div>

        <div className="flex items-center gap-1 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-1">
          {[
            ["all", "All"],
            ["local", "Local"],
            ["cleaned", "Cleaned"],
            ["injected", "Injected"],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                filter === key
                  ? "bg-[var(--brand-soft)] text-[var(--brand)]"
                  : "text-[var(--muted)] hover:text-[var(--text)]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <span className="text-xs text-[var(--muted)] tabular-nums">
          {filtered.length} / {history.length}
        </span>
      </div>

      {/* Grouped Transcripts */}
      {grouped.length === 0 ? (
        <div className="vani-card flex flex-col items-center justify-center py-14 text-center">
          <Clock className="h-8 w-8 text-[var(--muted-strong)]" />
          <p className="mt-3 text-sm font-medium text-[var(--text)]">
            {history.length === 0 ? "No dictations yet" : "No matching transcripts"}
          </p>
          <p className="mt-1 text-xs text-[var(--muted)]">
            {history.length === 0
              ? "Hold ⌥ Option anywhere or try the Voice Studio playground."
              : "Try clearing your search or switching filters."}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map(([bucket, items]) => (
            <div key={bucket} className="space-y-2.5">
              <div className="flex items-center gap-3">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]">{bucket}</p>
                <div className="h-px flex-1 bg-[var(--border)]" />
                <span className="text-[11px] text-[var(--muted-strong)]">{items.length}</span>
              </div>

              <div className="space-y-2.5">
                {items.map((entry) => {
                  const hasDiff = entry.rawText && entry.cleanedText && entry.rawText !== entry.cleanedText;
                  const showingRaw = Boolean(rawMap[entry.id]);
                  const body = showingRaw ? entry.rawText : entry.cleanedText || entry.rawText;
                  const words = countWords(body);

                  return (
                    <article
                      key={entry.id}
                      className="vani-card p-4 transition hover:border-[var(--border-strong)]"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2 text-[11px]">
                          <span className="font-mono text-[var(--muted)]">
                            {new Date(entry.timestamp).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                          <span className="rounded-md bg-[var(--brand-soft)] px-2 py-0.5 font-mono text-[10px] font-medium text-[var(--brand)]">
                            {entry.provider}
                          </span>
                          {entry.injected && (
                            <span className="rounded-md bg-[var(--emerald-soft)] px-2 py-0.5 text-[10px] font-medium text-[var(--emerald)]">
                              Injected
                            </span>
                          )}
                          {hasDiff && (
                            <span className="inline-flex items-center gap-1 rounded-md bg-[var(--violet-soft)] px-2 py-0.5 text-[10px] font-medium text-[var(--violet)]">
                              <Sparkles className="h-2.5 w-2.5" /> Polished
                            </span>
                          )}
                          <span className="text-[var(--muted-strong)]">{words} words</span>
                        </div>

                        <div className="flex items-center gap-1.5">
                          {hasDiff && (
                            <button
                              type="button"
                              onClick={() =>
                                setRawMap((prev) => ({ ...prev, [entry.id]: !prev[entry.id] }))
                              }
                              className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-medium transition ${
                                showingRaw
                                  ? "border-[var(--brand)]/40 bg-[var(--brand-soft)] text-[var(--brand)]"
                                  : "border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)]"
                              }`}
                            >
                              <Diff className="h-3 w-3" />
                              {showingRaw ? "Raw" : "Cleaned"}
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => copyText(entry.id, body)}
                            className="vani-btn-secondary inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium"
                          >
                            {copiedId === entry.id ? (
                              <Check className="h-3 w-3 text-[var(--emerald)]" />
                            ) : (
                              <Copy className="h-3 w-3" />
                            )}
                            {copiedId === entry.id ? "Copied" : "Copy"}
                          </button>

                          <button
                            type="button"
                            onClick={() => onSaveAsNote?.(body)}
                            className="vani-btn-secondary inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium"
                            title="Create a Note from this transcript"
                          >
                            <FilePlus2 className="h-3 w-3" />
                            Note
                          </button>

                          {onReinject && (
                            <button
                              type="button"
                              onClick={() => onReinject(body)}
                              className="vani-btn-secondary inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium"
                              title="Paste into last active app"
                            >
                              <CornerDownLeft className="h-3 w-3" />
                              Paste
                            </button>
                          )}
                        </div>
                      </div>

                      <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-[var(--text)]">
                        {body}
                      </p>
                    </article>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

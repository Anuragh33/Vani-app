import { useMemo, useState } from "react";
import {
  Search,
  Copy,
  Check,
  FilePlus2,
  Trash2,
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

export default function HistoryView({ history, systemInfo, onClear, onSaveAsNote, onReinject, onNotify }) {
  const isMac = systemInfo ? Boolean(systemInfo.isMac) : true;
  const pushToTalkKey = systemInfo?.pushToTalkKey || (isMac ? "⌥ Option" : "Right Alt");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
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
          <h1 className="text-2xl font-medium tracking-[-0.02em] text-[var(--text)]">History</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Searchable transcripts stored locally on this {isMac ? "Mac" : "PC"}
          </p>
        </div>

        {history.length > 0 && (
          <div className="flex items-center gap-2">
            {confirmClear ? (
              <>
                <button
                  type="button"
                  onClick={() => setConfirmClear(false)}
                  className="vani-btn-secondary h-8 px-3 text-xs"
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
                  className="h-8 rounded-lg border border-[var(--danger)]/40 bg-[var(--danger-soft)] px-3 text-xs font-medium text-[var(--danger)]"
                >
                  Confirm clear ({history.length})
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmClear(true)}
                className="vani-btn-secondary inline-flex h-8 items-center gap-1.5 px-3 text-xs text-[var(--muted)] hover:text-[var(--danger)]"
              >
                <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                Clear all
              </button>
            )}
          </div>
        )}
      </div>

      {/* Search & Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]"
            strokeWidth={1.5}
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search transcripts"
            className="vani-input pl-9"
          />
        </div>

        <div className="flex items-center gap-0.5 rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] p-0.5">
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
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                filter === key
                  ? "bg-[var(--bg-elevated)] text-[var(--text)]"
                  : "text-[var(--muted)] hover:text-[var(--text)]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <span className="font-mono text-xs text-[var(--muted)] tabular-nums">
          {filtered.length} / {history.length}
        </span>
      </div>

      {/* Grouped Transcripts */}
      {grouped.length === 0 ? (
        <div className="vani-card flex flex-col items-center justify-center py-14 text-center">
          <Clock className="h-6 w-6 text-[var(--muted-strong)]" strokeWidth={1.5} />
          <p className="mt-3 text-sm font-medium text-[var(--text)]">
            {history.length === 0 ? "No dictations yet" : "No matching transcripts"}
          </p>
          <p className="mt-1 text-xs text-[var(--muted)]">
            {history.length === 0
              ? `Hold ${pushToTalkKey} anywhere or use VANI Studio`
              : "Clear your search or switch filters"}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map(([bucket, items]) => (
            <div key={bucket} className="space-y-2.5">
              <div className="flex items-center gap-3">
                <p className="text-xs font-medium text-[var(--muted)]">{bucket}</p>
                <div className="h-px flex-1 bg-[var(--border)]" />
                <span className="font-mono text-xs text-[var(--muted-strong)] tabular-nums">
                  {items.length}
                </span>
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
                      className="vani-card p-4 transition-colors hover:border-[var(--border-strong)]"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] text-[var(--muted)] tabular-nums">
                          <span>
                            {new Date(entry.timestamp).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                          <span>·</span>
                          <span className="text-[var(--text-soft)]">{entry.provider}</span>
                          {entry.injected && (
                            <>
                              <span>·</span>
                              <span className="text-[var(--emerald)]">Injected</span>
                            </>
                          )}
                          {hasDiff && (
                            <>
                              <span>·</span>
                              <span>Polished</span>
                            </>
                          )}
                          <span>·</span>
                          <span>{words} words</span>
                        </div>

                        <div className="flex items-center gap-1.5">
                          {hasDiff && (
                            <button
                              type="button"
                              onClick={() =>
                                setRawMap((prev) => ({ ...prev, [entry.id]: !prev[entry.id] }))
                              }
                              className={`inline-flex h-7 items-center gap-1 rounded-lg border px-2 text-xs font-medium transition-colors ${
                                showingRaw
                                  ? "border-[var(--border-strong)] bg-[var(--bg-elevated)] text-[var(--text)]"
                                  : "border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)]"
                              }`}
                            >
                              <Diff className="h-3.5 w-3.5" strokeWidth={1.5} />
                              {showingRaw ? "Raw" : "Cleaned"}
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => copyText(entry.id, body)}
                            className="vani-btn-secondary inline-flex h-7 items-center gap-1 px-2 text-xs"
                          >
                            {copiedId === entry.id ? (
                              <Check className="h-3.5 w-3.5 text-[var(--emerald)]" strokeWidth={1.5} />
                            ) : (
                              <Copy className="h-3.5 w-3.5" strokeWidth={1.5} />
                            )}
                            {copiedId === entry.id ? "Copied" : "Copy"}
                          </button>

                          <button
                            type="button"
                            onClick={() => onSaveAsNote?.(body)}
                            className="vani-btn-secondary inline-flex h-7 items-center gap-1 px-2 text-xs"
                            title="Create a note from this transcript"
                          >
                            <FilePlus2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                            Note
                          </button>

                          {onReinject && (
                            <button
                              type="button"
                              onClick={() => onReinject(body)}
                              className="vani-btn-secondary inline-flex h-7 items-center gap-1 px-2 text-xs"
                              title="Paste into last active app"
                            >
                              <CornerDownLeft className="h-3.5 w-3.5" strokeWidth={1.5} />
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

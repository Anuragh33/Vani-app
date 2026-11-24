import { useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import {
  Plus,
  Search,
  Mic,
  Square,
  Trash2,
  Download,
  Copy,
  Check,
  Columns2,
  Edit3,
  Eye,
  Heading1,
  Bold,
  List,
  CheckSquare,
  Code,
} from "lucide-react";
import useRecorder from "../hooks/useRecorder";
import { LiveWaveform } from "./VaniLogo";

function createEmptyNote() {
  return {
    id: `note-${Date.now()}`,
    title: "Untitled note",
    content: "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function getTitleFromContent(content) {
  const firstLine = (content || "")
    .split("\n")
    .find((line) => line.trim())
    ?.replace(/^#+\s*/, "")
    .trim();
  return firstLine ? firstLine.slice(0, 56) : "Untitled note";
}

function countWords(text) {
  return (text || "").trim().split(/\s+/).filter(Boolean).length;
}

export default function VaniNotes({ notes, onSaveNote, onDeleteNote, onExportNote, onNotify }) {
  const [search, setSearch] = useState("");
  const [activeId, setActiveId] = useState(notes[0]?.id || null);
  const [viewMode, setViewMode] = useState("split"); // edit | split | preview
  const [copied, setCopied] = useState(false);
  const [dictating, setDictating] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [simMic, setSimMic] = useState(false);

  const filteredNotes = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return notes;
    return notes.filter((note) => `${note.title}\n${note.content}`.toLowerCase().includes(q));
  }, [notes, search]);

  const activeNote =
    filteredNotes.find((note) => note.id === activeId) ||
    notes.find((note) => note.id === activeId) ||
    filteredNotes[0] ||
    notes[0] ||
    null;

  const saveCurrentNote = (nextContent) => {
    const target = activeNote || createEmptyNote();
    const nextNote = {
      ...target,
      content: nextContent,
      title: getTitleFromContent(nextContent),
    };
    setActiveId(nextNote.id);
    onSaveNote(nextNote);
  };

  const appendDictation = async (wavBuffer) => {
    setDictating(false);
    setSimMic(false);
    setTranscribing(true);
    try {
      const r = await window.vani?.dictationComplete?.({ wavBuffer: wavBuffer || new ArrayBuffer(44) });
      if (r?.ok && r.text) {
        const target = activeNote || createEmptyNote();
        const sep = target.content.trim() ? "\n\n" : "";
        saveCurrentNote(`${target.content}${sep}${r.text}`);
        onNotify?.("Appended voice dictation to note");
      } else if (r?.error) {
        onNotify?.(r.error, "error");
      }
    } catch (e) {
      onNotify?.(e.message || "Voice note failed", "error");
    } finally {
      setTranscribing(false);
    }
  };

  const recorder = useRecorder({
    enabledSilenceDetection: false,
    onError: (msg) => {
      if (window.vani?.isPreview) {
        setSimMic(true);
        return;
      }
      setDictating(false);
      onNotify?.(msg || "Mic unavailable", "error");
    },
    onRecordingComplete: appendDictation,
  });

  const toggleVoiceDictation = () => {
    if (dictating) {
      if (simMic || !recorder.isRecording) {
        appendDictation(new ArrayBuffer(44));
      } else {
        recorder.stop();
      }
    } else {
      if (!activeNote) {
        const fresh = createEmptyNote();
        setActiveId(fresh.id);
        onSaveNote(fresh);
      }
      setDictating(true);
      if (window.vani?.isPreview && !navigator.mediaDevices?.getUserMedia) {
        setSimMic(true);
        return;
      }
      recorder.start();
    }
  };

  const createNote = () => {
    const note = createEmptyNote();
    setActiveId(note.id);
    onSaveNote(note);
  };

  const insertSnippet = (snippet) => {
    const current = activeNote?.content || "";
    const prefix = current && !current.endsWith("\n") ? "\n" : "";
    saveCurrentNote(`${current}${prefix}${snippet}`);
  };

  const handleCopy = async () => {
    if (!activeNote?.content) return;
    await navigator.clipboard.writeText(activeNote.content);
    setCopied(true);
    onNotify?.("Copied note markdown");
    setTimeout(() => setCopied(false), 1600);
  };

  const handleExport = async (format) => {
    if (!activeNote) return;
    const res = await onExportNote?.({ ...activeNote, format });
    if (res?.ok) {
      onNotify?.(`Exported to ${res.path || "Downloads"}`);
    } else {
      onNotify?.(`Exported .${format} to Downloads`);
    }
  };

  const words = countWords(activeNote?.content);

  return (
    <div className="grid h-full min-h-[580px] gap-4 md:grid-cols-[240px_1fr] animate-fade-in">
      {/* Left Note List Rail */}
      <div className="vani-card flex flex-col overflow-hidden p-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h1 className="text-base font-bold text-[var(--text)]">Voice Notes</h1>
            <p className="text-[11px] text-[var(--muted)]">{notes.length} note{notes.length === 1 ? "" : "s"}</p>
          </div>
          <button
            type="button"
            onClick={createNote}
            className="vani-btn-primary inline-flex items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-semibold"
          >
            <Plus className="h-3.5 w-3.5" /> New
          </button>
        </div>

        <div className="relative mt-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--muted)]" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search notes…"
            className="vani-input pl-8 text-xs"
          />
        </div>

        <div className="mt-3 flex-1 space-y-2 overflow-y-auto pr-0.5">
          {filteredNotes.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[var(--border)] p-5 text-center text-xs text-[var(--muted)]">
              No notes match. Click <strong>New</strong> or start dictating.
            </div>
          ) : (
            filteredNotes.map((note) => {
              const selected = activeNote?.id === note.id;
              return (
                <div
                  key={note.id}
                  className={`group relative rounded-xl border transition ${
                    selected
                      ? "border-[var(--brand)]/50 bg-[var(--bg-active)]"
                      : "border-[var(--border)] bg-[var(--bg-elevated)] hover:border-[var(--border-strong)]"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setActiveId(note.id)}
                    className="w-full px-3.5 py-2.5 text-left"
                  >
                    <p className="truncate pr-6 text-xs font-semibold text-[var(--text)]">
                      {note.title || "Untitled note"}
                    </p>
                    <p className="mt-0.5 text-[10px] text-[var(--muted)]">
                      {new Date(note.updatedAt || note.createdAt).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      })}{" "}
                      · {countWords(note.content)} words
                    </p>
                    <p className="mt-1.5 line-clamp-2 text-[11px] leading-relaxed text-[var(--muted)]">
                      {note.content || "Empty note"}
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (activeId === note.id) setActiveId(null);
                      onDeleteNote(note.id);
                      onNotify?.("Deleted note");
                    }}
                    className="absolute right-2 top-2 hidden h-6 w-6 items-center justify-center rounded-lg text-[var(--muted)] transition hover:bg-[var(--danger-soft)] hover:text-[var(--danger)] group-hover:flex"
                    title="Delete note"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Right Editor & Preview Pane */}
      <div className="vani-card flex flex-col overflow-hidden p-5">
        {activeNote ? (
          <>
            {/* Top Note Action Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] pb-3.5">
              <div className="min-w-0">
                <h2 className="truncate text-base font-semibold text-[var(--text)]">
                  {activeNote.title || "Untitled note"}
                </h2>
                <p className="text-[11px] text-[var(--muted)]">
                  {words} words · ~{Math.max(1, Math.ceil(words / 200))} min read
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {/* Inline Voice Dictation Button */}
                <button
                  type="button"
                  onClick={toggleVoiceDictation}
                  disabled={transcribing}
                  className={`inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-semibold transition ${
                    dictating
                      ? "border border-red-500/40 bg-red-500/15 text-red-400"
                      : "vani-btn-primary"
                  }`}
                >
                  {dictating ? <Square className="h-3 w-3 fill-current" /> : <Mic className="h-3.5 w-3.5" />}
                  {transcribing ? "Transcribing…" : dictating ? "Stop" : "Dictate"}
                </button>

                {/* View mode switcher */}
                <div className="flex items-center rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-0.5">
                  {[
                    ["edit", Edit3, "Write"],
                    ["split", Columns2, "Split"],
                    ["preview", Eye, "Preview"],
                  ].map(([mode, Icon, label]) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setViewMode(mode)}
                      className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium transition ${
                        viewMode === mode
                          ? "bg-[var(--brand-soft)] text-[var(--brand)]"
                          : "text-[var(--muted)] hover:text-[var(--text)]"
                      }`}
                    >
                      <Icon className="h-3 w-3" />
                      {label}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={handleCopy}
                  className="vani-btn-secondary inline-flex items-center gap-1 rounded-xl px-2 py-1.5 text-xs font-medium"
                  title="Copy markdown"
                >
                  {copied ? <Check className="h-3.5 w-3.5 text-[var(--emerald)]" /> : <Copy className="h-3.5 w-3.5" />}
                </button>

                <button
                  type="button"
                  onClick={() => handleExport("md")}
                  className="vani-btn-secondary inline-flex items-center gap-1 rounded-xl px-2 py-1.5 text-xs font-medium"
                  title="Export Markdown to Downloads"
                >
                  <Download className="h-3.5 w-3.5" /> .md
                </button>
              </div>
            </div>

            {/* Live Dictation Strip when recording */}
            {dictating && (
              <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-[var(--brand)]/35 bg-[var(--bg-app)] px-4 py-2.5 animate-scale-in">
                <div className="flex items-center gap-2.5">
                  <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-pink-500" />
                  <span className="text-xs font-medium text-[var(--text)]">Listening for note dictation…</span>
                </div>
                <LiveWaveform levels={recorder.levels} active simulate={simMic} width={160} height={26} />
              </div>
            )}

            {/* Quick Formatting Bar */}
            {viewMode !== "preview" && (
              <div className="mt-3 flex flex-wrap items-center gap-1">
                {[
                  [Heading1, "# Heading ", "Heading"],
                  [Bold, "**bold text**", "Bold"],
                  [List, "- ", "Bullet list"],
                  [CheckSquare, "- [ ] ", "Checklist"],
                  [Code, "`code`", "Inline code"],
                ].map(([Icon, snippet, title]) => (
                  <button
                    key={title}
                    type="button"
                    onClick={() => insertSnippet(snippet)}
                    title={title}
                    className="rounded-lg border border-transparent px-2 py-1 text-[var(--muted)] transition hover:border-[var(--border)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]"
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </button>
                ))}
              </div>
            )}

            {/* Editor & Markdown Preview */}
            <div
              className={`mt-3 grid min-h-[420px] flex-1 gap-4 ${
                viewMode === "split" ? "lg:grid-cols-2" : "grid-cols-1"
              }`}
            >
              {viewMode !== "preview" && (
                <textarea
                  value={activeNote.content}
                  onChange={(e) => saveCurrentNote(e.target.value)}
                  className="h-full min-h-[400px] w-full resize-none rounded-2xl border border-[var(--border)] bg-[var(--bg-app)] p-4 font-mono text-[13px] leading-7 text-[var(--text)] outline-none transition focus:border-[var(--brand)]"
                  placeholder="Start writing in Markdown, click Dictate above, or hold ⌥ Option anywhere…"
                />
              )}
              {viewMode !== "edit" && (
                <div className="vani-prose h-full min-h-[400px] overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5">
                  <ReactMarkdown>{activeNote.content || "*Nothing to preview yet.*"}</ReactMarkdown>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
            <p className="text-sm font-medium text-[var(--text)]">Create your first Voice Note</p>
            <p className="max-w-xs text-xs text-[var(--muted)]">
              Speak ideas out loud and organize them with clean Markdown formatting.
            </p>
            <button
              type="button"
              onClick={createNote}
              className="vani-btn-primary inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold"
            >
              <Plus className="h-3.5 w-3.5" /> New Note
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

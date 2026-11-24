import { useMemo, useState } from "react";
import { BookOpen, Plus, X, Zap, Sparkles, ArrowRight, Search } from "lucide-react";

const VOCAB_PACKS = [
  { label: "Apple & macOS", words: ["macOS", "Apple Silicon", "Xcode", "SwiftUI", "Tauri", "CoreAudio"] },
  { label: "AI & Speech", words: ["whisper-rs", "Parakeet", "ONNX", "Anthropic", "Claude", "GGML"] },
  { label: "Dev Stack", words: ["TypeScript", "PostgreSQL", "Kubernetes", "GraphQL", "Tailwind", "Vite"] },
];

function parseVocab(raw) {
  return (raw || "")
    .split(/[\n,]/)
    .map((w) => w.trim())
    .filter(Boolean);
}

export default function DictionaryView({ settings, onSaveSettings, onNotify }) {
  const [wordInput, setWordInput] = useState("");
  const [trigger, setTrigger] = useState("");
  const [expansion, setExpansion] = useState("");
  const [snippetSearch, setSnippetSearch] = useState("");
  const [tester, setTester] = useState("");

  const words = useMemo(() => parseVocab(settings.customVocabulary), [settings.customVocabulary]);
  const snippets = settings.snippets || [];

  const updateWords = (nextWords) => {
    const deduped = Array.from(new Set(nextWords.map((w) => w.trim()).filter(Boolean)));
    onSaveSettings({ customVocabulary: deduped.join(", ") });
  };

  const addWord = () => {
    const parsed = parseVocab(wordInput);
    if (!parsed.length) return;
    updateWords([...words, ...parsed]);
    setWordInput("");
    onNotify?.(`Added ${parsed.length} vocabulary term${parsed.length > 1 ? "s" : ""}`);
  };

  const removeWord = (target) => {
    updateWords(words.filter((w) => w !== target));
  };

  const addPack = (pack) => {
    updateWords([...words, ...pack.words]);
    onNotify?.(`Added ${pack.label} pack to dictionary`);
  };

  const addSnippet = () => {
    const t = trigger.trim();
    const e = expansion.trim();
    if (!t || !e) return;
    const filtered = snippets.filter((s) => s.trigger.toLowerCase() !== t.toLowerCase());
    onSaveSettings({ snippets: [...filtered, { trigger: t, expansion: e }] });
    setTrigger("");
    setExpansion("");
    onNotify?.(`Saved snippet “${t}”`);
  };

  const removeSnippet = (idx) => {
    onSaveSettings({ snippets: snippets.filter((_, i) => i !== idx) });
  };

  const filteredSnippets = useMemo(() => {
    const q = snippetSearch.trim().toLowerCase();
    if (!q) return snippets;
    return snippets.filter(
      (s) => s.trigger.toLowerCase().includes(q) || s.expansion.toLowerCase().includes(q)
    );
  }, [snippets, snippetSearch]);

  const liveExpanded = useMemo(() => {
    if (!tester.trim()) return "";
    let out = tester;
    for (const s of snippets) {
      if (!s.trigger) continue;
      const escaped = s.trigger.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      out = out.replace(new RegExp(`\\b${escaped}\\b`, "gi"), s.expansion);
    }
    return out;
  }, [tester, snippets]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[var(--text)]">Dictionary &amp; Snippets</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Teach VANI your jargon, names, and voice shortcuts so they transcribe accurately on the first try.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-12">
        {/* Custom Vocabulary Card */}
        <div className="vani-card p-5 lg:col-span-6 flex flex-col gap-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--brand-soft)] text-[var(--brand)]">
                <BookOpen className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-[var(--text)]">Personal Dictionary</h2>
                <p className="text-xs text-[var(--muted)]">Passed as Whisper initial prompt ({words.length} terms)</p>
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              value={wordInput}
              onChange={(e) => setWordInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === ",") {
                  e.preventDefault();
                  addWord();
                }
              }}
              placeholder="Add term or comma-separated list (e.g. VANI, CoreML)…"
              className="vani-input flex-1 text-xs"
            />
            <button
              type="button"
              onClick={addWord}
              disabled={!wordInput.trim()}
              className="vani-btn-primary inline-flex items-center gap-1 rounded-xl px-3.5 py-2 text-xs font-semibold"
            >
              <Plus className="h-3.5 w-3.5" /> Add
            </button>
          </div>

          {/* Vocabulary Chips */}
          <div className="min-h-[140px] rounded-xl border border-[var(--border)] bg-[var(--bg-app)] p-3">
            {words.length === 0 ? (
              <p className="py-8 text-center text-xs text-[var(--muted)]">
                No custom terms yet. Add product names, acronyms, or teammate names.
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {words.map((word) => (
                  <span
                    key={word}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-2.5 py-1 text-xs font-medium text-[var(--text)]"
                  >
                    {word}
                    <button
                      type="button"
                      onClick={() => removeWord(word)}
                      className="text-[var(--muted)] transition hover:text-[var(--danger)]"
                      aria-label={`Remove ${word}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Quick Packs */}
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]">Quick Starter Packs</p>
            <div className="flex flex-wrap gap-2">
              {VOCAB_PACKS.map((pack) => (
                <button
                  key={pack.label}
                  type="button"
                  onClick={() => addPack(pack)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-2.5 py-1.5 text-xs font-medium text-[var(--text-soft)] transition hover:border-[var(--brand)]/40 hover:text-[var(--brand)]"
                >
                  <Sparkles className="h-3 w-3" /> + {pack.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Voice Snippets Card */}
        <div className="vani-card p-5 lg:col-span-6 flex flex-col gap-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--violet-soft)] text-[var(--violet)]">
                <Zap className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-[var(--text)]">Voice Snippets</h2>
                <p className="text-xs text-[var(--muted)]">Say a short trigger word to expand full text blocks</p>
              </div>
            </div>
            <span className="rounded-full bg-[var(--bg-elevated)] px-2.5 py-0.5 text-[11px] font-medium text-[var(--muted)]">
              {snippets.length} active
            </span>
          </div>

          {/* Add new snippet */}
          <div className="grid gap-2 sm:grid-cols-[105px_1fr_auto]">
            <input
              type="text"
              value={trigger}
              onChange={(e) => setTrigger(e.target.value)}
              placeholder="Trigger"
              className="vani-input font-mono text-xs"
            />
            <input
              type="text"
              value={expansion}
              onChange={(e) => setExpansion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") addSnippet();
              }}
              placeholder="Expansion text or link…"
              className="vani-input text-xs"
            />
            <button
              type="button"
              onClick={addSnippet}
              disabled={!trigger.trim() || !expansion.trim()}
              className="vani-btn-primary inline-flex items-center justify-center gap-1 rounded-xl px-3.5 py-2 text-xs font-semibold"
            >
              <Plus className="h-3.5 w-3.5" /> Add
            </button>
          </div>

          {/* Search snippets */}
          {snippets.length > 3 && (
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--muted)]" />
              <input
                type="search"
                value={snippetSearch}
                onChange={(e) => setSnippetSearch(e.target.value)}
                placeholder="Filter snippets…"
                className="vani-input pl-8 text-xs"
              />
            </div>
          )}

          {/* Snippet List */}
          <div className="max-h-[210px] space-y-2 overflow-y-auto pr-1">
            {filteredSnippets.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[var(--border)] py-7 text-center text-xs text-[var(--muted)]">
                No snippets yet. Create one like <code className="text-[var(--brand)]">cal</code> → your booking link.
              </div>
            ) : (
              filteredSnippets.map((s, idx) => (
                <div
                  key={`${s.trigger}-${idx}`}
                  className="group flex items-center gap-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2.5"
                >
                  <code className="shrink-0 rounded-md bg-[var(--brand-soft)] px-2 py-0.5 font-mono text-xs font-semibold text-[var(--brand)]">
                    {s.trigger}
                  </code>
                  <ArrowRight className="h-3 w-3 shrink-0 text-[var(--muted)]" />
                  <span className="min-w-0 flex-1 truncate text-xs text-[var(--text)]" title={s.expansion}>
                    {s.expansion}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeSnippet(idx)}
                    className="rounded-md p-1 text-[var(--muted)] transition hover:bg-[var(--danger-soft)] hover:text-[var(--danger)]"
                    aria-label={`Delete snippet ${s.trigger}`}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>

          {/* Live Snippet Expansion Tester */}
          <div className="mt-auto rounded-xl border border-[var(--border)] bg-[var(--bg-app)] p-3 space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">
              Live Expansion Tester
            </p>
            <input
              type="text"
              value={tester}
              onChange={(e) => setTester(e.target.value)}
              placeholder={`Try typing “here is my ${snippets[0]?.trigger || "cal"} link”…`}
              className="vani-input text-xs"
            />
            {tester.trim() && (
              <p className="whitespace-pre-wrap rounded-lg bg-[var(--bg-elevated)] px-3 py-2 text-xs text-[var(--emerald)]">
                {liveExpanded}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

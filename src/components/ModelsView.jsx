import { useMemo, useState } from "react";
import {
  Download,
  Check,
  Trash2,
  FolderOpen,
  Cpu,
  Upload,
  Sparkles,
  Globe,
  Gauge,
  Target,
  X,
} from "lucide-react";

const MODEL_META = {
  "ggml-base.en": { speed: 5, accuracy: 3, recommended: true, note: "Best starter — ultra-fast English dictation" },
  "ggml-base": { speed: 5, accuracy: 3, note: "Fast lightweight multilingual model" },
  "ggml-small.en": { speed: 4, accuracy: 4, note: "Strong everyday English accuracy" },
  "ggml-small": { speed: 4, accuracy: 4, note: "Balanced multilingual speed & quality" },
  "ggml-medium.en": { speed: 3, accuracy: 4, note: "High-precision English for technical speech" },
  "ggml-medium": { speed: 3, accuracy: 4, note: "High-precision multilingual transcription" },
  "ggml-large-v3-turbo": { speed: 4, accuracy: 5, recommended: true, note: "Best quality-to-speed ratio on Apple Silicon" },
  "ggml-large-v3": { speed: 2, accuracy: 5, note: "Maximum transcription fidelity" },
  "parakeet-tdt-0.6b-v2": { speed: 5, accuracy: 5, note: "NVIDIA TDT ONNX — blazing fast English ASR" },
  "parakeet-tdt-1.1b-v2": { speed: 4, accuracy: 5, note: "NVIDIA flagship 1.1B English ONNX model" },
};

function formatBytes(n) {
  if (!n || n < 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 100 ? 0 : 1)} ${units[i]}`;
}

function MeterBar({ level, max = 5, colorClass = "bg-[var(--brand)]" }) {
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: max }, (_, idx) => (
        <span
          key={idx}
          className={`h-1.5 w-3 rounded-full transition-colors ${
            idx < level ? colorClass : "bg-[var(--border-strong)]"
          }`}
        />
      ))}
    </div>
  );
}

export default function ModelsView({
  models,
  downloads,
  activeModel,
  settings,
  appleAi,
  onSaveSettings,
  onDownload,
  onCancel,
  onDelete,
  onSetActive,
  onImport,
  onOpenModelsDir,
  onNotify,
  error,
}) {
  const [filter, setFilter] = useState("all"); // all | installed | whisper | parakeet | multilingual
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  const installedModels = useMemo(() => (models || []).filter((m) => m.installed), [models]);
  const usingAppleStt = settings?.transcriptionProvider === "apple";
  const usingApplePolish = settings?.cleanupProvider === "apple";

  const filteredModels = useMemo(() => {
    return (models || []).filter((m) => {
      if (filter === "installed") return m.installed;
      if (filter === "whisper") return m.backend !== "parakeet";
      if (filter === "parakeet") return m.backend === "parakeet";
      if (filter === "multilingual") return m.multilingual;
      return true;
    });
  }, [models, filter]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text)]">AI &amp; Speech Models</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Use macOS’s built-in <strong>Apple On-Device AI</strong> with zero downloads — or run open-source{" "}
            <code className="font-mono text-xs text-[var(--brand)]">Whisper (Metal GPU)</code> and{" "}
            <code className="font-mono text-xs text-[var(--violet)]">NVIDIA Parakeet ONNX</code> locally.
          </p>
        </div>

        <button
          type="button"
          onClick={onOpenModelsDir}
          className="vani-btn-secondary inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold"
        >
          <FolderOpen className="h-3.5 w-3.5" />
          Open Models Folder
        </button>
      </div>

      {/* Built-in Apple On-Device AI Section */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--brand)]">
            Apple On-Device AI · Built into macOS (Zero Downloads)
          </p>
          {appleAi?.macosVersion && (
            <span className="font-mono text-[11px] text-[var(--muted)]">macOS {appleAi.macosVersion}</span>
          )}
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {/* Apple SpeechAnalyzer Card */}
          <div
            className={`vani-card p-4 transition ${
              usingAppleStt ? "border-[var(--brand)] shadow-[0_0_0_1px_var(--brand-ring)]" : ""
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--brand-soft)] text-base font-bold text-[var(--brand)]">
                  
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="text-sm font-semibold text-[var(--text)]">Apple SpeechAnalyzer</p>
                    {usingAppleStt && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[var(--emerald-soft)] px-2 py-0.5 text-[10px] font-semibold uppercase text-[var(--emerald)]">
                        <Check className="h-2.5 w-2.5" /> Active STT
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    Zero-download on-device macOS speech recognition with Neural Engine acceleration.
                  </p>
                </div>
              </div>
            </div>
            <div className="mt-3.5 flex items-center justify-between border-t border-[var(--border)] pt-3">
              <span
                className={`text-[11px] font-medium ${
                  appleAi?.speechAnalyzerAvailable ? "text-[var(--emerald)]" : "text-[var(--amber)]"
                }`}
              >
                {appleAi?.speechAnalyzerAvailable ? "Available on this Mac" : "Requires macOS 26+"}
              </span>
              {usingAppleStt ? (
                <span className="text-xs font-semibold text-[var(--brand)]">Selected</span>
              ) : (
                <button
                  type="button"
                  disabled={!appleAi?.speechAnalyzerAvailable}
                  onClick={() => {
                    onSaveSettings?.({ transcriptionProvider: "apple" });
                    onNotify?.("Switched Speech-to-Text to Apple On-Device SpeechAnalyzer");
                  }}
                  className="vani-btn-primary rounded-xl px-3 py-1.5 text-xs font-semibold"
                >
                  Use Apple Speech
                </button>
              )}
            </div>
          </div>

          {/* Apple FoundationModels Card */}
          <div
            className={`vani-card p-4 transition ${
              usingApplePolish ? "border-[var(--violet)] shadow-[0_0_0_1px_rgba(167,139,250,0.3)]" : ""
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--violet-soft)] text-[var(--violet)]">
                  <Sparkles className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="text-sm font-semibold text-[var(--text)]">Apple Foundation Model</p>
                    {usingApplePolish && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[var(--emerald-soft)] px-2 py-0.5 text-[10px] font-semibold uppercase text-[var(--emerald)]">
                        <Check className="h-2.5 w-2.5" /> Active Polish
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    On-device Apple Intelligence LLM for Email, Slack, Notes &amp; Code cleanup — zero API keys.
                  </p>
                </div>
              </div>
            </div>
            <div className="mt-3.5 flex items-center justify-between border-t border-[var(--border)] pt-3">
              <span
                className={`text-[11px] font-medium ${
                  appleAi?.foundationModelAvailable ? "text-[var(--emerald)]" : "text-[var(--amber)]"
                }`}
              >
                {appleAi?.foundationModelAvailable
                  ? "Ready on this MacBook"
                  : appleAi?.foundationModelReason || "Requires Apple Intelligence"}
              </span>
              {usingApplePolish ? (
                <button
                  type="button"
                  onClick={() => {
                    onSaveSettings?.({ cleanupProvider: "none" });
                    onNotify?.("Switched text cleanup to Local Rules Only");
                  }}
                  className="vani-btn-secondary rounded-xl px-3 py-1.5 text-xs font-semibold"
                >
                  Disable
                </button>
              ) : (
                <button
                  type="button"
                  disabled={!appleAi?.foundationModelAvailable}
                  onClick={() => {
                    onSaveSettings?.({ cleanupProvider: "apple" });
                    onNotify?.("Enabled Apple Foundation Model on-device polish");
                  }}
                  className="vani-btn-primary rounded-xl px-3 py-1.5 text-xs font-semibold"
                >
                  Use Apple LLM
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Summary Strip for Open-Source Models */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="vani-card p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]">Active Speech Engine</p>
          <p className="mt-1.5 truncate text-sm font-semibold text-[var(--text)]">
            {usingAppleStt
              ? "Apple SpeechAnalyzer"
              : (models || []).find((m) => m.id === activeModel)?.name || activeModel}
          </p>
          <p className="mt-0.5 font-mono text-[11px] text-[var(--brand)]">
            {usingAppleStt ? "macOS On-Device" : activeModel}
          </p>
        </div>
        <div className="vani-card p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]">Open-Source Downloaded</p>
          <p className="mt-1.5 text-sm font-semibold text-[var(--text)]">
            {installedModels.length} of {(models || []).length} models
          </p>
          <p className="mt-0.5 text-xs text-[var(--muted)]">Whisper GGML + Parakeet ONNX</p>
        </div>
        <div className="vani-card p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]">Acceleration</p>
          <p className="mt-1.5 text-sm font-semibold text-[var(--emerald)]">Metal GPU + Neural Engine</p>
          <p className="mt-0.5 text-xs text-[var(--muted)]">100% local on Apple Silicon</p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-1">
          {[
            ["all", `All (${(models || []).length})`],
            ["installed", `Installed (${installedModels.length})`],
            ["whisper", "Whisper GGML"],
            ["parakeet", "NVIDIA Parakeet"],
            ["multilingual", "Multilingual"],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                filter === key
                  ? "bg-[var(--brand-soft)] text-[var(--brand)]"
                  : "text-[var(--muted)] hover:text-[var(--text)]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/35 bg-[var(--danger-soft)] px-4 py-3 text-xs text-[var(--danger)]">
          {error}
        </div>
      )}

      {/* Model Cards */}
      <div className="grid gap-3">
        {filteredModels.map((model) => {
          const dl = downloads?.[model.id];
          const progress = dl && dl.total ? Math.min(100, (dl.received / dl.total) * 100) : 0;
          const isActive = !usingAppleStt && activeModel === model.id;
          const isParakeet = model.backend === "parakeet";
          const meta = MODEL_META[model.id] || { speed: 3, accuracy: 3, note: "" };

          return (
            <div
              key={model.id}
              className={`vani-card p-4 transition ${
                isActive ? "border-[var(--brand)] shadow-[0_0_0_1px_var(--brand-ring)]" : "hover:border-[var(--border-strong)]"
              }`}
            >
              <div className="flex flex-wrap items-center gap-4">
                <div
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-xs font-bold ${
                    isParakeet
                      ? "bg-[var(--violet-soft)] text-[var(--violet)]"
                      : "bg-[var(--brand-soft)] text-[var(--brand)]"
                  }`}
                >
                  {isParakeet ? "NV" : model.multilingual ? <Globe className="h-5 w-5" /> : "EN"}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-[var(--text)]">{model.name}</p>
                    {meta.recommended && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[var(--brand-soft)] px-2 py-0.5 text-[10px] font-semibold text-[var(--brand)]">
                        <Sparkles className="h-2.5 w-2.5" /> Recommended
                      </span>
                    )}
                    {isParakeet && (
                      <span className="rounded-full bg-[var(--violet-soft)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--violet)]">
                        Parakeet ONNX
                      </span>
                    )}
                    {isActive && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[var(--emerald-soft)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--emerald)]">
                        <Check className="h-2.5 w-2.5" /> Active
                      </span>
                    )}
                  </div>

                  <p className="mt-0.5 text-xs text-[var(--muted)]">
                    {meta.note || (model.multilingual ? "99 languages supported" : "English-optimized")} ·{" "}
                    <span className="font-mono">{model.size}</span> · {model.params} params
                  </p>

                  {/* Speed & Accuracy Rating Meters */}
                  <div className="mt-2.5 flex flex-wrap items-center gap-5 text-[11px] text-[var(--muted)]">
                    <div className="flex items-center gap-2">
                      <Gauge className="h-3 w-3 text-[var(--emerald)]" />
                      <span>Speed</span>
                      <MeterBar level={meta.speed} colorClass="bg-[var(--emerald)]" />
                    </div>
                    <div className="flex items-center gap-2">
                      <Target className="h-3 w-3 text-[var(--brand)]" />
                      <span>Accuracy</span>
                      <MeterBar level={meta.accuracy} colorClass="bg-[var(--brand)]" />
                    </div>
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex shrink-0 items-center gap-2">
                  {!model.installed && !dl && (
                    isParakeet ? (
                      <button
                        type="button"
                        onClick={() => onImport(model.id)}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--violet-soft)] px-3.5 py-2 text-xs font-semibold text-[var(--violet)] transition hover:brightness-110"
                      >
                        <Upload className="h-3.5 w-3.5" />
                        Import .onnx
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onDownload(model.id)}
                        className="vani-btn-primary inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold"
                      >
                        <Download className="h-3.5 w-3.5" />
                        Download
                      </button>
                    )
                  )}

                  {dl && (
                    <button
                      type="button"
                      onClick={() => onCancel(model.id)}
                      className="vani-btn-secondary inline-flex items-center gap-1 rounded-xl px-3 py-2 text-xs font-semibold"
                    >
                      <X className="h-3.5 w-3.5" />
                      Cancel
                    </button>
                  )}

                  {model.installed && !isActive && (
                    <button
                      type="button"
                      onClick={() => onSetActive(model.id)}
                      className="vani-btn-primary inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold"
                    >
                      <Cpu className="h-3.5 w-3.5" />
                      Use Model
                    </button>
                  )}

                  {model.installed && (
                    confirmDeleteId === model.id ? (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            onDelete(model.id);
                            setConfirmDeleteId(null);
                          }}
                          className="rounded-xl border border-red-500/40 bg-[var(--danger-soft)] px-2.5 py-2 text-xs font-semibold text-[var(--danger)]"
                        >
                          Remove
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          className="vani-btn-secondary rounded-xl px-2 py-2 text-xs"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(model.id)}
                        className="vani-btn-secondary rounded-xl p-2 text-[var(--muted)] hover:text-[var(--danger)]"
                        title="Delete model from disk"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )
                  )}
                </div>
              </div>

              {/* Live download bar */}
              {dl && (
                <div className="mt-3.5 rounded-xl border border-[var(--border)] bg-[var(--bg-app)] p-3">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-medium text-[var(--text)]">Downloading from Hugging Face…</span>
                    <span className="font-mono tabular-nums text-[var(--brand)]">
                      {formatBytes(dl.received)} / {dl.total ? formatBytes(dl.total) : "?"} ({progress.toFixed(0)}%)
                    </span>
                  </div>
                  <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-[var(--bg-elevated)]">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[var(--brand)] to-[var(--brand-3)] transition-[width] duration-200"
                      style={{ width: `${Math.max(4, progress)}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

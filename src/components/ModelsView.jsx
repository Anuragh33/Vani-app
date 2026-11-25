import { useMemo, useState } from "react";
import {
  Download,
  Check,
  Trash2,
  FolderOpen,
  Cpu,
  Upload,
  Globe,
  X,
} from "lucide-react";

const MODEL_META = {
  "ggml-base.en": { speed: 5, accuracy: 3, recommended: true, note: "Fast English starter model" },
  "ggml-base": { speed: 5, accuracy: 3, note: "Lightweight multilingual model" },
  "ggml-small.en": { speed: 4, accuracy: 4, note: "Strong everyday English accuracy" },
  "ggml-small": { speed: 4, accuracy: 4, note: "Balanced multilingual speed and quality" },
  "ggml-medium.en": { speed: 3, accuracy: 4, note: "High-precision English for technical terms" },
  "ggml-medium": { speed: 3, accuracy: 4, note: "High-precision multilingual transcription" },
  "ggml-large-v3-turbo": { speed: 4, accuracy: 5, recommended: true, note: "Best quality-to-speed across 99 languages" },
  "ggml-large-v3": { speed: 2, accuracy: 5, note: "Maximum transcription fidelity" },
  "parakeet-tdt-0.6b-v2": { speed: 5, accuracy: 5, note: "NVIDIA TDT ONNX English ASR" },
  "parakeet-tdt-1.1b-v2": { speed: 4, accuracy: 5, note: "NVIDIA 1.1B English ONNX model" },
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

function MeterBar({ level, max = 5, accent = false }) {
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: max }, (_, idx) => (
        <span
          key={idx}
          className={`h-1.5 w-3 rounded-sm ${
            idx < level
              ? accent
                ? "bg-[var(--brand)]"
                : "bg-[var(--text-soft)]"
              : "bg-[var(--border-strong)]"
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
  systemInfo,
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
  const [filter, setFilter] = useState("all");
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  const isMac = systemInfo ? Boolean(systemInfo.isMac) : true;
  const installedModels = useMemo(() => (models || []).filter((m) => m.installed), [models]);
  const usingAppleStt = isMac && settings?.transcriptionProvider === "apple";
  const usingApplePolish = isMac && settings?.cleanupProvider === "apple";

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
          <h1 className="text-2xl font-medium tracking-[-0.02em] text-[var(--text)]">
            {isMac ? "AI & speech models" : "Speech models"}
          </h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {isMac
              ? "Use macOS Apple On-Device AI with zero downloads, or run open-source Whisper (Metal GPU) and NVIDIA Parakeet ONNX locally"
              : `Run open-source Whisper GGML and NVIDIA Parakeet ONNX locally on ${systemInfo?.osName || "Windows"}`}
          </p>
        </div>

        <button
          type="button"
          onClick={onOpenModelsDir}
          className="vani-btn-secondary inline-flex h-9 items-center gap-2 px-3 text-xs"
        >
          <FolderOpen className="h-4 w-4 text-[var(--muted)]" strokeWidth={1.5} />
          <span>Open models folder</span>
        </button>
      </div>

      {/* Built-in Apple On-Device AI Section — macOS ONLY (completely hidden on Windows/Linux) */}
      {isMac && (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-[var(--text-soft)]">
              Apple On-Device AI · Built into macOS
            </p>
            {appleAi?.macosVersion && (
              <span className="font-mono text-xs text-[var(--muted)]">macOS {appleAi.macosVersion}</span>
            )}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {/* Apple SpeechAnalyzer Card */}
            <div
              className={`vani-card p-5 transition-colors ${
                usingAppleStt ? "border-[var(--border-strong)] bg-[var(--bg-elevated)]" : ""
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2.5">
                    <p className="text-sm font-medium text-[var(--text)]">Apple SpeechAnalyzer</p>
                    {usingAppleStt && (
                      <span className="inline-flex items-center gap-1 font-mono text-[11px] text-[var(--emerald)]">
                        <span className="h-1.5 w-1.5 rounded-full bg-[var(--emerald)]" />
                        Active STT
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">
                    Zero-download on-device macOS speech recognition with Neural Engine acceleration
                  </p>
                </div>
              </div>
              <div className="mt-4 flex items-center justify-between border-t border-[var(--border)] pt-3">
                <span
                  className={`text-xs ${
                    appleAi?.speechAnalyzerAvailable ? "text-[var(--emerald)]" : "text-[var(--amber)]"
                  }`}
                >
                  {appleAi?.speechAnalyzerAvailable ? "Available on this Mac" : "Requires macOS 26+"}
                </span>
                {usingAppleStt ? (
                  <span className="font-mono text-xs text-[var(--text-soft)]">Selected</span>
                ) : (
                  <button
                    type="button"
                    disabled={!appleAi?.speechAnalyzerAvailable}
                    onClick={() => {
                      onSaveSettings?.({ transcriptionProvider: "apple" });
                      onNotify?.("Switched Speech-to-Text to Apple On-Device SpeechAnalyzer");
                    }}
                    className="vani-btn-primary h-8 px-3 text-xs"
                  >
                    Use Apple Speech
                  </button>
                )}
              </div>
            </div>

            {/* Apple FoundationModels Card */}
            <div
              className={`vani-card p-5 transition-colors ${
                usingApplePolish ? "border-[var(--border-strong)] bg-[var(--bg-elevated)]" : ""
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2.5">
                    <p className="text-sm font-medium text-[var(--text)]">Apple Foundation Model</p>
                    {usingApplePolish && (
                      <span className="inline-flex items-center gap-1 font-mono text-[11px] text-[var(--emerald)]">
                        <span className="h-1.5 w-1.5 rounded-full bg-[var(--emerald)]" />
                        Active polish
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">
                    On-device Apple Intelligence model for Email, Slack, Notes, and Code formatting
                  </p>
                </div>
              </div>
              <div className="mt-4 flex items-center justify-between border-t border-[var(--border)] pt-3">
                <span
                  className={`text-xs ${
                    appleAi?.foundationModelAvailable ? "text-[var(--emerald)]" : "text-[var(--amber)]"
                  }`}
                >
                  {appleAi?.foundationModelAvailable
                    ? "Ready on this Mac"
                    : appleAi?.foundationModelReason || "Requires Apple Intelligence"}
                </span>
                {usingApplePolish ? (
                  <button
                    type="button"
                    onClick={() => {
                      onSaveSettings?.({ cleanupProvider: "none" });
                      onNotify?.("Switched text cleanup to Local rules only");
                    }}
                    className="vani-btn-secondary h-8 px-3 text-xs"
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
                    className="vani-btn-primary h-8 px-3 text-xs"
                  >
                    Use Apple LLM
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Summary Strip */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="vani-card p-5">
          <p className="text-xs text-[var(--muted)]">Active speech engine</p>
          <p className="mt-1.5 truncate text-base font-medium text-[var(--text)]">
            {usingAppleStt
              ? "Apple SpeechAnalyzer"
              : (models || []).find((m) => m.id === activeModel)?.name || activeModel}
          </p>
          <p className="mt-0.5 font-mono text-xs text-[var(--muted)]">
            {usingAppleStt ? "macOS on-device" : activeModel}
          </p>
        </div>
        <div className="vani-card p-5">
          <p className="text-xs text-[var(--muted)]">Open-source downloaded</p>
          <p className="mt-1.5 font-mono text-base font-medium text-[var(--text)] tabular-nums">
            {installedModels.length} / {(models || []).length} models
          </p>
          <p className="mt-0.5 text-xs text-[var(--muted)]">Whisper GGML and Parakeet ONNX</p>
        </div>
        <div className="vani-card p-5">
          <p className="text-xs text-[var(--muted)]">
            {isMac ? "Acceleration" : "Inference runtime"}
          </p>
          <p className="mt-1.5 text-base font-medium text-[var(--text)]">
            {isMac ? "Metal GPU + Neural Engine" : "whisper-rs + ONNX Runtime"}
          </p>
          <p className="mt-0.5 text-xs text-[var(--muted)]">
            {isMac ? "100% local on Apple Silicon" : `100% local on ${systemInfo?.osName || "Windows"}`}
          </p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-0.5 rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] p-0.5">
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
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                filter === key
                  ? "bg-[var(--bg-elevated)] text-[var(--text)]"
                  : "text-[var(--muted)] hover:text-[var(--text)]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-[var(--danger)]/35 bg-[var(--danger-soft)] px-4 py-3 text-xs text-[var(--danger)]">
          {error}
        </div>
      )}

      {/* Model Cards */}
      <div className="grid gap-3 xl:grid-cols-2">
        {filteredModels.map((model) => {
          const dl = downloads?.[model.id];
          const progress = dl && dl.total ? Math.min(100, (dl.received / dl.total) * 100) : 0;
          const isActive = !usingAppleStt && activeModel === model.id;
          const isParakeet = model.backend === "parakeet";
          const meta = MODEL_META[model.id] || { speed: 3, accuracy: 3, note: "" };

          return (
            <div
              key={model.id}
              className={`vani-card p-4 transition-colors ${
                isActive
                  ? "border-[var(--border-strong)] bg-[var(--bg-elevated)]"
                  : "hover:border-[var(--border-strong)]"
              }`}
            >
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--bg-app)] font-mono text-xs font-medium text-[var(--text-soft)]">
                  {isParakeet ? "NV" : model.multilingual ? <Globe className="h-4 w-4" strokeWidth={1.5} /> : "EN"}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium text-[var(--text)]">{model.name}</p>
                    {meta.recommended && (
                      <span className="font-mono text-[11px] text-[var(--brand)]">Recommended</span>
                    )}
                    {isParakeet && (
                      <span className="font-mono text-[11px] text-[var(--muted)]">ONNX</span>
                    )}
                    {isActive && (
                      <span className="inline-flex items-center gap-1 font-mono text-[11px] text-[var(--emerald)]">
                        <Check className="h-3 w-3" strokeWidth={1.75} />
                        Active
                      </span>
                    )}
                  </div>

                  <p className="mt-0.5 text-xs text-[var(--muted)]">
                    {meta.note || (model.multilingual ? "99 languages" : "English")} ·{" "}
                    <span className="font-mono tabular-nums">{model.size}</span> ·{" "}
                    <span className="font-mono tabular-nums">{model.params}</span>
                  </p>

                  {/* Speed & Accuracy Rating Meters */}
                  <div className="mt-2.5 flex flex-wrap items-center gap-5 text-[11px] text-[var(--muted)]">
                    <div className="flex items-center gap-2">
                      <span>Speed</span>
                      <MeterBar level={meta.speed} />
                    </div>
                    <div className="flex items-center gap-2">
                      <span>Accuracy</span>
                      <MeterBar level={meta.accuracy} accent={isActive} />
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
                        className="vani-btn-secondary inline-flex h-8 items-center gap-1.5 px-3 text-xs"
                      >
                        <Upload className="h-3.5 w-3.5" strokeWidth={1.5} />
                        Import .onnx
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onDownload(model.id)}
                        className="vani-btn-primary inline-flex h-8 items-center gap-1.5 px-3 text-xs"
                      >
                        <Download className="h-3.5 w-3.5" strokeWidth={1.75} />
                        Download
                      </button>
                    )
                  )}

                  {dl && (
                    <button
                      type="button"
                      onClick={() => onCancel(model.id)}
                      className="vani-btn-secondary inline-flex h-8 items-center gap-1 px-3 text-xs"
                    >
                      <X className="h-3.5 w-3.5" strokeWidth={1.5} />
                      Cancel
                    </button>
                  )}

                  {model.installed && !isActive && (
                    <button
                      type="button"
                      onClick={() => onSetActive(model.id)}
                      className="vani-btn-primary inline-flex h-8 items-center gap-1.5 px-3 text-xs"
                    >
                      <Cpu className="h-3.5 w-3.5" strokeWidth={1.75} />
                      Use model
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
                          className="h-8 rounded-lg border border-[var(--danger)]/40 bg-[var(--danger-soft)] px-2.5 text-xs font-medium text-[var(--danger)]"
                        >
                          Remove
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          className="vani-btn-secondary h-8 px-2 text-xs"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(model.id)}
                        className="vani-btn-secondary grid h-8 w-8 place-items-center text-[var(--muted)] hover:text-[var(--danger)]"
                        title="Delete model from disk"
                      >
                        <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                      </button>
                    )
                  )}
                </div>
              </div>

              {/* Live download bar */}
              {dl && (
                <div className="mt-3.5 rounded-lg border border-[var(--border)] bg-[var(--bg-app)] p-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[var(--text)]">Downloading</span>
                    <span className="font-mono tabular-nums text-[var(--muted)]">
                      {formatBytes(dl.received)} / {dl.total ? formatBytes(dl.total) : "?"} ({progress.toFixed(0)}%)
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[var(--bg-elevated)]">
                    <div
                      className="h-full rounded-full bg-[var(--brand)] transition-[width] duration-200"
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

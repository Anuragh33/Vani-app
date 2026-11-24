// Tauri IPC bridge — exposes window.vani backed by real Tauri commands inside
// the desktop app, plus a clean in-memory preview fallback when running in a
// standalone browser (e.g. `npm run dev`) for UI inspection and testing.
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export const isTauriRuntime =
  typeof window !== "undefined" &&
  ("__TAURI_INTERNALS__" in window || "__TAURI__" in window);

function subscribe(eventName, callback) {
  let unlisten = null;
  listen(eventName, (event) => callback(event.payload)).then((fn) => {
    unlisten = fn;
  });
  return () => {
    unlisten?.();
  };
}

// ── Browser-only preview sandbox (never used inside the compiled Tauri app) ──
function createBrowserPreviewBridge() {
  const listeners = new Map();
  const emitLocal = (event, payload) => {
    const set = listeners.get(event);
    if (!set) return;
    set.forEach((cb) => cb(payload));
  };
  const onLocal = (event, cb) => {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event).add(cb);
    return () => listeners.get(event)?.delete(cb);
  };

  const now = Date.now();
  const hoursAgo = (h) => new Date(now - h * 3600_000).toISOString();
  const daysAgo = (d, h = 2) => new Date(now - (d * 24 + h) * 3600_000).toISOString();

  let settings = {
    language: "auto",
    hotkey: "CommandOrControl+Shift+Space",
    autoInject: true,
    autoStopOnSilence: true,
    silenceDurationMs: 2000,
    startAtLogin: false,
    whisperModel: "ggml-base.en",
    threads: 6,
    translate: false,
    customVocabulary: "VANI, whisper-rs, Parakeet, Tauri, macOS, Apple Silicon",
    snippets: [
      { trigger: "addr", expansion: "248 Market Street, Suite 400, San Francisco, CA" },
      { trigger: "cal", expansion: "https://cal.com/vani-team/30min" },
      { trigger: "sig", expansion: "Best regards,\nAnuragh" },
    ],
    theme: "dark",
    openaiKey: "",
    anthropicKey: "",
    transcriptionProvider: "local",
    cleanupProvider: "none",
    cleanupContext: "general",
    fillerWordRemoval: true,
    onboardingComplete: true,
    privacyMode: false,
    hudStyle: "breathwave",
    hudPosition: "top-center",
    hudShowTimer: true,
    hudShowMode: true,
    hudGlass: true,
    trayIconStyle: "monochrome",
  };

  let models = [
    { id: "ggml-base.en", name: "Base (English)", size: "142 MB", params: "74M", multilingual: false, installed: true, downloading: false, backend: "whisper", importable: false },
    { id: "ggml-base", name: "Base", size: "142 MB", params: "74M", multilingual: true, installed: false, downloading: false, backend: "whisper", importable: false },
    { id: "ggml-small.en", name: "Small (English)", size: "466 MB", params: "244M", multilingual: false, installed: true, downloading: false, backend: "whisper", importable: false },
    { id: "ggml-small", name: "Small", size: "466 MB", params: "244M", multilingual: true, installed: false, downloading: false, backend: "whisper", importable: false },
    { id: "ggml-medium.en", name: "Medium (English)", size: "1.5 GB", params: "769M", multilingual: false, installed: false, downloading: false, backend: "whisper", importable: false },
    { id: "ggml-medium", name: "Medium", size: "1.5 GB", params: "769M", multilingual: true, installed: false, downloading: false, backend: "whisper", importable: false },
    { id: "ggml-large-v3-turbo", name: "Large v3 Turbo", size: "1.6 GB", params: "809M", multilingual: true, installed: false, downloading: false, backend: "whisper", importable: false },
    { id: "ggml-large-v3", name: "Large v3", size: "3.0 GB", params: "1550M", multilingual: true, installed: false, downloading: false, backend: "whisper", importable: false },
    { id: "parakeet-tdt-0.6b-v2", name: "Parakeet TDT v2 (English)", size: "~1.5 GB", params: "600M", multilingual: false, installed: false, downloading: false, backend: "parakeet", importable: true },
    { id: "parakeet-tdt-1.1b-v2", name: "Parakeet TDT 1.1B v2 (English)", size: "~2.7 GB", params: "1100M", multilingual: false, installed: false, downloading: false, backend: "parakeet", importable: true },
  ];

  let history = [
    {
      id: "h-1",
      timestamp: hoursAgo(0.4),
      rawText: "um hey team uh let's ship the new interactive VANI release before Friday and uh make sure the local whisper-rs latency stays under 300 milliseconds",
      cleanedText: "Hey team, let's ship the new interactive VANI release before Friday and make sure the local whisper-rs latency stays under 300 milliseconds.",
      provider: "whisper-rs:ggml-base.en",
      injected: true,
      mode: "paste",
    },
    {
      id: "h-2",
      timestamp: hoursAgo(2.5),
      rawText: "like can you review the pull request for the floating pill waveform animation when you get a chance thanks",
      cleanedText: "Can you review the pull request for the floating pill waveform animation when you get a chance? Thanks!",
      provider: "whisper-rs:ggml-small.en",
      injected: true,
      mode: "paste",
    },
    {
      id: "h-3",
      timestamp: daysAgo(1, 3),
      rawText: "Remember to benchmark Parakeet TDT v2 against Whisper Large v3 Turbo on Apple Silicon M3 before publishing the changelog.",
      cleanedText: "Remember to benchmark Parakeet TDT v2 against Whisper Large v3 Turbo on Apple Silicon M3 before publishing the changelog.",
      provider: "whisper-rs:ggml-base.en",
      injected: true,
      mode: "paste",
    },
    {
      id: "h-4",
      timestamp: daysAgo(2, 5),
      rawText: "uh send the onboarding link to the design partner and include cal so they can pick a slot this week",
      cleanedText: "Send the onboarding link to the design partner and include https://cal.com/vani-team/30min so they can pick a slot this week.",
      provider: "whisper-rs:ggml-small.en",
      injected: false,
      mode: "clipboard",
    },
    {
      id: "h-5",
      timestamp: daysAgo(4, 1),
      rawText: "Refactor the audio downsampler to keep 16 kHz mono PCM clean with zero clipping during fast speech bursts.",
      cleanedText: "Refactor the audio downsampler to keep 16 kHz mono PCM clean with zero clipping during fast speech bursts.",
      provider: "whisper-rs:ggml-base.en",
      injected: true,
      mode: "paste",
    },
  ];

  let notes = [
    {
      id: "note-1",
      title: "VANI v2.1 Release Checklist",
      content: "# VANI v2.1 Release Checklist\n\n- [x] Built-in **whisper-rs** engine with zero external binaries\n- [x] Redesigned interactive Studio, Modes, Dictionary & Analytics\n- [ ] Benchmark `parakeet-tdt-0.6b-v2` on Apple Silicon\n\n> Hold `⌥ Option` anywhere on macOS to dictate directly into your active cursor.",
      createdAt: daysAgo(2),
      updatedAt: hoursAgo(1.2),
    },
    {
      id: "note-2",
      title: "Product Positioning vs Market",
      content: "## Why Local-First Wins\n\nUnlike cloud-only dictation tools, **VANI** runs 100% offline with `whisper-rs` and optional NVIDIA Parakeet ONNX models.\n\n1. Zero audio leaves your Mac in Privacy Mode\n2. Instant snippet triggers & custom vocabulary\n3. Optional BYOK cleanup via Claude or GPT-4o mini",
      createdAt: daysAgo(4),
      updatedAt: daysAgo(1),
    },
  ];

  const downloadTimers = new Map();

  const applyLocalPipeline = (raw) => {
    let text = raw.trim();
    if (settings.fillerWordRemoval) {
      text = text.replace(/\b(um|uh|er|ah|like,)\b/gi, "").replace(/\s{2,}/g, " ").trim();
      text = text.charAt(0).toUpperCase() + text.slice(1);
    }
    for (const s of settings.snippets || []) {
      if (!s.trigger) continue;
      const escaped = s.trigger.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      text = text.replace(new RegExp(`\\b${escaped}\\b`, "gi"), s.expansion);
    }
    return text;
  };

  const samplePhrases = [
    "um hey there, this is a live local VANI dictation test running right on your Mac.",
    "uh let's schedule a quick product review tomorrow — here is my cal link.",
    "Notes for standup: finished the interactive waveform studio, shipped custom vocabulary chips, and verified whisper-rs latency.",
  ];
  let sampleIdx = 0;

  return {
    isPreview: true,
    getSettings: async () => ({ ...settings }),
    saveSettings: async (partial) => {
      settings = { ...settings, ...partial };
      emitLocal("settings-updated", { ...settings });
      return { ...settings };
    },
    onSettingsUpdated: (cb) => onLocal("settings-updated", cb),
    onHotkeyValidationFailed: (cb) => onLocal("hotkey-validation-failed", cb),

    onDictationStart: (cb) => onLocal("dictation-start", cb),
    onDictationStop: (cb) => onLocal("dictation-stop", cb),
    onOverlayShown: (cb) => onLocal("overlay-shown", cb),

    dictationComplete: async () => {
      await new Promise((r) => setTimeout(r, 650));
      const rawText = samplePhrases[sampleIdx % samplePhrases.length];
      sampleIdx += 1;
      const text = applyLocalPipeline(rawText);
      const providerLabel = `whisper-rs:${settings.whisperModel}`;
      if (!settings.privacyMode) {
        const entry = {
          id: `h-${Date.now()}`,
          timestamp: new Date().toISOString(),
          rawText,
          cleanedText: text,
          provider: providerLabel,
          injected: settings.autoInject,
          mode: "sandbox",
        };
        history = [entry, ...history].slice(0, 100);
        emitLocal("history-updated", undefined);
      }
      return { ok: true, text, rawText, providerLabel, privacyMode: settings.privacyMode, usedFallback: false };
    },
    cancelDictation: async () => {},

    injectText: async () => ({ ok: true, mode: "clipboard" }),
    injectOverlayText: async ({ text, rawText, providerLabel, privacyMode }) => {
      if (!privacyMode) {
        history = [
          {
            id: `h-${Date.now()}`,
            timestamp: new Date().toISOString(),
            rawText: rawText || text,
            cleanedText: text,
            provider: providerLabel || `whisper-rs:${settings.whisperModel}`,
            injected: true,
            mode: "paste",
          },
          ...history,
        ].slice(0, 100);
        emitLocal("history-updated", undefined);
      }
      return { ok: true, mode: "paste" };
    },

    openMainWindow: async () => {},
    toggleDashboard: async () => {},
    onOpenMainWindow: (cb) => onLocal("open-dashboard-section", cb),

    getHistory: async () => [...history],
    appendHistory: async (entry) => {
      history = [entry, ...history].slice(0, 100);
      emitLocal("history-updated", undefined);
      return [...history];
    },
    clearHistory: async () => {
      history = [];
      emitLocal("history-updated", undefined);
      return [];
    },
    onHistoryUpdated: (cb) => onLocal("history-updated", cb),

    listNotes: async () => [...notes],
    saveNote: async (note) => {
      const ts = new Date().toISOString();
      const idx = notes.findIndex((n) => n.id === note.id);
      if (idx >= 0) {
        notes[idx] = { ...note, updatedAt: ts };
      } else {
        notes = [{ ...note, createdAt: ts, updatedAt: ts }, ...notes];
      }
      return [...notes];
    },
    deleteNote: async (noteId) => {
      notes = notes.filter((n) => n.id !== noteId);
      return [...notes];
    },
    exportNote: async (note) => {
      const ext = note.format === "txt" ? "txt" : "md";
      return { ok: true, path: `~/Downloads/${(note.title || "note").replace(/\s+/g, "_")}.${ext}` };
    },

    listModels: async () => models.map((m) => ({ ...m })),
    downloadModel: async (modelId) => {
      if (downloadTimers.has(modelId)) return { ok: true, status: "already_downloading" };
      const total = 148_000_000;
      let received = 0;
      const timer = setInterval(() => {
        received = Math.min(total, received + 24_000_000);
        emitLocal("model-download-progress", { modelId, received, total });
        if (received >= total) {
          clearInterval(timer);
          downloadTimers.delete(modelId);
          models = models.map((m) => (m.id === modelId ? { ...m, installed: true, downloading: false } : m));
          emitLocal("model-download-done", { modelId, ok: true });
        }
      }, 260);
      downloadTimers.set(modelId, timer);
      return { ok: true, status: "started" };
    },
    cancelModelDownload: async (modelId) => {
      const timer = downloadTimers.get(modelId);
      if (timer) {
        clearInterval(timer);
        downloadTimers.delete(modelId);
      }
      emitLocal("model-download-done", { modelId, ok: false });
      return { ok: true };
    },
    deleteModel: async (modelId) => {
      models = models.map((m) => (m.id === modelId ? { ...m, installed: false } : m));
      return { ok: true };
    },
    onModelDownloadProgress: (cb) => onLocal("model-download-progress", cb),
    onModelDownloadDone: (cb) => onLocal("model-download-done", cb),

    whisperStatus: async () => {
      const active = models.find((m) => m.id === settings.whisperModel);
      return {
        binaryFound: true,
        binary: "built-in (whisper-rs)",
        model: settings.whisperModel,
        modelInstalled: Boolean(active?.installed),
        modelPath: `~/Library/Application Support/com.vani.app/models/${settings.whisperModel}.bin`,
        modelsDir: `~/Library/Application Support/com.vani.app/models`,
      };
    },
    openModelsDir: async () => {},
    importParakeetModel: async (_srcPath, modelId) => {
      models = models.map((m) => (m.id === modelId ? { ...m, installed: true } : m));
      return { ok: true, path: `~/Library/Application Support/com.vani.app/models/${modelId}.onnx` };
    },

    checkPermissions: async () => ({ microphone: "granted", accessibility: true }),
    completeOnboarding: async () => {
      settings.onboardingComplete = true;
    },

    testOpenAIKey: async (key) =>
      key?.startsWith("sk-") ? { valid: true } : { valid: false, error: "Key should start with sk-" },
    testAnthropicKey: async (key) =>
      key?.startsWith("sk-ant-") ? { valid: true } : { valid: false, error: "Key should start with sk-ant-" },

    platform: "darwin",
  };
}

const tauriBridge = {
  isPreview: false,
  // Settings
  getSettings: () => invoke("get_settings"),
  saveSettings: (settings) => invoke("save_settings", { settings }),
  onSettingsUpdated: (cb) => subscribe("settings-updated", cb),
  onHotkeyValidationFailed: (cb) => subscribe("hotkey-validation-failed", cb),

  // Dictation lifecycle
  onDictationStart: (cb) => subscribe("dictation-start", cb),
  onDictationStop: (cb) => subscribe("dictation-stop", cb),
  onOverlayShown: (cb) => subscribe("overlay-shown", cb),
  dictationComplete: ({ wavBuffer }) =>
    invoke("dictation_complete", { wavBuffer: Array.from(new Uint8Array(wavBuffer)) }),
  cancelDictation: () => invoke("cancel_dictation"),

  // Injection
  injectText: (text) => invoke("inject_text", { text }),
  injectOverlayText: ({ text, rawText, providerLabel, privacyMode }) =>
    invoke("inject_overlay_text", { text, rawText, providerLabel, privacyMode }),

  // Dashboard/window control
  openMainWindow: (section) => invoke("open_main_window", { section }),
  toggleDashboard: () => invoke("toggle_dashboard_cmd"),
  onOpenMainWindow: (cb) => subscribe("open-dashboard-section", cb),

  // History
  getHistory: () => invoke("get_history"),
  appendHistory: (entry) => invoke("append_history", { entry }),
  clearHistory: () => invoke("clear_history"),
  onHistoryUpdated: (cb) => subscribe("history-updated", cb),

  // Notes
  listNotes: () => invoke("list_notes"),
  saveNote: (note) => invoke("save_note", { note }),
  deleteNote: (noteId) => invoke("delete_note", { noteId }),
  exportNote: (note) => invoke("export_note", { note }),

  // Models
  listModels: () => invoke("list_models"),
  downloadModel: (modelId) => invoke("download_model", { modelId }),
  cancelModelDownload: (modelId) => invoke("cancel_model_download", { modelId }),
  deleteModel: (modelId) => invoke("delete_model", { modelId }),
  onModelDownloadProgress: (cb) => subscribe("model-download-progress", cb),
  onModelDownloadDone: (cb) => subscribe("model-download-done", cb),

  // Whisper status
  whisperStatus: () => invoke("whisper_status"),
  openModelsDir: () => invoke("open_models_dir"),
  importParakeetModel: (srcPath, modelId) => invoke("import_parakeet_model", { srcPath, modelId }),

  // Permissions and onboarding
  checkPermissions: () => invoke("check_permissions"),
  completeOnboarding: () => invoke("complete_onboarding"),

  // API key testing
  testOpenAIKey: (key) => invoke("test_openai_key", { key }),
  testAnthropicKey: (key) => invoke("test_anthropic_key", { key }),

  platform: navigator.platform.toLowerCase().includes("mac") ? "darwin" : "other",
};

export const vani = isTauriRuntime ? tauriBridge : createBrowserPreviewBridge();

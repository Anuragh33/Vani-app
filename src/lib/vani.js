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
  const params = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
  const previewOsParam = (params?.get("previewOs") || "").toLowerCase();
  const isWinPreview =
    previewOsParam === "windows" ||
    previewOsParam === "win" ||
    (!previewOsParam && typeof navigator !== "undefined" && navigator.platform.toLowerCase().includes("win"));
  const isMacPreview = !isWinPreview;

  const previewSystemInfo = isMacPreview
    ? {
        os: "macos",
        arch: "aarch64",
        isMac: true,
        isWindows: false,
        appleAiSupported: true,
        pushToTalkKey: "⌥ Option",
        handsFreeKey: "⌥ + ⌘",
        modifierSymbol: "⌘",
        dashboardHotkey: "⌘⇧D",
        dictateHotkey: "⌘⇧Space",
        osName: "macOS",
        fileManagerName: "Finder",
        gpuBackend: "Metal GPU + Neural Engine",
      }
    : {
        os: "windows",
        arch: "x86_64",
        isMac: false,
        isWindows: true,
        appleAiSupported: false,
        pushToTalkKey: "Right Alt",
        handsFreeKey: "Right Alt + Ctrl",
        modifierSymbol: "Ctrl+",
        dashboardHotkey: "Ctrl+Shift+D",
        dictateHotkey: "Ctrl+Shift+Space",
        osName: "Windows",
        fileManagerName: "Explorer",
        gpuBackend: "CPU + ONNX Runtime",
      };

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
    customVocabulary: isMacPreview
      ? "VANI, whisper-rs, Parakeet, Tauri, macOS, Apple Silicon"
      : "VANI, whisper-rs, Parakeet, Tauri, Windows",
    snippets: [
      { trigger: "addr", expansion: "248 Market Street, Suite 400, San Francisco, CA" },
      { trigger: "cal", expansion: "https://cal.com/vani-team/30min" },
      { trigger: "sig", expansion: "Best regards,\nAnuragh" },
    ],
    theme: "dark",
    openaiKey: "",
    anthropicKey: "",
    transcriptionProvider: isMacPreview ? "apple" : "local",
    cleanupProvider: isMacPreview ? "apple" : "none",
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
    voiceActionsEnabled: true,
    handsFreeAutoSend: true,
    appAliases: [
      { spoken: "editor", target: "Antigravity" },
      { spoken: "browser", target: "Google Chrome" },
    ],
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
      rawText: isMacPreview
        ? "Remember to benchmark Parakeet TDT v2 against Whisper Large v3 Turbo on Apple Silicon M3 before publishing the changelog."
        : "Remember to benchmark Parakeet TDT v2 against Whisper Large v3 Turbo on Windows before publishing the changelog.",
      cleanedText: isMacPreview
        ? "Remember to benchmark Parakeet TDT v2 against Whisper Large v3 Turbo on Apple Silicon M3 before publishing the changelog."
        : "Remember to benchmark Parakeet TDT v2 against Whisper Large v3 Turbo on Windows before publishing the changelog.",
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
    getSystemInfo: async () => ({ ...previewSystemInfo }),
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
    onHandsFreeStart: (cb) => onLocal("hands-free-start", cb),
    onHandsFreeStop: (cb) => onLocal("hands-free-stop", cb),
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
        binary: isMacPreview ? "built-in (whisper-rs Metal + ONNX)" : "built-in (whisper-rs + ONNX)",
        model: settings.whisperModel,
        modelInstalled: Boolean(active?.installed),
        modelPath: isMacPreview
          ? `~/Library/Application Support/com.vani.app/models/${settings.whisperModel}.bin`
          : `C:\\Users\\Anuragh\\AppData\\Roaming\\com.vani.app\\models\\${settings.whisperModel}.bin`,
        modelsDir: isMacPreview
          ? `~/Library/Application Support/com.vani.app/models`
          : `C:\\Users\\Anuragh\\AppData\\Roaming\\com.vani.app\\models`,
      };
    },
    appleAiStatus: async () =>
      isMacPreview
        ? {
            foundationModelAvailable: true,
            foundationModelReason: "ready",
            speechAnalyzerAvailable: true,
            macosVersion: "27.2",
            helperFound: true,
          }
        : {
            foundationModelAvailable: false,
            foundationModelReason: "Not available on Windows",
            speechAnalyzerAvailable: false,
            macosVersion: "",
            helperFound: false,
          },
    testApplePolish: async (text, context = "general") => {
      await new Promise((r) => setTimeout(r, 320));
      let out = applyLocalPipeline(text);
      if (out && !/[.!?]$/.test(out)) out += ".";
      return { ok: true, text: out, context };
    },
    openModelsDir: async () => {},
    importParakeetModel: async (_srcPath, modelId) => {
      models = models.map((m) => (m.id === modelId ? { ...m, installed: true } : m));
      return { ok: true, path: `~/Library/Application Support/com.vani.app/models/${modelId}.onnx` };
    },

    checkPermissions: async () => ({ microphone: "granted", accessibility: true }),
    openAccessibilitySettings: async () => {},
    openMicSettings: async () => {},
    completeOnboarding: async () => {
      settings.onboardingComplete = true;
    },

    testOpenAIKey: async (key) =>
      key?.startsWith("sk-") ? { valid: true } : { valid: false, error: "Key should start with sk-" },
    testAnthropicKey: async (key) =>
      key?.startsWith("sk-ant-") ? { valid: true } : { valid: false, error: "Key should start with sk-ant-" },

    listInstalledApps: async () =>
      isMacPreview
        ? [
            { name: "Antigravity", path: "/Applications/Antigravity.app" },
            { name: "Brave Browser", path: "/Applications/Brave Browser.app" },
            { name: "ChatGPT", path: "/Applications/ChatGPT.app" },
            { name: "Discord", path: "/Applications/Discord.app" },
            { name: "Gemini", path: "/Applications/Gemini.app" },
            { name: "Google Chrome", path: "/Applications/Google Chrome.app" },
            { name: "Notes", path: "/System/Applications/Notes.app" },
            { name: "Notion", path: "/Applications/Notion.app" },
            { name: "Safari", path: "/Applications/Safari.app" },
            { name: "Slack", path: "/Applications/Slack.app" },
            { name: "Terminal", path: "/System/Applications/Utilities/Terminal.app" },
            { name: "Visual Studio Code", path: "/Applications/Visual Studio Code.app" },
            { name: "WhatsApp", path: "/Applications/WhatsApp.app" },
          ]
        : [
            { name: "Antigravity", path: "Antigravity.lnk" },
            { name: "Discord", path: "Discord.lnk" },
            { name: "File Explorer", path: "explorer.exe" },
            { name: "Google Chrome", path: "Google Chrome.lnk" },
            { name: "Microsoft Edge", path: "msedge.exe" },
            { name: "Notepad", path: "notepad.exe" },
            { name: "Notion", path: "Notion.lnk" },
            { name: "Slack", path: "Slack.lnk" },
            { name: "Visual Studio Code", path: "Visual Studio Code.lnk" },
            { name: "Windows Terminal", path: "wt.exe" },
          ],
    testVoiceAction: async (phrase, execute = false) => {
      const stripped = (phrase || "")
        .trim()
        .replace(/^(?:(?:um|uh|ah|so|hey|okay|ok|please|can you|could you|hey vani|vani|just)[,\s]+)+/i, "")
        .trim();
      const lower = stripped.toLowerCase().replace(/[.!?]+$/, "");
      const previewApps = isMacPreview
        ? ["Antigravity", "App Store", "Brave Browser", "ChatGPT", "Discord", "Gemini", "Google Chrome", "Music", "Notes", "Notion", "Safari", "Slack", "System Settings", "Terminal", "Visual Studio Code", "WhatsApp"]
        : ["Antigravity", "Discord", "File Explorer", "Google Chrome", "Microsoft Edge", "Notepad", "Notion", "Settings", "Slack", "Visual Studio Code", "Windows Terminal"];
      const webApps = {
        claude: { name: "Claude", path: "https://claude.ai", isWeb: true },
        claudeai: { name: "Claude", path: "https://claude.ai", isWeb: true },
        claudea: { name: "Claude", path: "https://claude.ai", isWeb: true },
        youtube: { name: "YouTube", path: "https://www.youtube.com", isWeb: true },
        gmail: { name: "Gmail", path: "https://mail.google.com", isWeb: true },
        github: { name: "GitHub", path: "https://github.com", isWeb: true },
        applemusic: { name: "Apple Music", path: "https://music.apple.com", isWeb: true },
      };
      const builtinMap = {
        applemusic: "Music",
        chatgpt: "ChatGPT",
        chatgbt: "ChatGPT",
        antigravity: "Antigravity",
        settings: isMacPreview ? "System Settings" : "Settings",
        vscode: "Visual Studio Code",
        chrome: "Google Chrome",
      };
      const norm = (s) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
      const resolvePreviewApp = (q) => {
        const nq = norm(q);
        if (!nq) return null;
        const aliasHit = (settings.appAliases || []).find((a) => norm(a.spoken) === nq);
        if (aliasHit) return { name: aliasHit.target, path: "", isWeb: false };
        const canonical = builtinMap[nq];
        const lookup = canonical ? norm(canonical) : nq;
        const direct = previewApps.find((a) => norm(a) === lookup || (lookup.length >= 4 && norm(a).startsWith(lookup)));
        if (direct) return { name: direct, path: "", isWeb: false };
        if (webApps[nq]) return webApps[nq];
        return null;
      };
      if (["stop listening", "stop hands free", "stop hands-free", "exit hands free", "stop vani"].includes(lower)) {
        return { matched: true, action: { kind: "stopHandsFree" }, executed: execute, result: { ok: true, summary: "Hands-free mode stopped" } };
      }
      if (["close tab", "close this tab", "close the tab"].includes(lower)) {
        return { matched: true, action: { kind: "browserCloseTab" }, executed: execute, result: { ok: true, summary: "Closed active tab" } };
      }
      if (["new tab", "open new tab", "open a new tab"].includes(lower)) {
        return { matched: true, action: { kind: "browserNewTab", browserName: null, query: null }, executed: execute, result: { ok: true, summary: "Opened new tab" } };
      }
      const mNewTab = lower.match(/^(?:open\s+a?\s*new\s+tab|new\s+tab)\s+(?:(?:on|in)\s+([a-z0-9\s]+?))?(?:\s+and\s+(?:start\s+searching(?:\s+for)?|search(?:\s+for)?|go\s+to)\s+(.+))?$/i);
      if (mNewTab && (mNewTab[1] || mNewTab[2])) {
        const b = mNewTab[1] ? resolvePreviewApp(mNewTab[1]) : null;
        return {
          matched: true,
          action: { kind: "browserNewTab", browserName: b?.name || null, query: mNewTab[2]?.trim() || null },
          executed: execute,
          result: { ok: true, summary: `Opened new tab${b ? ` in ${b.name}` : ""}${mNewTab[2] ? ` & searched “${mNewTab[2].trim()}”` : ""}` },
        };
      }
      const mSiteSearch = lower.match(/^(?:start\s+)?search(?:ing)?(?:\s+for)?\s+(.+?)\s+(?:on|in)\s+(youtube|google)$/i);
      if (mSiteSearch) {
        const site = mSiteSearch[2] === "youtube" ? "YouTube" : "Google";
        return {
          matched: true,
          action: { kind: "browserSearchSite", siteName: site, query: mSiteSearch[1].trim(), url: "" },
          executed: execute,
          result: { ok: true, summary: `Searched “${mSiteSearch[1].trim()}” on ${site}` },
        };
      }
      if (["press enter", "hit enter", "send message", "send it"].includes(lower)) {
        return { matched: true, action: { kind: "pressEnter" }, executed: execute, result: { ok: true, summary: "Pressed Enter" } };
      }
      if (["start typing", "start dictating", "focus chat"].includes(lower)) {
        return { matched: true, action: { kind: "startTyping", text: null, pressEnter: false }, executed: execute, result: { ok: true, summary: "Hands-free listening active", followUpDictation: true } };
      }
      if (lower.startsWith("start typing ")) {
        const text = stripped.slice("start typing ".length);
        return { matched: true, action: { kind: "startTyping", text, pressEnter: true }, executed: execute, result: { ok: true, summary: "Typed & sent" } };
      }
      const mChain = lower.match(/^(?:open|launch|switch to|go to)\s+(.+?)\s+and\s+(?:start typing|type|say|ask|send|search|message)\s+(.+)$/i);
      if (mChain) {
        const app = resolvePreviewApp(mChain[1]);
        if (app) {
          return {
            matched: true,
            action: { kind: "openAndType", appName: app.name, appPath: app.path, isWeb: app.isWeb, text: mChain[2], pressEnter: true },
            executed: execute,
            result: { ok: true, summary: `Opened ${app.name} & sent` },
          };
        }
      }
      const mOpen = lower.match(/^(?:open|launch|switch to|go to)\s+([a-z0-9\s.-]+)$/i);
      if (mOpen) {
        const app = resolvePreviewApp(mOpen[1]);
        if (app) {
          return {
            matched: true,
            action: { kind: "openApp", appName: app.name, appPath: app.path, isWeb: app.isWeb },
            executed: execute,
            result: { ok: true, summary: app.isWeb ? `Opened ${app.name} in browser` : `Opened ${app.name}` },
          };
        }
      }
      return { matched: false, action: null, executed: false };
    },

    platform: isMacPreview ? "darwin" : "win32",
  };
}

const tauriBridge = {
  isPreview: false,
  getSystemInfo: () => invoke("get_system_info"),
  // Settings
  getSettings: () => invoke("get_settings"),
  saveSettings: (settings) => invoke("save_settings", { settings }),
  onSettingsUpdated: (cb) => subscribe("settings-updated", cb),
  onHotkeyValidationFailed: (cb) => subscribe("hotkey-validation-failed", cb),

  // Dictation lifecycle
  onDictationStart: (cb) => subscribe("dictation-start", cb),
  onDictationStop: (cb) => subscribe("dictation-stop", cb),
  onHandsFreeStart: (cb) => subscribe("hands-free-start", cb),
  onHandsFreeStop: (cb) => subscribe("hands-free-stop", cb),
  onOverlayShown: (cb) => subscribe("overlay-shown", cb),
  onNativeAudioLevel: (cb) => subscribe("native-audio-level", cb),
  startNativeRecording: () => invoke("start_native_recording"),
  stopNativeRecording: () => invoke("stop_native_recording"),
  cancelNativeRecording: () => invoke("cancel_native_recording"),
  dictationComplete: ({ wavBuffer, wavPath, allowActions = true, handsFree = false }) =>
    invoke("dictation_complete", {
      wavBuffer: wavBuffer ? Array.from(new Uint8Array(wavBuffer)) : null,
      wavPath: wavPath || null,
      allowActions,
      handsFree,
    }),
  cancelDictation: () => invoke("cancel_dictation"),

  // Injection
  injectText: (text) => invoke("inject_text", { text }),
  injectOverlayText: ({ text, rawText, providerLabel, privacyMode, autoSend = false }) =>
    invoke("inject_overlay_text", { text, rawText, providerLabel, privacyMode, autoSend }),

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

  // Whisper & Apple on-device AI status
  whisperStatus: () => invoke("whisper_status"),
  appleAiStatus: () => invoke("apple_ai_status"),
  testApplePolish: (text, context = "general") => invoke("test_apple_polish", { text, context }),
  openModelsDir: () => invoke("open_models_dir"),
  importParakeetModel: (srcPath, modelId) => invoke("import_parakeet_model", { srcPath, modelId }),

  // Permissions and onboarding
  checkPermissions: () => invoke("check_permissions"),
  openAccessibilitySettings: () => invoke("open_accessibility_settings"),
  openMicSettings: () => invoke("open_mic_settings"),
  completeOnboarding: () => invoke("complete_onboarding"),

  // API key testing
  testOpenAIKey: (key) => invoke("test_openai_key", { key }),
  testAnthropicKey: (key) => invoke("test_anthropic_key", { key }),

  // Hands-free Voice Actions
  listInstalledApps: () => invoke("list_installed_apps"),
  testVoiceAction: (phrase, execute = false) => invoke("test_voice_action", { phrase, execute }),

  platform: navigator.platform.toLowerCase().includes("mac")
    ? "darwin"
    : navigator.platform.toLowerCase().includes("win")
    ? "win32"
    : "linux",
};

export const vani = isTauriRuntime ? tauriBridge : createBrowserPreviewBridge();

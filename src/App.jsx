import { useCallback, useEffect, useState } from "react";
import {
  Mic,
  History,
  FileText,
  Sparkles,
  BookOpen,
  Cpu,
  BarChart3,
  Settings,
  HelpCircle,
  Sun,
  Moon,
  Search,
  Shield,
  X,
  CheckCircle2,
  AlertCircle,
  PanelTop,
} from "lucide-react";
import HomeView from "./components/HomeView";
import HistoryView from "./components/HistoryView";
import VaniNotes from "./components/VaniNotes";
import ModesView from "./components/ModesView";
import DictionaryView from "./components/DictionaryView";
import ModelsView from "./components/ModelsView";
import UsageView from "./components/UsageView";
import HudStudioView from "./components/HudStudioView";
import SettingsPanel from "./components/SettingsPanel";
import Onboarding from "./components/Onboarding";
import CommandPalette from "./components/CommandPalette";
import { VaniLogo } from "./components/VaniLogo";

function getInitialSystemInfo() {
  const isMac =
    typeof window !== "undefined" && window.vani
      ? window.vani.platform === "darwin"
      : typeof navigator !== "undefined"
      ? navigator.platform.toLowerCase().includes("mac")
      : true;
  const isWindows = !isMac;
  return isMac
    ? {
        os: "macos",
        arch: "aarch64",
        isMac: true,
        isWindows: false,
        appleAiSupported: true,
        pushToTalkKey: "⌥ Option",
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
        modifierSymbol: "Ctrl+",
        dashboardHotkey: "Ctrl+Shift+D",
        dictateHotkey: "Ctrl+Shift+Space",
        osName: "Windows",
        fileManagerName: "Explorer",
        gpuBackend: "CPU + ONNX Runtime",
      };
}

const INITIAL_SYS = getInitialSystemInfo();

const defaultSettings = {
  language: "auto",
  hotkey: "CommandOrControl+Shift+Space",
  autoInject: true,
  autoStopOnSilence: true,
  silenceDurationMs: 2000,
  startAtLogin: false,
  whisperModel: "ggml-base.en",
  threads: 4,
  translate: false,
  customVocabulary: "",
  snippets: [],
  theme: "dark",
  openaiKey: "",
  anthropicKey: "",
  transcriptionProvider: INITIAL_SYS.isMac ? "apple" : "local",
  cleanupProvider: INITIAL_SYS.isMac ? "apple" : "none",
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

function buildNavGroups(sys) {
  const mod = sys.modifierSymbol || "⌘";
  return {
    primary: [
      { key: "home", label: "VANI Studio", icon: Mic, shortcut: `${mod}1` },
      { key: "history", label: "History", icon: History, shortcut: `${mod}2` },
      { key: "notes", label: "Voice Notes", icon: FileText, shortcut: `${mod}3` },
    ],
    workflow: [
      { key: "hud", label: sys.isMac ? "HUD & Menu Bar" : "HUD & System Tray", icon: PanelTop, shortcut: `${mod}4` },
      { key: "modes", label: "Modes & Pipeline", icon: Sparkles, shortcut: `${mod}5` },
      { key: "dictionary", label: "Dictionary & Snippets", icon: BookOpen, shortcut: `${mod}6` },
      { key: "models", label: "Speech Models", icon: Cpu, shortcut: `${mod}7` },
      { key: "usage", label: "Analytics", icon: BarChart3, shortcut: `${mod}8` },
    ],
  };
}

function HelpModal({ systemInfo, onClose }) {
  const sys = systemInfo || INITIAL_SYS;
  const mod = sys.modifierSymbol;
  const items = [
    {
      title: "How does push-to-talk work?",
      body: `Hold ${sys.pushToTalkKey} in any ${sys.osName} app (Slack, Gmail, Cursor, Notes). Speak normally, then release — VANI transcribes locally and pastes cleanly at your cursor.`,
    },
    {
      title: sys.isMac ? "Does any audio leave my Mac?" : "Does any audio leave my PC?",
      body: "Never in local mode. VANI compiles whisper-rs and ONNX Runtime directly into the app binary. Turn on Privacy Shield to guarantee zero cloud calls and zero local history logging.",
    },
    {
      title: "Which model should I choose?",
      body: "Start with Base (English, 142 MB) for instant responses. Upgrade to Large v3 Turbo (1.6 GB) for top accuracy across 99 languages, or import NVIDIA Parakeet ONNX for ultra-fast English speech.",
    },
    {
      title: "Keyboard shortcuts inside VANI",
      body: `Press ${mod}K for the Quick Command Palette, ${mod}1–${mod}8 to jump between views, ${mod}, for Settings, and ${sys.dashboardHotkey} from anywhere on ${sys.osName} to toggle the VANI window.`,
    },
  ];

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--modal-backdrop)] p-4 backdrop-blur-md"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="animate-scale-in flex w-full max-w-[600px] flex-col overflow-hidden rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-surface)] shadow-[var(--shadow-modal)]">
        <div className="flex items-center justify-between border-b border-[var(--border)] px-6 py-4">
          <div className="flex items-center gap-2">
            <HelpCircle className="h-4 w-4 text-[var(--brand)]" />
            <p className="text-sm font-semibold text-[var(--text)]">How VANI Works</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-7 w-7 place-items-center rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--muted)] transition hover:text-[var(--text)]"
            aria-label="Close help"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="divide-y divide-[var(--border)] px-6 py-2">
          {items.map((item) => (
            <div key={item.title} className="py-4">
              <p className="text-sm font-semibold text-[var(--text)]">{item.title}</p>
              <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">{item.body}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SidebarNavItem({ item, active, badge, onClick }) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group flex w-full items-center justify-between gap-2 rounded-xl px-2.5 py-2 text-left transition ${
        active
          ? "bg-[var(--bg-active)] text-[var(--brand)] font-semibold"
          : "text-[var(--text-soft)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]"
      }`}
    >
      <span className="flex min-w-0 items-center gap-2.5">
        <Icon className={`h-4 w-4 shrink-0 ${active ? "text-[var(--brand)]" : "text-[var(--muted)] group-hover:text-[var(--text-soft)]"}`} />
        <span className="truncate text-[13px]">{item.label}</span>
      </span>
      {badge !== undefined && badge !== null && badge > 0 && (
        <span
          className={`shrink-0 rounded-full px-1.5 py-0.5 font-mono text-[10px] tabular-nums ${
            active
              ? "bg-[var(--brand)]/20 text-[var(--brand)]"
              : "bg-[var(--bg-elevated)] text-[var(--muted)]"
          }`}
        >
          {badge}
        </span>
      )}
    </button>
  );
}

export default function App() {
  const [systemInfo, setSystemInfo] = useState(INITIAL_SYS);
  const [active, setActive] = useState("home");
  const [helpOpen, setHelpOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [settings, setSettings] = useState(defaultSettings);
  const [history, setHistory] = useState([]);
  const [notes, setNotes] = useState([]);
  const [models, setModels] = useState([]);
  const [downloads, setDownloads] = useState({});
  const [whisperStatus, setWhisperStatus] = useState({ binaryFound: true, modelInstalled: false });
  const [appleAi, setAppleAi] = useState({
    foundationModelAvailable: false,
    foundationModelReason: "checking",
    speechAnalyzerAvailable: false,
    macosVersion: "",
    helperFound: false,
  });
  const [permissions, setPermissions] = useState({ microphone: "unknown", accessibility: true });
  const [appError, setAppError] = useState("");
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [hotkeyError, setHotkeyError] = useState("");
  const [toast, setToast] = useState(null);

  const notify = useCallback((message, type = "ok") => {
    const id = Date.now();
    setToast({ id, message, type });
    setTimeout(() => {
      setToast((curr) => (curr?.id === id ? null : curr));
    }, 2600);
  }, []);

  const refreshModels = useCallback(async () => {
    const next = await window.vani?.listModels?.();
    if (next) setModels(next);
  }, []);

  const refreshStatus = useCallback(async () => {
    const status = await window.vani?.whisperStatus?.();
    if (status) setWhisperStatus(status);
  }, []);

  const recheckPermissions = useCallback(async () => {
    const p = await window.vani?.checkPermissions?.();
    if (p) setPermissions(p);
    await refreshStatus();
  }, [refreshStatus]);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const [sysInfo, savedSettings, nextNotes, nextHistory, nextModels, nextPermissions, status, appleStatus] = await Promise.all([
        window.vani?.getSystemInfo?.(),
        window.vani?.getSettings?.(),
        window.vani?.listNotes?.(),
        window.vani?.getHistory?.(),
        window.vani?.listModels?.(),
        window.vani?.checkPermissions?.(),
        window.vani?.whisperStatus?.(),
        window.vani?.appleAiStatus?.(),
      ]);

      if (!mounted) return;
      const effectiveSys = sysInfo ? { ...INITIAL_SYS, ...sysInfo } : INITIAL_SYS;
      setSystemInfo(effectiveSys);
      if (savedSettings) {
        const sanitized = { ...savedSettings };
        if (!effectiveSys.isMac) {
          if (sanitized.transcriptionProvider === "apple") sanitized.transcriptionProvider = "local";
          if (sanitized.cleanupProvider === "apple") sanitized.cleanupProvider = "none";
        }
        setSettings((current) => ({ ...current, ...sanitized }));
        if (savedSettings.onboardingComplete === false) setShowOnboarding(true);
      }
      setNotes(nextNotes || []);
      setHistory(nextHistory || []);
      setModels(nextModels || []);
      setPermissions(nextPermissions || { microphone: "unknown", accessibility: true });
      if (status) setWhisperStatus(status);
      if (appleStatus) setAppleAi(appleStatus);
    };

    load();

    const offSettings = window.vani?.onSettingsUpdated?.((nextSettings) => {
      setSettings((curr) => ({ ...curr, ...nextSettings }));
      refreshStatus();
    });
    const offSection = window.vani?.onOpenMainWindow?.((section) => {
      if (section === "settings") setActive("settings");
      else if (section === "overview" || !section) setActive("home");
      else setActive(section);
    });
    const offHistory = window.vani?.onHistoryUpdated?.(async () => {
      const next = await window.vani?.getHistory?.();
      if (next) setHistory(next);
    });
    const offProgress = window.vani?.onModelDownloadProgress?.((p) => {
      setDownloads((curr) => ({ ...curr, [p.modelId]: { received: p.received, total: p.total } }));
    });
    const offHotkey = window.vani?.onHotkeyValidationFailed?.((revertedTo) => {
      setHotkeyError(revertedTo);
      setTimeout(() => setHotkeyError(""), 4500);
    });
    const offDone = window.vani?.onModelDownloadDone?.(async ({ modelId, ok, error }) => {
      setDownloads((curr) => {
        const next = { ...curr };
        delete next[modelId];
        return next;
      });
      if (!ok && error) setAppError(error);
      if (ok) notify(`Downloaded ${modelId}`);
      await refreshModels();
      await refreshStatus();
    });

    const onFocus = () => {
      recheckPermissions();
    };
    window.addEventListener("focus", onFocus);

    return () => {
      mounted = false;
      window.removeEventListener("focus", onFocus);
      offSettings?.();
      offSection?.();
      offHistory?.();
      offProgress?.();
      offDone?.();
      offHotkey?.();
    };
  }, [notify, refreshModels, refreshStatus]);

  useEffect(() => {
    const theme = settings.theme || "dark";
    document.documentElement.setAttribute("data-theme", theme);
    const favicon = document.querySelector("link[rel='icon']");
    if (favicon) favicon.href = theme === "dark" ? "/vani-icon-dark.png" : "/vani-icon-light.png";
  }, [settings.theme]);

  // Global keyboard shortcuts (⌘K, ⌘1-7, ⌘,)
  useEffect(() => {
    const onKeyDown = (e) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const k = e.key.toLowerCase();
      if (k === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      } else if (k === ",") {
        e.preventDefault();
        setActive("settings");
      } else if (k >= "1" && k <= "8") {
        const keys = ["home", "history", "notes", "hud", "modes", "dictionary", "models", "usage"];
        const target = keys[Number(k) - 1];
        if (target) {
          e.preventDefault();
          setActive(target);
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const saveSettings = useCallback((partialSettings) => {
    setSettings((curr) => ({ ...curr, ...partialSettings }));
    window.vani?.saveSettings?.(partialSettings);
  }, []);

  const saveNote = useCallback(async (note) => {
    const next = await window.vani?.saveNote?.(note);
    if (next) setNotes([...next]);
  }, []);

  const deleteNote = useCallback(async (noteId) => {
    const next = await window.vani?.deleteNote?.(noteId);
    if (next) setNotes([...next]);
  }, []);

  const saveTextAsNote = useCallback(
    async (text) => {
      if (!text?.trim()) return;
      const firstLine = text.split("\n")[0].slice(0, 50) || "Voice Transcript";
      const note = {
        id: `note-${Date.now()}`,
        title: firstLine,
        content: `# ${firstLine}\n\n${text}`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await saveNote(note);
      setActive("notes");
      notify("Saved transcript to Voice Notes");
    },
    [saveNote, notify]
  );

  const handleDownloadModel = async (modelId) => {
    setAppError("");
    setDownloads((curr) => ({ ...curr, [modelId]: { received: 0, total: 0 } }));
    try {
      await window.vani?.downloadModel?.(modelId);
    } catch (error) {
      setAppError(error.message || "Download failed.");
    }
  };

  const handleCancelDownload = async (modelId) => {
    await window.vani?.cancelModelDownload?.(modelId);
  };

  const handleDeleteModel = async (modelId) => {
    await window.vani?.deleteModel?.(modelId);
    await refreshModels();
    await refreshStatus();
    notify(`Removed ${modelId}`);
  };

  const handleSetActiveModel = (modelId) => {
    saveSettings({ whisperModel: modelId, transcriptionProvider: "local" });
    refreshStatus();
    notify(`Switched speech engine to ${modelId}`);
  };

  const handleImportParakeet = async (modelId) => {
    try {
      if (window.vani?.isPreview) {
        const res = await window.vani.importParakeetModel("preview.onnx", modelId);
        if (res?.ok) {
          await refreshModels();
          saveSettings({ whisperModel: modelId });
          notify(`Imported ${modelId}`);
        }
        return;
      }
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({ filters: [{ name: "ONNX model", extensions: ["onnx"] }], multiple: false });
      if (!selected) return;
      const path = typeof selected === "string" ? selected : selected.path;
      const result = await window.vani?.importParakeetModel?.(path, modelId);
      if (result?.ok) {
        await refreshModels();
        saveSettings({ whisperModel: modelId });
        notify(`Imported ${modelId}`);
      } else {
        setAppError("Import failed.");
      }
    } catch (e) {
      setAppError(e.message || "Import failed.");
    }
  };

  const handleClearHistory = async () => {
    const next = await window.vani?.clearHistory?.();
    setHistory(next || []);
  };

  const handleReinject = async (text) => {
    try {
      await window.vani?.injectText?.(text);
      notify("Sent transcript to active app");
    } catch (e) {
      notify(e.message || "Could not inject text", "error");
    }
  };

  const activeDownloadCount = Object.keys(downloads).length;
  const navGroups = buildNavGroups(systemInfo);
  const usingAppleStt = systemInfo.isMac && settings.transcriptionProvider === "apple";

  const renderContent = () => {
    switch (active) {
      case "home":
        return (
          <HomeView
            settings={settings}
            systemInfo={systemInfo}
            onSaveSettings={saveSettings}
            permissions={permissions}
            whisperStatus={whisperStatus}
            appleAi={appleAi}
            models={models}
            history={history}
            onNavigate={setActive}
            onSaveAsNote={saveTextAsNote}
            onNotify={notify}
          />
        );
      case "history":
        return (
          <HistoryView
            history={history}
            systemInfo={systemInfo}
            onClear={handleClearHistory}
            onSaveAsNote={saveTextAsNote}
            onReinject={handleReinject}
            onNotify={notify}
          />
        );
      case "notes":
        return (
          <VaniNotes
            notes={notes}
            systemInfo={systemInfo}
            onSaveNote={saveNote}
            onDeleteNote={deleteNote}
            onExportNote={(note) => window.vani?.exportNote?.(note)}
            onNotify={notify}
          />
        );
      case "hud":
        return (
          <HudStudioView
            settings={settings}
            systemInfo={systemInfo}
            onSaveSettings={saveSettings}
            onNavigate={setActive}
            onNotify={notify}
          />
        );
      case "modes":
        return (
          <ModesView
            settings={settings}
            systemInfo={systemInfo}
            appleAi={appleAi}
            onSaveSettings={saveSettings}
            onNotify={notify}
          />
        );
      case "dictionary":
        return <DictionaryView settings={settings} onSaveSettings={saveSettings} onNotify={notify} />;
      case "models":
        return (
          <ModelsView
            models={models}
            downloads={downloads}
            activeModel={settings.whisperModel}
            settings={settings}
            systemInfo={systemInfo}
            appleAi={appleAi}
            onSaveSettings={saveSettings}
            onDownload={handleDownloadModel}
            onCancel={handleCancelDownload}
            onDelete={handleDeleteModel}
            onSetActive={handleSetActiveModel}
            onImport={handleImportParakeet}
            onOpenModelsDir={() => window.vani?.openModelsDir?.()}
            onNotify={notify}
            error={appError}
          />
        );
      case "usage":
        return <UsageView history={history} />;
      case "settings":
        return (
          <SettingsPanel
            settings={settings}
            systemInfo={systemInfo}
            onChange={saveSettings}
            models={models}
            whisperStatus={whisperStatus}
            appleAi={appleAi}
            permissions={permissions}
            onRecheckPermissions={recheckPermissions}
            onOpenModelsDir={() => window.vani?.openModelsDir?.()}
            onReplayOnboarding={() => setShowOnboarding(true)}
            hotkeyError={hotkeyError}
            onNotify={notify}
          />
        );
      default:
        return null;
    }
  };

  return (
    <main className="flex h-screen w-screen overflow-hidden bg-[var(--bg-app)] text-[var(--text)]">
      {/* Left macOS Sidebar */}
      <aside className="flex w-[238px] shrink-0 flex-col border-r border-[var(--border)] bg-[var(--bg-sidebar)] px-3 py-4">
        {/* Brand Header */}
        <div className="flex items-center justify-between px-2">
          <div className="flex items-center gap-2.5">
            <VaniLogo size={32} />
            <div>
              <div className="flex items-center gap-1.5">
                <p className="text-sm font-bold tracking-tight text-[var(--text)]">VANI</p>
                {window.vani?.isPreview && (
                  <span className="rounded bg-[var(--brand-soft)] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-[var(--brand)]">
                    Demo
                  </span>
                )}
              </div>
              <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--muted)]">
                Local Dictation
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => saveSettings({ theme: settings.theme === "dark" ? "light" : "dark" })}
            className="grid h-7 w-7 place-items-center rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] text-[var(--muted)] transition hover:border-[var(--border-strong)] hover:text-[var(--text)]"
            aria-label={settings.theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            title={settings.theme === "dark" ? "Light mode" : "Dark mode"}
          >
            {settings.theme === "dark" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
          </button>
        </div>

        {/* ⌘K Command Trigger */}
        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          className="mt-4 flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2 text-xs text-[var(--muted)] transition hover:border-[var(--border-strong)] hover:text-[var(--text)]"
        >
          <span className="flex items-center gap-2">
            <Search className="h-3.5 w-3.5" />
            <span>Quick actions…</span>
          </span>
          <kbd className="vani-kbd font-mono text-[10px]">{systemInfo.modifierSymbol}K</kbd>
        </button>

        {/* Navigation Groups */}
        <nav className="mt-4 flex-1 space-y-5 overflow-y-auto pr-0.5">
          <div className="space-y-0.5">
            {navGroups.primary.map((item) => (
              <SidebarNavItem
                key={item.key}
                item={item}
                active={active === item.key}
                badge={item.key === "history" ? history.length : item.key === "notes" ? notes.length : undefined}
                onClick={() => setActive(item.key)}
              />
            ))}
          </div>

          <div>
            <p className="mb-1.5 px-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted-strong)]">
              Intelligence
            </p>
            <div className="space-y-0.5">
              {navGroups.workflow.map((item) => (
                <SidebarNavItem
                  key={item.key}
                  item={item}
                  active={active === item.key}
                  badge={item.key === "models" && activeDownloadCount > 0 ? activeDownloadCount : undefined}
                  onClick={() => setActive(item.key)}
                />
              ))}
            </div>
          </div>
        </nav>

        {/* Live Engine Status Card */}
        <div className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-3">
          <div className="flex items-center justify-between text-[11px]">
            <span className="flex items-center gap-1.5 font-medium text-[var(--text)]">
              <span
                className={`h-2 w-2 rounded-full ${
                  usingAppleStt ||
                  whisperStatus?.modelInstalled ||
                  settings.transcriptionProvider === "openai"
                    ? "bg-[var(--emerald)]"
                    : "bg-[var(--amber)]"
                }`}
              />
              {settings.privacyMode ? "Privacy Shield" : "Engine Ready"}
            </span>
            {settings.privacyMode && <Shield className="h-3 w-3 text-[var(--emerald)]" />}
          </div>
          <p className="mt-1 truncate font-mono text-[10px] text-[var(--muted)]">
            {usingAppleStt
              ? "Apple On-Device"
              : settings.whisperModel}{" "}
            · {settings.cleanupContext || "general"}
          </p>
          <div className="mt-2 flex items-center justify-between border-t border-[var(--border)] pt-2 text-[10px] text-[var(--muted)]">
            <span>Hold to speak</span>
            <kbd className="vani-kbd font-mono text-[10px]">{systemInfo.pushToTalkKey}</kbd>
          </div>
        </div>

        {/* Footer Utility Nav */}
        <div className="mt-2.5 space-y-0.5 border-t border-[var(--border)] pt-2.5">
          <SidebarNavItem
            item={{ key: "help", label: "How VANI Works", icon: HelpCircle }}
            active={helpOpen}
            onClick={() => setHelpOpen(true)}
          />
          <SidebarNavItem
            item={{ key: "settings", label: "Settings", icon: Settings }}
            active={active === "settings"}
            onClick={() => setActive("settings")}
          />
        </div>
      </aside>

      {/* Main Content Stage */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6 lg:px-10 lg:py-8">
          <div
            className={`mx-auto w-full ${
              active === "notes"
                ? "flex h-full min-h-full max-w-[1520px] flex-col"
                : "max-w-[1360px]"
            }`}
          >
            {renderContent()}
          </div>
        </div>
      </div>

      {/* Toast Notification */}
      {toast && (
        <div className="animate-scale-in fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-4 py-2.5 text-xs font-medium text-[var(--text)] shadow-[var(--shadow-modal)]">
          {toast.type === "error" ? (
            <AlertCircle className="h-4 w-4 text-[var(--danger)]" />
          ) : (
            <CheckCircle2 className="h-4 w-4 text-[var(--emerald)]" />
          )}
          <span>{toast.message}</span>
        </div>
      )}

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        settings={settings}
        systemInfo={systemInfo}
        onNavigate={setActive}
        onSaveSettings={saveSettings}
        onNotify={notify}
      />

      {helpOpen && <HelpModal systemInfo={systemInfo} onClose={() => setHelpOpen(false)} />}

      {showOnboarding && (
        <Onboarding
          systemInfo={systemInfo}
          onComplete={() => setShowOnboarding(false)}
          onSaveKeys={(keys) => saveSettings(keys)}
          whisperStatus={whisperStatus}
          models={models}
          downloads={downloads}
          onDownloadModel={handleDownloadModel}
        />
      )}
    </main>
  );
}

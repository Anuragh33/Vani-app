<p align="center">
  <img src="https://raw.githubusercontent.com/Anuragh33/Vani/main/banner.png" alt="VANI — Best Local-First Voice Dictation for Windows & macOS" width="100%" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Windows-10%20%2F%2011%20x64-0078D6?style=flat-square&logo=windows&logoColor=white" />
  <img src="https://img.shields.io/badge/macOS-11%2B%20%7C%20Apple%20Silicon-09090b?style=flat-square&logo=apple&logoColor=white" />
  <img src="https://img.shields.io/badge/Tauri-v2-24C8DB?style=flat-square&logo=tauri&logoColor=white" />
  <img src="https://img.shields.io/badge/Rust%20%2B%20Win32%20%2B%20Swift%206-Native%20AI-f472b6?style=flat-square" />
  <img src="https://img.shields.io/github/v/release/Anuragh33/Vani-app?style=flat-square&color=ec4899&label=release" />
  <img src="https://img.shields.io/badge/license-MIT-34d399?style=flat-square" />
</p>

<p align="center">
  <strong>VANI (वाणी — Sanskrit for <em>Voice</em>)</strong><br/>
  <strong>Best Offline Voice Dictation &amp; Hands-Free Vani Actions for Windows — with Full Apple On-Device AI on macOS.</strong><br/>
  Hold <code>Right Alt</code> / <code>⌥ Option</code> for Push-to-Talk, or tap <code>Right Alt + Ctrl</code> / <code>⌥ + ⌘</code> for true Hands-Free mode with auto-send.
</p>

<p align="center">
  <a href="https://github.com/Anuragh33/Vani-app/releases/download/v2.1.0/VANI-2.1.0-windows-x64-setup.exe">
    <img src="https://img.shields.io/badge/Download%20for%20Windows-VANI%202.1.0%20(.exe)-0078D6?style=for-the-badge&logo=windows&logoColor=white" />
  </a>
  &nbsp;
  <a href="https://github.com/Anuragh33/Vani-app/releases/download/v2.1.0/VANI-2.1.0-macos-arm64.dmg">
    <img src="https://img.shields.io/badge/Download%20for%20macOS-VANI%202.1.0%20(.dmg)-ec4899?style=for-the-badge&logo=apple&logoColor=white" />
  </a>
  &nbsp;
  <a href="https://github.com/Anuragh33/Vani">
    <img src="https://img.shields.io/badge/Website-Anuragh33%2FVani-18181b?style=for-the-badge&logo=github&logoColor=white" />
  </a>
</p>

---

## Why VANI 2.1?

Most top local AI dictation apps are **Mac-only** — leaving Windows users with costly cloud subscriptions or limited built-in speech tools. **VANI 2.1** changes that:

1. **Engineered to Be the Best Offline Dictation App on Windows 10 & 11**
   - Native Rust + Win32 architecture: **WASAPI** audio capture (`cpal`), global **`Right Alt`** push-to-talk hook (`WH_KEYBOARD_LL`), non-focus-stealing floating HUD (`set_focusable(false)`), and instant clipboard + **`Ctrl+V`** paste (`arboard` + Win32 `SendInput`).
   - Built-in **Whisper GGML** (`whisper-rs`, 99 languages) and **NVIDIA Parakeet ONNX** (`ort` static runtime) — zero Python or external runtimes.
   - **100% OS-Aware UI:** Automatically detects Windows and hides all Apple/macOS-only cards, dropdowns, and diagnostics so Windows users get a clean, purpose-built interface with native Windows shortcuts (`Right Alt`, `Ctrl+K`, `Ctrl+Shift+D`, Explorer, System Tray).
2. **Full Apple On-Device AI on macOS (Zero Downloads, Zero API Keys)**
   - Automatically unlocks macOS 26+ **`SpeechAnalyzer`** (Neural Engine STT) and **`FoundationModels`** (`SystemLanguageModel`) for on-device grammar, filler-word, and mode cleanup — plus **Whisper Metal GPU** and **Parakeet ONNX**.
3. **Optional Cloud BYOK**
   - Bring your own Anthropic or OpenAI keys anytime (automatically blocked whenever **Privacy Shield** is enabled).

---

## Cross-Platform Architecture

| Layer | Windows 10 / 11 (`x86_64-pc-windows-msvc`) | macOS (`aarch64-apple-darwin`) |
|---|---|---|
| **Desktop Shell** | Tauri v2 (Rust) + React 19 + Tailwind CSS + Vite | Tauri v2 (Rust) + React 19 + Tailwind CSS + Vite |
| **Native Audio Capture** | `src-tauri/src/win_audio.rs` (`cpal` WASAPI 16 kHz WAV + live RMS levels) | Bundled Swift 6 `vani-apple-ai` (`AVAudioEngine` CoreAudio) |
| **Global Push-to-Talk** | Win32 `SetWindowsHookExW(WH_KEYBOARD_LL)` on **`Right Alt`** (`VK_RMENU`) | CoreGraphics `CGEventTap` on **`⌥ Option`** with `AXIsProcessTrusted()` auto-retry |
| **Text Injection** | `arboard` clipboard + `SetForegroundWindow` + Win32 `SendInput` (`Ctrl+V`) | `pbcopy` + AppleScript `Cmd+V` into frontmost app |
| **Speech Recognition** | `whisper-rs` 0.14 (local CPU) + `ort` static ONNX Runtime (NVIDIA Parakeet) | Apple `SpeechAnalyzer` + `whisper-rs` (**Metal GPU**) + `ort` ONNX Runtime |
| **AI Cleanup** | Local rules + filler removal + snippets (+ optional BYOK Claude / OpenAI) | Apple `FoundationModels` on-device LLM + local rules (+ optional BYOK) |
| **System Tray / Menu Bar** | High-contrast 36×36 RGBA taskbar icon (`tray_icons.rs`) | Native `@2x` Retina template & accent menu bar icons (`tray_icons.rs`) |
| **CI/CD Releases** | Automated GitHub Actions `.exe` (NSIS) + `.msi` | Automated GitHub Actions `.dmg` (Apple Silicon) |

---

## Highlights

- **VANI Studio (`Ctrl+1` / `⌘1`)** — Live dictation playground with reactive Breathwave SVG waveform, Raw vs. Cleaned diff view, Privacy Shield toggle, and KPI strip.
- **Hands-Free Vani Actions (`Ctrl+5` / `⌘5`)** — Tap **`Right Alt + Ctrl`** (Windows) or **`⌥ + ⌘`** (macOS) once for completely hands-free control: open desktop or web apps (*"Open Antigravity"*, *"Open Apple Music"*, *"Open ChatGPT"*, *"Open Claude"*), auto-focus chat inputs, and send messages directly without pressing Enter!
- **Floating HUD & System Tray / Menu Bar Studio (`Ctrl+4` / `⌘4`)** — Live customizable overlay with 3 styles (`Breathwave`, `Equalizer Bars`, `Minimal Pill`), 4 screen positions, and 4 tray icon styles — with a live **Windows 11 taskbar** or **macOS menu bar** simulator matching your OS.
- **Minimal HUD Flow** — Hold **`Right Alt`** / **`⌥ Option`** (waveform) → release (**`Transcribing…`** orbiting dots) → pastes directly at your cursor and disappears cleanly.
- **Modes & Pipeline (`Ctrl+6` / `⌘6`)** — 5 context formatting modes (`General`, `Email`, `Slack`, `Notes`, `Code`) with an interactive pipeline simulator.
- **Dictionary & Snippets (`Ctrl+7` / `⌘7`)** — Chip-based personal dictionary with domain starter packs + voice snippet triggers with a live expansion tester.
- **Voice Notes (`Ctrl+3` / `⌘3`)** — Split-screen Markdown editor with inline voice dictation and `.md` export.
- **History (`Ctrl+2` / `⌘2`) & Analytics (`Ctrl+9` / `⌘9`)** — Searchable date-grouped transcripts with Raw/Cleaned diffs, 7-day dictation chart, and an interactive Voice vs. Keyboard speed calculator.
- **Quick Command Palette (`Ctrl+K` / `⌘K`)** — Instant keyboard navigation and actions across the entire app.

---

## Install Prebuilt Releases

### Windows 10 / 11 (x64)
1. Download **[VANI-2.1.0-windows-x64-setup.exe](https://github.com/Anuragh33/Vani-app/releases/download/v2.1.0/VANI-2.1.0-windows-x64-setup.exe)** or **[VANI-2.1.0-windows-x64.msi](https://github.com/Anuragh33/Vani-app/releases/download/v2.1.0/VANI-2.1.0-windows-x64.msi)**.
2. Run the installer (if SmartScreen prompts, click **More info → Run anyway**).
3. Open **Speech Models** and download a local Whisper model (e.g. `Base (English)` 142 MB).
4. Hold **`Right Alt`** anywhere on Windows to speak and paste (or press **`Ctrl+Shift+Space`** / click the taskbar tray icon).

### macOS (Apple Silicon)
1. Download **[VANI-2.1.0-macos-arm64.dmg](https://github.com/Anuragh33/Vani-app/releases/download/v2.1.0/VANI-2.1.0-macos-arm64.dmg)** and drag **VANI.app** into **Applications**.
2. Clear the Gatekeeper quarantine flag once:
   ```sh
   xattr -dr com.apple.quarantine /Applications/VANI.app
   ```
3. Enable **Microphone**, **Speech Recognition**, and **Accessibility** under **System Settings → Privacy & Security**.
4. Hold **`⌥ Option`** in any app to speak and paste (or press **`⌘⇧Space`** / click the menu bar icon).

---

## Build from Source

### Windows 10 / 11
Prerequisites: Node.js 20+, Rust (`rustup`), Visual Studio C++ Build Tools, and LLVM/Clang (`LIBCLANG_PATH` for `whisper-rs`).
```powershell
git clone -b tauri-v2 https://github.com/Anuragh33/Vani-app.git
cd Vani-app
npm install
npx tauri build --bundles nsis,msi
```

### macOS (Apple Silicon)
Prerequisites: macOS 11+ (macOS 26+ for Apple `FoundationModels` & `SpeechAnalyzer`), Node.js 20+, Rust, Command Line Tools (`swiftc`).
```sh
git clone -b tauri-v2 https://github.com/Anuragh33/Vani-app.git
cd Vani-app
npm install

# 1. Compile the native Swift 6 Apple AI & CoreAudio helper
mkdir -p src-tauri/bin
swiftc -O -parse-as-library src-tauri/swift/vani_apple_ai.swift -o src-tauri/bin/vani-apple-ai

# 2. Build the Tauri v2 macOS app bundle (with Metal GPU whisper-rs)
npx tauri build --bundles app

# 3. Ad-hoc sign with Microphone & Apple Events entitlements
APP="src-tauri/target/release/bundle/macos/VANI.app"
codesign --force --deep --sign - --identifier com.vani.app \
  --entitlements src-tauri/entitlements.plist "$APP"
```

### Browser UI Preview (Test Both macOS & Windows UIs)
```sh
npm run dev
# macOS UI preview:   http://localhost:5173/?window=dashboard
# Windows UI preview: http://localhost:5173/?window=dashboard&previewOs=windows
```

---

## Branches

- **`tauri-v2`** *(current release — v2.1.0)*: Cross-platform Windows 10/11 + macOS Tauri v2 desktop app with native Win32/WASAPI, Apple On-Device AI, Whisper GGML, NVIDIA Parakeet ONNX, and dual-OS GitHub Actions CI.
- **`main`**: Earlier standalone macOS Swift 6 v0.1 prototype.

---

<p align="center">Made by <a href="https://github.com/Anuragh33">Anuragh</a></p>

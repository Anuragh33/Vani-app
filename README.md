<p align="center">
  <img src="https://raw.githubusercontent.com/Anuragh33/Vani/main/banner.png" alt="VANI — Hybrid On-Device Voice Dictation for macOS" width="100%" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/macOS-11%2B%20%7C%20Apple%20Silicon-09090b?style=flat-square&logo=apple&logoColor=white" />
  <img src="https://img.shields.io/badge/Tauri-v2-24C8DB?style=flat-square&logo=tauri&logoColor=white" />
  <img src="https://img.shields.io/badge/Rust%20%2B%20Swift%206-Hybrid%20AI-f472b6?style=flat-square" />
  <img src="https://img.shields.io/github/v/release/Anuragh33/Vani-app?style=flat-square&color=ec4899&label=release" />
  <img src="https://img.shields.io/badge/license-MIT-34d399?style=flat-square" />
</p>

<p align="center">
  <strong>Hold ⌥ Option. Speak. Done.</strong><br/>
  Hybrid on-device macOS voice dictation studio combining Apple’s built-in <code>FoundationModels</code> + <code>SpeechAnalyzer</code> with GPU-accelerated open-source <code>whisper-rs</code> (Metal) &amp; NVIDIA Parakeet ONNX.
</p>

<p align="center">
  <a href="https://github.com/Anuragh33/Vani-app/releases/download/v2.1.0/VANI-2.1.0.dmg">
    <img src="https://img.shields.io/badge/Download-VANI%202.1.0%20(.dmg)-ec4899?style=for-the-badge&logo=apple&logoColor=white" />
  </a>
  &nbsp;
  <a href="https://github.com/Anuragh33/Vani">
    <img src="https://img.shields.io/badge/Website%20Repo-Anuragh33%2FVani-18181b?style=for-the-badge&logo=github&logoColor=white" />
  </a>
</p>

---

## Why VANI 2.1?

Most macOS dictation tools force you to choose between cloud subscriptions, heavy model downloads, or no AI cleanup. **VANI 2.1** gives you **both** in one local-first app:

1. **Apple On-Device AI (Zero Downloads, Zero API Keys)** — Uses macOS 26+ **`SpeechAnalyzer`** for instant Neural Engine speech-to-text and **`FoundationModels`** (`SystemLanguageModel`) for true on-device grammar, filler-word, and mode formatting (`General`, `Email`, `Slack`, `Notes`, `Code`).
2. **Open-Source Local Models** — Switch anytime to **Whisper GGML** (`whisper-rs` compiled with **Apple Silicon Metal GPU** acceleration across 99 languages) or **NVIDIA Parakeet ONNX** (`ort` runtime).
3. **Optional Cloud BYOK** — Bring your own Anthropic or OpenAI keys if desired (automatically bypassed whenever **Privacy Shield** is enabled).

---

## Highlights

- **VANI Studio (`⌘1`)** — Live dictation playground with reactive Breathwave SVG waveform, Raw vs. Cleaned diff view, Privacy Shield toggle, and KPI strip.
- **Floating HUD & Menu Bar Studio (`⌘4`)** — Live customizable overlay with 3 waveform styles (`Breathwave`, `Equalizer Bars`, `Minimal Pill`), 4 screen positions (`Top Left`, `Top Center`, `Top Right`, `Bottom Center`), and 4 live Retina macOS Menu Bar icon styles (`Native Template`, `Rose Accent`, `Animated Live`, `Minimal + Dot`).
- **Clean Background Behavior** — Opens VANI Studio on launch; closing the window hides the Dock icon (`ActivationPolicy::Accessory`) while VANI stays ready in the menu bar. Selecting **Open VANI Studio** or **Settings…** brings both the window and Dock icon back.
- **Minimal HUD Flow** — Hold **`⌥ Option`** (recording waveform) → release (**`Transcribing…`** orbiting dots) → pastes directly at your cursor and disappears cleanly.
- **Modes & Pipeline (`⌘5`)** — 5 context formatting modes with an interactive pipeline simulator and one-click **Test Apple LLM** preview.
- **Dictionary & Snippets (`⌘6`)** — Chip-based personal dictionary with domain starter packs + voice snippet triggers with a live expansion tester.
- **Voice Notes (`⌘3`)** — Split-screen Markdown editor with inline voice dictation and `.md` export.
- **History (`⌘2`) & Analytics (`⌘8`)** — Searchable date-grouped transcripts with Raw/Cleaned diffs, 7-day dictation chart, and an interactive Voice vs. Keyboard speed calculator.
- **Quick Command Palette (`⌘K`)** — Instant keyboard navigation and actions across the entire app.

---

## Architecture

| Layer | Implementation |
|---|---|
| **Desktop Shell** | Tauri v2 (Rust) + React 19 + Tailwind CSS + Vite |
| **Apple On-Device AI Helper** | Bundled Swift 6 binary (`src-tauri/swift/vani_apple_ai.swift` → `vani-apple-ai`) providing `AVAudioEngine` 16 kHz CoreAudio capture, `SpeechAnalyzer` STT, `FoundationModels` LLM polish, and native TCC permission checks |
| **Open-Source STT** | `whisper-rs` 0.14 with **Metal GPU** (`features = ["metal"]`) + `ort` ONNX Runtime for NVIDIA Parakeet (`parakeet-tdt-0.6b-v2` / `1.1b-v2`) |
| **Global Hotkeys & Injection** | CoreGraphics `CGEventTap` (`⌥ Option`) with `AXIsProcessTrusted()` auto-retry, `tauri-plugin-global-shortcut` (`⌘⇧Space`, `⌘⇧D`), and native macOS paste injection |
| **Menu Bar Icons** | Native Retina 36×36 RGBA generator (`src-tauri/src/tray_icons.rs`) with macOS template & live recording states |

---

## Install Prebuilt DMG

1. Download **[VANI-2.1.0.dmg](https://github.com/Anuragh33/Vani-app/releases/download/v2.1.0/VANI-2.1.0.dmg)** (9.8 MB, Apple Silicon) and drag **VANI.app** into **Applications**.
2. Clear the macOS Gatekeeper quarantine flag once:
   ```sh
   xattr -dr com.apple.quarantine /Applications/VANI.app
   ```
3. Launch **VANI.app** and enable **Microphone**, **Speech Recognition**, and **Accessibility** under **System Settings → Privacy & Security**.
4. Hold **`⌥ Option`** in any app to speak and paste (or press **`⌘⇧Space`** / left-click the menu bar icon).

> **Clamshell Mode Note:** Closing a MacBook Pro lid physically disconnects the built-in microphone in hardware. Open the lid slightly or select an external mic / AirPods in **System Settings → Sound → Input**.

---

## Build from Source (macOS Apple Silicon)

### Prerequisites
- macOS 11+ (macOS 26+ recommended for Apple `FoundationModels` & `SpeechAnalyzer`)
- Node.js 20+, Rust (`rustup`), and macOS Command Line Tools (`swiftc`)

### Build & Sign
```sh
git clone -b tauri-v2 https://github.com/Anuragh33/Vani-app.git
cd Vani-app
npm install

# 1. Compile the native Swift 6 Apple AI & CoreAudio helper
mkdir -p src-tauri/bin
swiftc -O -parse-as-library -target arm64-apple-macos26.0 \
  src-tauri/swift/vani_apple_ai.swift -o src-tauri/bin/vani-apple-ai

# 2. Build the Tauri v2 macOS app bundle (with Metal GPU whisper-rs)
npx tauri build --bundles app

# 3. Ad-hoc sign with Microphone & Apple Events entitlements
APP="src-tauri/target/release/bundle/macos/VANI.app"
codesign --force --sign - --entitlements src-tauri/entitlements.plist \
  "$APP/Contents/Resources/bin/vani-apple-ai"
codesign --force --sign - --entitlements src-tauri/entitlements.plist \
  --identifier com.vani.app "$APP"
```

### Frontend Preview in Browser
```sh
npm run dev
# Opens http://localhost:5173/ with an automatic browser preview sandbox
```

---

## Branches

- **`tauri-v2`** *(current release — v2.1.0)*: Full hybrid Tauri v2 + Swift 6 Apple Intelligence + Whisper Metal + Parakeet ONNX desktop app.
- **`main`**: Earlier standalone Swift 6 v0.1 prototype.

---

<p align="center">Made by <a href="https://github.com/Anuragh33">Anuragh</a></p>

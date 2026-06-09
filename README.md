# Vani

**Hold Fn. Speak. Done.**

Vani is a privacy-first macOS dictation app. Hold the Fn key anywhere on your Mac, speak naturally, and polished text appears instantly in whatever app you're using — Terminal, Chrome, Slack, Xcode, anywhere.

Zero servers. Zero API costs. Everything runs on your Mac.

---

## How it works

```
Hold Fn → mic records → SpeechAnalyzer transcribes → Foundation Models polishes → text injected
```

All four steps happen entirely on-device using Apple's frameworks introduced in macOS 26.

---

## Download

**[→ Download Vani 0.1.1](https://github.com/Anuragh33/Vani/releases/latest)**

Requires macOS 26 (Tahoe) or later · Apple Silicon only

### First launch

macOS will block the app because it isn't notarized. To open it:

1. Drag **Vani.app** into **Applications**
2. Open **Terminal** and run:
```sh
xattr -dr com.apple.quarantine /Applications/Vani.app
```
3. Double-click Vani — grant Microphone, Speech Recognition, and Accessibility when prompted

---

## Features

- **Hold Fn to dictate** — release to inject. Works in every app that accepts ⌘V
- **On-device STT** — `SpeechAnalyzer` (macOS 26), Whisper-class accuracy, no internet needed
- **AI text polish** — Apple's `FoundationModels` cleans filler words, fixes grammar, matches tone
- **Context-aware** — auto-detects Mail, Slack, Xcode, Terminal and adjusts polish style
- **Custom vocabulary** — bias recognition toward names, jargon, acronyms you use
- **Multilingual** — pick any locale supported by Apple's speech models
- **Animated pill overlay** — minimal waveform indicator with target app icon while recording
- **iCloud settings sync** — hotkey, context, vocabulary roam across your Macs
- **Launch at login** — always ready, lives in your menu bar

---

## Requirements

| | |
|---|---|
| macOS | 26 (Tahoe) or later |
| Chip | Apple Silicon (M-series) |
| Xcode | 26 (to build from source) |

---

## Build from source

```sh
brew install xcodegen
git clone https://github.com/Anuragh33/Vani.git
cd Vani
xcodegen generate
open Vani.xcodeproj
```

Set your signing Team in Xcode → ⌘R.

---

## Privacy

- No data ever leaves your Mac
- No analytics, no tracking, no accounts
- Dictation history lives only in memory and is cleared on quit

---

## Tech stack

| Layer | Technology |
|---|---|
| Language | Swift 6 |
| UI | SwiftUI + AppKit |
| Speech-to-text | `Speech` framework — `SpeechAnalyzer` + `SpeechTranscriber` |
| AI text polish | `FoundationModels` — `SystemLanguageModel` |
| Text injection | Accessibility API + clipboard + ⌘V fallback |
| Hotkey | `CGEventTap` via CoreGraphics |
| Audio | `AVAudioEngine` + Accelerate FFT |

---

Made by [Anurag](https://github.com/Anuragh33)

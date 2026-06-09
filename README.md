# Vani

Privacy-first macOS Wispr Flow clone. Hold a hotkey, speak, polished text appears in the focused app. 100% on-device using Apple's `SpeechAnalyzer` + Foundation Models.

Requires macOS 26 (Tahoe) and Apple Silicon.

## Generate the Xcode project

```sh
brew install xcodegen      # one-time
cd ~/Developer/Vani
xcodegen generate
open Vani.xcodeproj
```

In Xcode 26:
1. Select the `Vani` target → Signing & Capabilities → set your Team (free Apple ID is fine).
2. Build & Run (⌘R).
3. On first launch, grant Microphone, Speech Recognition, and Accessibility permissions when prompted.

## Project layout

```
Vani/
├── VaniApp.swift           App entry (LSUIElement = YES)
├── AppDelegate.swift           Wires hotkey → session → menu bar → overlay
├── Core/
│   ├── HotkeyManager.swift     CGEventTap, right-option-hold default
│   ├── AudioRecorder.swift     AVAudioEngine tap + RMS level
│   ├── SpeechEngine.swift      SpeechAnalyzer + SpeechTranscriber (macOS 26)
│   ├── TextPolisher.swift      FoundationModels LanguageModelSession
│   ├── TextInjector.swift      AXUIElement, clipboard+Cmd-V fallback
│   └── DictationSession.swift  State machine for the pipeline
├── UI/
│   ├── MenuBarController.swift NSStatusItem + NSPopover
│   ├── StatusPopoverView.swift Recent history + quick toggles
│   ├── SettingsView.swift      Settings scene
│   └── RecordingOverlay.swift  Floating pill NSPanel
├── Models/                     Settings, history entry, state enum
├── Utilities/                  Accessibility permission helpers
└── Resources/                  Info.plist, entitlements
```

## Verification checklist (Phase 1 → Phase 4 from the spec)

1. App launches with no Dock icon, mic in menu bar.
2. Press Right Option → console log fires (add a print in `HotkeyManager.handle` if needed).
3. Speak for 5s in TextEdit → polished text appears.
4. Toggle "AI polish" off → raw transcript still appears.
5. Frontmost-app switch during recording → text injects into the app that was focused at press time.

## API notes

`SpeechAnalyzer` and `FoundationModels` are macOS 26 SDK APIs. This project uses the verified
signatures from `Speech.framework/.swiftinterface` and `FoundationModels.framework/.swiftinterface`
shipped with the Command Line Tools for macOS 26.5. If Apple revises the API in a later SDK,
adjust `SpeechEngine.swift` and `TextPolisher.swift`.

## Known gaps

- Custom hotkey capture UI is not implemented (defaults to Right Option).
- `launchAtLogin` toggle persists but is not wired to `SMAppService` yet.
- No FFT-based waveform; the overlay shows a pulsing dot instead.

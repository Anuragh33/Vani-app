import Foundation
import AppKit
import Combine

/// Orchestrates the full dictation pipeline:
/// hotkey-press → record + transcribe → polish → inject → log to history.
@MainActor
final class DictationSession: ObservableObject {
    @Published var state: RecordingState = .idle
    @Published var liveTranscript: String = ""
    @Published var targetAppIcon: NSImage?
    @Published private(set) var history: [DictationEntry] = []

    private let settings: AppSettings
    let recorder = AudioRecorder()
    private var engine: SpeechEngine?
    private lazy var polisher: TextPolisher = TextPolisher()
    private let injector = TextInjector()

    private var streamConsumerTask: Task<Void, Never>?
    private var sessionApp: String?
    private var sessionBundleID: String?

    init(settings: AppSettings) {
        self.settings = settings
    }

    var audioLevel: Float { recorder.audioLevel }

    func beginDictation() {
        guard state == .idle else { return }
        state = .recording
        liveTranscript = ""
        sessionApp = NSWorkspace.shared.frontmostAppName
        sessionBundleID = ContextAutoDetect.frontmostBundleID()
        targetAppIcon = NSWorkspace.shared.frontmostApplication?.icon

        let engine = SpeechEngine()
        self.engine = engine

        Task { @MainActor in
            do {
                let stream = try await engine.startTranscription(
                    locale: settings.resolvedLocale,
                    vocabulary: settings.customVocabulary
                )

                streamConsumerTask = Task { @MainActor in
                    for await partial in stream {
                        self.liveTranscript = partial
                    }
                }

                try recorder.startRecording { [weak engine] buffer in
                    engine?.process(buffer: buffer)
                }
            } catch {
                NSLog("Vani: failed to start dictation: \(error)")
                self.state = .error("Failed to start: \(error.localizedDescription)")
                self.cleanup()
            }
        }
    }

    func endDictation() async {
        guard state == .recording, let engine else { return }

        recorder.stopRecording()
        state = .transcribing

        let rawText: String
        do {
            rawText = try await engine.finalizeTranscription()
        } catch {
            NSLog("Vani: transcription failed: \(error)")
            state = .error("Transcription failed")
            cleanup()
            return
        }

        let trimmed = rawText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.count >= 3 else {
            state = .idle
            cleanup()
            return
        }

        var finalText = trimmed
        let resolvedContext: DictationContext = {
            if settings.autoContext,
               let detected = ContextAutoDetect.context(for: sessionBundleID) {
                return detected
            }
            return settings.context
        }()

        if settings.polishEnabled && TextPolisher.isAvailable() {
            state = .polishing
            do {
                finalText = try await polisher.polish(rawText: trimmed, context: resolvedContext)
            } catch {
                NSLog("Vani: polish failed, using raw transcript: \(error)")
                finalText = trimmed
            }
        }

        state = .injecting
        // Inject into the app that was focused when recording started.
        if let target = sessionApp,
           let app = NSWorkspace.shared.runningApplications.first(where: { $0.localizedName == target }),
           !app.isActive {
            app.activate()
            try? await Task.sleep(nanoseconds: 80_000_000)
        }
        injector.inject(text: finalText)

        let entry = DictationEntry(rawText: trimmed, polishedText: finalText, appName: sessionApp)
        history.insert(entry, at: 0)
        if history.count > settings.historyLimit {
            history = Array(history.prefix(settings.historyLimit))
        }

        state = .idle
        cleanup()
    }

    private func cleanup() {
        streamConsumerTask?.cancel()
        streamConsumerTask = nil
        engine = nil
        sessionApp = nil
        sessionBundleID = nil
        targetAppIcon = nil
        liveTranscript = ""
    }

    /// Re-injects the polished text from a history entry into whatever app is focused now.
    func reinject(_ entry: DictationEntry) {
        TextInjector().inject(text: entry.displayText)
    }

    /// Copies the polished text of a history entry to the clipboard.
    func copyToClipboard(_ entry: DictationEntry) {
        let pb = NSPasteboard.general
        pb.clearContents()
        pb.setString(entry.displayText, forType: .string)
    }
}

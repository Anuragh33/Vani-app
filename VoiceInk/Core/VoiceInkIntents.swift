import AppIntents
import AppKit

/// "Start Vani" shortcut — triggerable from Siri, Shortcuts.app, or Spotlight.
struct StartDictationIntent: AppIntent {
    static let title: LocalizedStringResource = "Start Vani Dictation"
    static let description = IntentDescription("Begin a voice-to-text dictation session.")
    static let openAppWhenRun: Bool = true

    @MainActor
    func perform() async throws -> some IntentResult {
        if let delegate = NSApp.delegate as? AppDelegate {
            delegate.session.beginDictation()
        }
        return .result()
    }
}

struct StopDictationIntent: AppIntent {
    static let title: LocalizedStringResource = "Stop Vani Dictation"
    static let description = IntentDescription("End the current dictation session and inject the polished text.")
    static let openAppWhenRun: Bool = false

    @MainActor
    func perform() async throws -> some IntentResult {
        if let delegate = NSApp.delegate as? AppDelegate {
            await delegate.session.endDictation()
        }
        return .result()
    }
}

struct VaniShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: StartDictationIntent(),
            phrases: [
                "Start dictation with \(.applicationName)",
                "Begin \(.applicationName)"
            ],
            shortTitle: "Start Dictation",
            systemImageName: "mic.fill"
        )
        AppShortcut(
            intent: StopDictationIntent(),
            phrases: [
                "Stop dictation with \(.applicationName)",
                "End \(.applicationName)"
            ],
            shortTitle: "Stop Dictation",
            systemImageName: "stop.fill"
        )
    }
}

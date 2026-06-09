import AppKit
import ApplicationServices

@MainActor
final class TextInjector {
    /// Inject text into the focused element of the frontmost app.
    ///
    /// Strategy: clipboard + simulated ⌘V is our **primary** path because Accessibility
    /// writes are silently ignored by Terminal, browsers, Electron apps, and most
    /// non-Cocoa text inputs. The clipboard path works anywhere ⌘V works.
    /// We save and restore the prior pasteboard contents.
    @discardableResult
    func inject(text: String) -> Bool {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return false }
        injectViaClipboard(text: trimmed)
        return true
    }

    private func injectViaClipboard(text: String) {
        let pasteboard = NSPasteboard.general
        let savedItems = pasteboard.pasteboardItems?.compactMap { item -> [NSPasteboard.PasteboardType: Data]? in
            var dict: [NSPasteboard.PasteboardType: Data] = [:]
            for type in item.types {
                if let data = item.data(forType: type) { dict[type] = data }
            }
            return dict.isEmpty ? nil : dict
        }

        pasteboard.clearContents()
        pasteboard.setString(text, forType: .string)

        // Give the target app a tick to notice the new clipboard before we paste.
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.02) {
            self.simulateCommandV()
            // Restore the previous clipboard after the paste has been consumed.
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) {
                if let savedItems {
                    pasteboard.clearContents()
                    for entry in savedItems {
                        let item = NSPasteboardItem()
                        for (type, data) in entry { item.setData(data, forType: type) }
                        pasteboard.writeObjects([item])
                    }
                }
            }
        }
    }

    private func simulateCommandV() {
        let source = CGEventSource(stateID: .combinedSessionState)
        let vKey: CGKeyCode = 0x09 // 'v'

        // Press and release ⌘ on its own first so apps that gate on real modifier state
        // (Terminal, some Electron) see a clean ⌘V sequence.
        let cmdDown = CGEvent(keyboardEventSource: source, virtualKey: 0x37, keyDown: true)
        cmdDown?.flags = .maskCommand

        let down = CGEvent(keyboardEventSource: source, virtualKey: vKey, keyDown: true)
        down?.flags = .maskCommand
        let up = CGEvent(keyboardEventSource: source, virtualKey: vKey, keyDown: false)
        up?.flags = .maskCommand

        let cmdUp = CGEvent(keyboardEventSource: source, virtualKey: 0x37, keyDown: false)
        cmdUp?.flags = []

        cmdDown?.post(tap: .cghidEventTap)
        down?.post(tap: .cghidEventTap)
        up?.post(tap: .cghidEventTap)
        cmdUp?.post(tap: .cghidEventTap)
    }
}

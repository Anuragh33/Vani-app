import AppKit
import ApplicationServices

enum AccessibilityPermissions {
    static func isTrusted() -> Bool {
        AXIsProcessTrusted()
    }

    /// Prompts the system dialog and returns the current trusted state.
    @discardableResult
    static func prompt() -> Bool {
        let key = "AXTrustedCheckOptionPrompt" as CFString
        let options: [CFString: Any] = [key: true]
        return AXIsProcessTrustedWithOptions(options as CFDictionary)
    }

    static func openPrivacySettings() {
        let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility")!
        NSWorkspace.shared.open(url)
    }
}

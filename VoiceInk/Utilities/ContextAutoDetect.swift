import AppKit

enum ContextAutoDetect {
    /// Map the bundle ID of the frontmost app to a likely `DictationContext`.
    /// Returns nil when there's no good guess; caller should fall back to the user's preference.
    static func context(for bundleID: String?) -> DictationContext? {
        guard let id = bundleID?.lowercased() else { return nil }
        if id.contains("mail")            { return .email }
        if id.contains("airmail")         { return .email }
        if id.contains("spark")           { return .email }
        if id.contains("outlook")         { return .email }
        if id.contains("slack")           { return .slack }
        if id.contains("discord")         { return .slack }
        if id.contains("imessage") || id.contains("messages") { return .slack }
        if id.contains("xcode")           { return .code }
        if id.contains("vscode")          { return .code }
        if id.contains("cursor")          { return .code }
        if id.contains("jetbrains")       { return .code }
        if id.contains("zed")             { return .code }
        if id.contains("terminal") || id.contains("iterm") { return .code }
        if id.contains("notes")           { return .notes }
        if id.contains("notion")          { return .notes }
        if id.contains("obsidian")        { return .notes }
        if id.contains("bear")            { return .notes }
        return nil
    }

    static func frontmostBundleID() -> String? {
        NSWorkspace.shared.frontmostApplication?.bundleIdentifier
    }
}

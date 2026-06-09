import AppKit
import Foundation

extension NSWorkspace {
    var frontmostAppName: String? {
        frontmostApplication?.localizedName
    }
}

extension String {
    var trimmed: String {
        trimmingCharacters(in: .whitespacesAndNewlines)
    }
}

import Foundation

struct DictationEntry: Identifiable, Hashable {
    let id: UUID
    let rawText: String
    let polishedText: String
    let timestamp: Date
    let appName: String?

    init(rawText: String, polishedText: String, appName: String?) {
        self.id = UUID()
        self.rawText = rawText
        self.polishedText = polishedText
        self.timestamp = Date()
        self.appName = appName
    }

    var displayText: String {
        polishedText.isEmpty ? rawText : polishedText
    }
}

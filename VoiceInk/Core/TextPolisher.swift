import Foundation
import FoundationModels

/// Cleans raw dictation transcripts using Apple's on-device Foundation Models.
@MainActor
final class TextPolisher {
    enum PolishError: Error {
        case unavailable(SystemLanguageModel.Availability.UnavailableReason)
    }

    private let session: LanguageModelSession

    init() {
        self.session = LanguageModelSession(
            instructions: """
            You are a voice dictation text cleaner.
            Clean the raw speech transcript provided:
            - Remove filler words: um, uh, like, you know, basically, literally, right, so, actually
            - Fix grammar and punctuation
            - Preserve the user's meaning and tone exactly — do NOT add information
            - Match the context style if provided (email = formal, slack = casual, code = technical)
            - Return ONLY the cleaned text. No preamble, no explanation, no quotes.
            """
        )
    }

    static func isAvailable() -> Bool {
        SystemLanguageModel.default.isAvailable
    }

    func polish(rawText: String, context: DictationContext) async throws -> String {
        switch SystemLanguageModel.default.availability {
        case .available:
            break
        case .unavailable(let reason):
            throw PolishError.unavailable(reason)
        }

        // Cap input to avoid latency on very long dictations.
        let words = rawText.split(separator: " ")
        let capped = words.count > 500
            ? words.prefix(500).joined(separator: " ")
            : rawText

        let prompt = """
        Context: \(context.rawValue) (\(context.systemHint))
        Raw transcript: \(capped)
        """
        let response = try await session.respond(to: prompt)
        return response.content.trimmingCharacters(in: .whitespacesAndNewlines)
    }
}

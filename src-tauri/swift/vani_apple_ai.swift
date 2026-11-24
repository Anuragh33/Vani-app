import Foundation
import AVFoundation
import Speech
#if canImport(FoundationModels)
import FoundationModels
#endif

// MARK: - Helpers

func printJSON(_ dict: [String: Any]) {
    if let data = try? JSONSerialization.data(withJSONObject: dict, options: []),
       let str = String(data: data, encoding: .utf8) {
        print(str)
    }
}

func contextHint(for context: String) -> String {
    switch context.lowercased() {
    case "email":
        return "Format as a clear, professional email body with proper paragraphs and punctuation."
    case "slack":
        return "Format as a concise, friendly Slack or chat message. Keep it natural and punchy."
    case "notes":
        return "Format as clean, scannable notes or short bullet points."
    case "code":
        return "Preserve technical identifiers, filenames, and programming terms precisely. Format as a crisp developer prompt or comment."
    default:
        return "Fix grammar, capitalization, and punctuation while preserving natural phrasing."
    }
}

// MARK: - Status Command

func runStatus() {
    var fmAvailable = false
    var fmReason = "Requires macOS 26+ with Apple Intelligence enabled"

    #if canImport(FoundationModels)
    if #available(macOS 26.0, *) {
        switch SystemLanguageModel.default.availability {
        case .available:
            fmAvailable = true
            fmReason = "ready"
        case .unavailable(let reason):
            fmAvailable = false
            fmReason = String(describing: reason)
        }
    }
    #endif

    var speechAvailable = false
    if #available(macOS 26.0, *) {
        speechAvailable = true
    }

    let v = ProcessInfo.processInfo.operatingSystemVersion
    printJSON([
        "foundationModelAvailable": fmAvailable,
        "foundationModelReason": fmReason,
        "speechAnalyzerAvailable": speechAvailable,
        "macosVersion": "\(v.majorVersion).\(v.minorVersion).\(v.patchVersion)"
    ])
}

// MARK: - Polish Command (Apple FoundationModels On-Device LLM)

func runPolish(context: String) async {
    let inputData = FileHandle.standardInput.readDataToEndOfFile()
    let rawText = (String(data: inputData, encoding: .utf8) ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
    if rawText.isEmpty {
        print("")
        return
    }

    #if canImport(FoundationModels)
    if #available(macOS 26.0, *) {
        guard SystemLanguageModel.default.isAvailable else {
            fputs("Apple Foundation Model is unavailable on this Mac.\n", stderr)
            exit(2)
        }
        do {
            let session = LanguageModelSession(
                instructions: """
                You are an on-device voice dictation text cleaner.
                Clean the raw speech transcript provided:
                - Remove filler words (um, uh, like, you know, basically, literally, actually)
                - Fix grammar, capitalization, and punctuation
                - Preserve the speaker's exact meaning and technical terms — never invent facts
                - Follow the context style hint provided
                - Output ONLY the final cleaned text with no quotes, preamble, or explanation.
                """
            )
            let words = rawText.split(separator: " ")
            let capped = words.count > 550 ? words.prefix(550).joined(separator: " ") : rawText
            let prompt = """
            Context: \(context) (\(contextHint(for: context)))
            Raw transcript: \(capped)
            """
            let response = try await session.respond(to: prompt)
            let cleaned = response.content.trimmingCharacters(in: .whitespacesAndNewlines)
            print(cleaned.isEmpty ? rawText : cleaned)
            return
        } catch {
            fputs("FoundationModels error: \(error.localizedDescription)\n", stderr)
            exit(3)
        }
    }
    #endif

    fputs("FoundationModels requires macOS 26 or newer.\n", stderr)
    exit(2)
}

// MARK: - Transcribe Command (Apple SpeechAnalyzer On-Device STT)

func runTranscribe(wavPath: String, language: String, vocabCSV: String) async {
    if #available(macOS 26.0, *) {
        let locale: Locale
        if language.isEmpty || language == "auto" {
            locale = Locale.current
        } else {
            locale = Locale(identifier: language)
        }

        let resolvedLocale = (await SpeechTranscriber.supportedLocale(equivalentTo: locale)) ?? Locale(identifier: "en_US")
        let transcriber = SpeechTranscriber(locale: resolvedLocale, preset: .transcription)

        // Ensure on-device asset is installed
        let status = await AssetInventory.status(forModules: [transcriber])
        if status == .supported || status == .downloading {
            if let req = try? await AssetInventory.assetInstallationRequest(supporting: [transcriber]) {
                try? await req.downloadAndInstall()
            }
        }

        let analyzer = SpeechAnalyzer(modules: [transcriber])

        let vocab = vocabCSV
            .split(separator: ",")
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
        if !vocab.isEmpty {
            let ctx = AnalysisContext()
            ctx.contextualStrings = [.general: vocab]
            try? await analyzer.setContext(ctx)
        }

        let fileURL = URL(fileURLWithPath: wavPath)
        do {
            let audioFile = try AVAudioFile(forReading: fileURL)
            let resultsTask = Task<String, Error> {
                var chunks: [String] = []
                for try await result in transcriber.results {
                    if result.isFinal {
                        let piece = String(result.text.characters).trimmingCharacters(in: .whitespacesAndNewlines)
                        if !piece.isEmpty { chunks.append(piece) }
                    }
                }
                return chunks.joined(separator: " ")
            }

            let lastSample = try await analyzer.analyzeSequence(from: audioFile)
            if let lastSample {
                try await analyzer.finalizeAndFinish(through: lastSample)
            } else {
                await analyzer.cancelAndFinishNow()
            }

            let transcript = try await resultsTask.value
            print(transcript.trimmingCharacters(in: .whitespacesAndNewlines))
            return
        } catch {
            fputs("SpeechAnalyzer error: \(error.localizedDescription)\n", stderr)
            exit(4)
        }
    } else {
        fputs("Apple SpeechAnalyzer requires macOS 26 or newer.\n", stderr)
        exit(2)
    }
}

// MARK: - CLI Entrypoint

@main
struct VaniAppleAI {
    static func main() async {
        let args = CommandLine.arguments
        let cmd = args.count > 1 ? args[1] : "status"

        func argValue(_ flag: String, default def: String = "") -> String {
            if let idx = args.firstIndex(of: flag), idx + 1 < args.count {
                return args[idx + 1]
            }
            return def
        }

        switch cmd {
        case "status":
            runStatus()
        case "polish":
            let ctx = argValue("--context", default: "general")
            await runPolish(context: ctx)
        case "transcribe":
            let wav = argValue("--wav")
            let lang = argValue("--language", default: "auto")
            let vocab = argValue("--vocab", default: "")
            if wav.isEmpty {
                fputs("Missing --wav <path>\n", stderr)
                exit(1)
            }
            await runTranscribe(wavPath: wav, language: lang, vocabCSV: vocab)
        default:
            fputs("Unknown command: \(cmd)\n", stderr)
            exit(1)
        }
    }
}

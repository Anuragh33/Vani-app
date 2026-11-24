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
        fflush(stdout)
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

func micPermissionString() -> String {
    switch AVCaptureDevice.authorizationStatus(for: .audio) {
    case .authorized: return "granted"
    case .denied, .restricted: return "denied"
    case .notDetermined: return "unknown"
    @unknown default: return "unknown"
    }
}

func speechPermissionString() -> String {
    switch SFSpeechRecognizer.authorizationStatus() {
    case .authorized: return "granted"
    case .denied, .restricted: return "denied"
    case .notDetermined: return "unknown"
    @unknown default: return "unknown"
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
        "micPermission": micPermissionString(),
        "speechPermission": speechPermissionString(),
        "macosVersion": "\(v.majorVersion).\(v.minorVersion).\(v.patchVersion)"
    ])
}

// MARK: - Native CoreAudio Record Command (writes 16kHz mono PCM WAV)

func writeWav16kMono(samples: [Int16], to url: URL) throws {
    let sampleRate: UInt32 = 16000
    let numChannels: UInt16 = 1
    let bitsPerSample: UInt16 = 16
    let byteRate: UInt32 = sampleRate * UInt32(numChannels) * UInt32(bitsPerSample / 8)
    let blockAlign: UInt16 = numChannels * (bitsPerSample / 8)
    let dataSize: UInt32 = UInt32(samples.count * 2)
    let chunkSize: UInt32 = 36 + dataSize

    var data = Data(capacity: 44 + Int(dataSize))
    func appendLE<T: FixedWidthInteger>(_ v: T) {
        var le = v.littleEndian
        withUnsafeBytes(of: &le) { data.append(contentsOf: $0) }
    }

    data.append(contentsOf: "RIFF".utf8)
    appendLE(chunkSize)
    data.append(contentsOf: "WAVE".utf8)
    data.append(contentsOf: "fmt ".utf8)
    appendLE(UInt32(16))
    appendLE(UInt16(1)) // PCM
    appendLE(numChannels)
    appendLE(sampleRate)
    appendLE(byteRate)
    appendLE(blockAlign)
    appendLE(bitsPerSample)
    data.append(contentsOf: "data".utf8)
    appendLE(dataSize)

    samples.withUnsafeBufferPointer { buf in
        if let base = buf.baseAddress {
            data.append(UnsafeBufferPointer(start: UnsafeRawPointer(base).assumingMemoryBound(to: UInt8.self), count: samples.count * 2))
        }
    }

    try data.write(to: url, options: .atomic)
}

final class SampleCollector: @unchecked Sendable {
    private let lock = NSLock()
    private var pcm: [Int16] = []
    private var maxPeak: Float = 0

    func append(floats: UnsafePointer<Float>, count: Int) -> Float {
        var peak: Float = 0
        var chunk = [Int16](repeating: 0, count: count)
        for i in 0..<count {
            let v = max(-1.0, min(1.0, floats[i]))
            let av = abs(v)
            if av > peak { peak = av }
            chunk[i] = Int16(v * 32767.0)
        }
        lock.lock()
        pcm.append(contentsOf: chunk)
        if peak > maxPeak { maxPeak = peak }
        lock.unlock()
        return peak
    }

    func snapshot() -> ([Int16], Float) {
        lock.lock()
        let out = (pcm, maxPeak)
        lock.unlock()
        return out
    }
}

func runRecord(outPath: String) async {
    // Request Microphone permission if not yet determined
    let authStatus = AVCaptureDevice.authorizationStatus(for: .audio)
    if authStatus == .notDetermined {
        let granted = await AVCaptureDevice.requestAccess(for: .audio)
        if !granted {
            fputs("Microphone permission denied.\n", stderr)
            exit(10)
        }
    } else if authStatus == .denied || authStatus == .restricted {
        fputs("Microphone permission denied. Enable VANI in System Settings -> Privacy & Security -> Microphone.\n", stderr)
        exit(10)
    }

    let engine = AVAudioEngine()
    let inputNode = engine.inputNode
    let inputFormat = inputNode.outputFormat(forBus: 0)
    guard inputFormat.sampleRate > 0, inputFormat.channelCount > 0 else {
        fputs("No active microphone input device found.\n", stderr)
        exit(11)
    }

    guard let targetFormat = AVAudioFormat(commonFormat: .pcmFormatFloat32, sampleRate: 16000, channels: 1, interleaved: false),
          let converter = AVAudioConverter(from: inputFormat, to: targetFormat) else {
        fputs("Failed to initialize audio format converter.\n", stderr)
        exit(12)
    }

    let collector = SampleCollector()
    var lastPrint = CFAbsoluteTimeGetCurrent()

    inputNode.installTap(onBus: 0, bufferSize: 1024, format: inputFormat) { buffer, _ in
        let ratio = 16000.0 / inputFormat.sampleRate
        let outCap = AVAudioFrameCount(Double(buffer.frameLength) * ratio + 64)
        guard let outBuf = AVAudioPCMBuffer(pcmFormat: targetFormat, frameCapacity: outCap) else { return }

        var consumed = false
        var err: NSError?
        converter.convert(to: outBuf, error: &err) { _, status in
            if consumed {
                status.pointee = .noDataNow
                return nil
            }
            consumed = true
            status.pointee = .haveData
            return buffer
        }

        if let ch = outBuf.floatChannelData?[0], outBuf.frameLength > 0 {
            let peak = collector.append(floats: ch, count: Int(outBuf.frameLength))
            let now = CFAbsoluteTimeGetCurrent()
            if now - lastPrint >= 0.04 {
                lastPrint = now
                print(String(format: "LEVEL %.4f", min(1.0, peak * 2.6)))
                fflush(stdout)
            }
        }
    }

    do {
        engine.prepare()
        try engine.start()
        print("READY")
        fflush(stdout)
    } catch {
        fputs("Failed to start microphone capture: \(error.localizedDescription)\n", stderr)
        exit(13)
    }

    // Block on stdin until parent sends STOP or closes stdin
    await withCheckedContinuation { (cont: CheckedContinuation<Void, Never>) in
        DispatchQueue.global(qos: .userInteractive).async {
            while let line = readLine(strippingNewline: true) {
                if line.trimmingCharacters(in: .whitespacesAndNewlines).uppercased() == "STOP" {
                    break
                }
            }
            cont.resume()
        }
    }

    inputNode.removeTap(onBus: 0)
    engine.stop()

    let (samples, maxPeak) = collector.snapshot()
    do {
        try writeWav16kMono(samples: samples, to: URL(fileURLWithPath: outPath))
        print(String(format: "DONE %d %.5f", samples.count, maxPeak))
        fflush(stdout)
    } catch {
        fputs("Failed to write WAV: \(error.localizedDescription)\n", stderr)
        exit(14)
    }
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
                var finalChunks: [String] = []
                var lastVolatile = ""
                for try await result in transcriber.results {
                    let piece = String(result.text.characters).trimmingCharacters(in: .whitespacesAndNewlines)
                    if result.isFinal {
                        if !piece.isEmpty { finalChunks.append(piece) }
                        lastVolatile = ""
                    } else if !piece.isEmpty {
                        lastVolatile = piece
                    }
                }
                if !lastVolatile.isEmpty {
                    finalChunks.append(lastVolatile)
                }
                return finalChunks.joined(separator: " ")
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
        case "record":
            let out = argValue("--out")
            if out.isEmpty {
                fputs("Missing --out <wav_path>\n", stderr)
                exit(1)
            }
            await runRecord(outPath: out)
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

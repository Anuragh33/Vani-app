import Foundation
import AVFoundation
import Speech

/// On-device speech-to-text using the macOS 26 `SpeechAnalyzer` + `SpeechTranscriber` APIs.
@MainActor
final class SpeechEngine {
    enum SpeechError: Error, LocalizedError {
        case notAuthorized
        case localeUnsupported(Locale)
        case modelInstallFailed(String)

        var errorDescription: String? {
            switch self {
            case .notAuthorized: return "Speech recognition not authorized."
            case .localeUnsupported(let l): return "Locale \(l.identifier) is not supported."
            case .modelInstallFailed(let m): return "Couldn't install speech model: \(m)"
            }
        }
    }

    enum AssetState: Equatable {
        case unknown, installing, ready, unsupported, failed(String)
    }

    @MainActor
    final class AssetMonitor: ObservableObject {
        static let shared = AssetMonitor()
        @Published var state: AssetState = .unknown
    }

    private static func setAssetState(_ s: AssetState) {
        AssetMonitor.shared.state = s
    }

    private var analyzer: SpeechAnalyzer?
    private var transcriber: SpeechTranscriber?
    // Yielding to an AsyncStream.Continuation is thread-safe; the property is only
    // mutated from MainActor but read from the realtime audio thread.
    nonisolated(unsafe) private var inputContinuation: AsyncStream<AnalyzerInput>.Continuation?
    nonisolated(unsafe) private var converter: AVAudioConverter?
    nonisolated(unsafe) private var targetFormat: AVAudioFormat?
    private var resultsTask: Task<Void, Never>?
    private var liveStreamContinuation: AsyncStream<String>.Continuation?
    private var aggregated: String = ""

    static func requestAuthorization() async -> SFSpeechRecognizerAuthorizationStatus {
        await withCheckedContinuation { (cont: CheckedContinuation<SFSpeechRecognizerAuthorizationStatus, Never>) in
            SFSpeechRecognizer.requestAuthorization { @Sendable status in
                cont.resume(returning: status)
            }
        }
    }

    /// Ensures the speech model for the current locale is installed.
    /// Safe to call multiple times. Updates `SpeechEngine.assetState` for UI consumption.
    static func ensureAssetsInstalled(locale: Locale = .current) async {
        let probe = SpeechTranscriber(locale: locale, preset: .progressiveTranscription)
        let status = await AssetInventory.status(forModules: [probe])
        switch status {
        case .installed:
            setAssetState(.ready)
        case .unsupported:
            setAssetState(.unsupported)
        case .supported, .downloading:
            setAssetState(.installing)
            do {
                if let request = try await AssetInventory.assetInstallationRequest(supporting: [probe]) {
                    try await request.downloadAndInstall()
                }
                setAssetState(.ready)
            } catch {
                NSLog("Vani: asset install failed: \(error)")
                setAssetState(.failed(error.localizedDescription))
            }
        @unknown default:
            setAssetState(.unknown)
        }
    }

    /// Begins a fresh on-device transcription session.
    /// - Parameters:
    ///   - locale: locale for the speech model.
    ///   - vocabulary: custom contextual strings to bias recognition (names, jargon).
    func startTranscription(
        locale: Locale = .current,
        vocabulary: [String] = []
    ) async throws -> AsyncStream<String> {
        if SFSpeechRecognizer.authorizationStatus() == .notDetermined {
            _ = await Self.requestAuthorization()
        }
        guard SFSpeechRecognizer.authorizationStatus() == .authorized else {
            throw SpeechError.notAuthorized
        }

        let transcriber = SpeechTranscriber(
            locale: locale,
            preset: .progressiveTranscription
        )
        self.transcriber = transcriber

        // Make sure the model is installed before we start streaming.
        let installStatus = await AssetInventory.status(forModules: [transcriber])
        switch installStatus {
        case .unsupported:
            throw SpeechError.localeUnsupported(locale)
        case .supported, .downloading:
            Self.setAssetState(.installing)
            do {
                if let req = try await AssetInventory.assetInstallationRequest(supporting: [transcriber]) {
                    try await req.downloadAndInstall()
                }
                Self.setAssetState(.ready)
            } catch {
                Self.setAssetState(.failed(error.localizedDescription))
                throw SpeechError.modelInstallFailed(error.localizedDescription)
            }
        case .installed:
            Self.setAssetState(.ready)
        @unknown default:
            break
        }

        let (inputStream, inputCont) = AsyncStream<AnalyzerInput>.makeStream()
        self.inputContinuation = inputCont

        let analysisContext = AnalysisContext()
        let cleanedVocab = vocabulary
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
        if !cleanedVocab.isEmpty {
            analysisContext.contextualStrings = [.general: cleanedVocab]
        }

        let analyzer = SpeechAnalyzer(modules: [transcriber])
        self.analyzer = analyzer
        try? await analyzer.setContext(analysisContext)

        // Discover the analyzer's preferred audio format. If the input mic format differs,
        // we'll convert each buffer with an AVAudioConverter before yielding to the analyzer.
        let bestFormat = await SpeechAnalyzer.bestAvailableAudioFormat(compatibleWith: [transcriber])
        self.targetFormat = bestFormat

        // Warm the model with the format we'll actually feed in.
        try? await analyzer.prepareToAnalyze(in: bestFormat)

        aggregated = ""

        let (liveStream, liveCont) = AsyncStream<String>.makeStream(of: String.self)
        liveStreamContinuation = liveCont

        resultsTask = Task { [weak self] in
            do {
                for try await result in transcriber.results {
                    let chunk = String(result.text.characters)
                    await MainActor.run {
                        guard let self else { return }
                        if result.isFinal {
                            if !self.aggregated.isEmpty { self.aggregated += " " }
                            self.aggregated += chunk
                        }
                        let visible = result.isFinal
                            ? self.aggregated
                            : (self.aggregated.isEmpty ? chunk : self.aggregated + " " + chunk)
                        self.liveStreamContinuation?.yield(visible)
                    }
                }
            } catch {
                NSLog("Vani: transcriber results error: \(error)")
            }
            await MainActor.run {
                self?.liveStreamContinuation?.finish()
            }
        }

        try await analyzer.start(inputSequence: inputStream)
        return liveStream
    }

    nonisolated func process(buffer: AVAudioPCMBuffer) {
        guard let continuation = inputContinuation else { return }

        // If the analyzer wants a specific format and it differs from the buffer we just
        // received, convert. Otherwise yield the buffer directly.
        if let target = targetFormat, buffer.format != target {
            // Lazily build a converter on first use, then reuse it.
            if converter == nil {
                converter = AVAudioConverter(from: buffer.format, to: target)
            }
            guard let converter else {
                continuation.yield(AnalyzerInput(buffer: buffer))
                return
            }
            let ratio = target.sampleRate / buffer.format.sampleRate
            let capacity = AVAudioFrameCount(Double(buffer.frameLength) * ratio + 32)
            guard let outBuffer = AVAudioPCMBuffer(pcmFormat: target, frameCapacity: capacity) else {
                continuation.yield(AnalyzerInput(buffer: buffer))
                return
            }
            var consumed = false
            var convError: NSError?
            let status = converter.convert(to: outBuffer, error: &convError) { _, inputStatus in
                if consumed {
                    inputStatus.pointee = .noDataNow
                    return nil
                }
                consumed = true
                inputStatus.pointee = .haveData
                return buffer
            }
            if status == .error || convError != nil {
                NSLog("Vani: audio convert failed: \(String(describing: convError))")
                return
            }
            continuation.yield(AnalyzerInput(buffer: outBuffer))
        } else {
            continuation.yield(AnalyzerInput(buffer: buffer))
        }
    }

    func finalizeTranscription() async throws -> String {
        inputContinuation?.finish()
        inputContinuation = nil

        if let analyzer {
            try? await analyzer.finalizeAndFinishThroughEndOfInput()
        }

        await resultsTask?.value
        resultsTask = nil

        liveStreamContinuation?.finish()
        liveStreamContinuation = nil
        analyzer = nil
        transcriber = nil
        converter = nil
        targetFormat = nil

        return aggregated.trimmingCharacters(in: .whitespacesAndNewlines)
    }
}

import Foundation
import AVFoundation
import Accelerate
import Combine

@MainActor
final class AudioRecorder: ObservableObject {
    @Published var audioLevel: Float = 0.0
    /// Band energies, length == `bandCount`. Values are in roughly [0, 1] after smoothing.
    @Published var bandLevels: [Float]
    @Published var isRecording: Bool = false

    static let bandCount = 14
    private let fft: FFTHelper
    private var bufferHandler: (@Sendable (AVAudioPCMBuffer) -> Void)?
    private let engine = AVAudioEngine()
    private var smoothing: [Float]

    init() {
        let n = Self.bandCount
        self.bandLevels = Array(repeating: 0, count: n)
        self.smoothing = Array(repeating: 0, count: n)
        self.fft = FFTHelper(log2N: 11) // 2048-point FFT
    }

    var inputFormat: AVAudioFormat {
        engine.inputNode.outputFormat(forBus: 0)
    }

    func startRecording(bufferHandler: @escaping @Sendable (AVAudioPCMBuffer) -> Void) throws {
        guard !isRecording else { return }
        self.bufferHandler = bufferHandler

        let input = engine.inputNode
        let format = input.outputFormat(forBus: 0)

        // Capture the things we need on the audio thread as locals so the tap closure
        // doesn't touch any main-actor-isolated state synchronously.
        let fft = self.fft
        let bandCount = Self.bandCount

        input.removeTap(onBus: 0)
        // Capture the user's buffer handler locally so we can call it from the realtime
        // thread without touching main-actor state.
        let handler = bufferHandler
        input.installTap(onBus: 0, bufferSize: 2048, format: format) { @Sendable [weak self] buffer, _ in
            // Feed the speech engine synchronously on the audio thread.
            handler(buffer)
            let rms = AudioRecorder.computeRMS(buffer: buffer)
            let bands = fft.bands(from: buffer, count: bandCount)
            // Hop to main for UI-visible state updates only.
            Task { @MainActor [weak self] in
                guard let self else { return }
                self.audioLevel = rms
                self.applyBands(bands)
            }
        }

        engine.prepare()
        try engine.start()
        isRecording = true
    }

    func stopRecording() {
        guard isRecording else { return }
        engine.inputNode.removeTap(onBus: 0)
        engine.stop()
        isRecording = false
        audioLevel = 0
        smoothing = Array(repeating: 0, count: Self.bandCount)
        bandLevels = smoothing
        bufferHandler = nil
    }

    private func applyBands(_ new: [Float]) {
        guard new.count == Self.bandCount else { return }
        let alpha: Float = 0.55 // smoothing factor
        for i in 0..<Self.bandCount {
            smoothing[i] = alpha * new[i] + (1 - alpha) * smoothing[i]
        }
        bandLevels = smoothing
    }

    nonisolated private static func computeRMS(buffer: AVAudioPCMBuffer) -> Float {
        guard let channelData = buffer.floatChannelData else { return 0 }
        let frameLength = Int(buffer.frameLength)
        guard frameLength > 0 else { return 0 }
        var rms: Float = 0
        vDSP_rmsqv(channelData[0], 1, &rms, vDSP_Length(frameLength))
        return rms
    }
}

/// Wraps Accelerate's vDSP FFT and turns a buffer of float samples into normalized band levels.
/// Thread-safe for concurrent forward FFTs (each call allocates its own working buffers; the
/// shared `setup` and `window` are read-only after init).
final class FFTHelper: @unchecked Sendable {
    private let log2N: vDSP_Length
    private let n: Int
    private let setup: FFTSetup
    private let window: [Float]

    init(log2N: Int) {
        self.log2N = vDSP_Length(log2N)
        self.n = 1 << log2N
        self.setup = vDSP_create_fftsetup(self.log2N, FFTRadix(kFFTRadix2))!
        var w = [Float](repeating: 0, count: self.n)
        vDSP_hann_window(&w, vDSP_Length(self.n), Int32(vDSP_HANN_NORM))
        self.window = w
    }

    deinit {
        vDSP_destroy_fftsetup(setup)
    }

    func bands(from buffer: AVAudioPCMBuffer, count bandCount: Int) -> [Float] {
        guard let channels = buffer.floatChannelData else {
            return Array(repeating: 0, count: bandCount)
        }
        let frameLen = Int(buffer.frameLength)
        let take = min(frameLen, n)
        var samples = [Float](repeating: 0, count: n)
        for i in 0..<take { samples[i] = channels[0][i] }

        // Apply Hann window.
        var windowed = [Float](repeating: 0, count: n)
        vDSP_vmul(samples, 1, window, 1, &windowed, 1, vDSP_Length(n))

        // Pack into split-complex.
        var real = [Float](repeating: 0, count: n / 2)
        var imag = [Float](repeating: 0, count: n / 2)
        let magnitudes = real.withUnsafeMutableBufferPointer { realPtr in
            imag.withUnsafeMutableBufferPointer { imagPtr in
                var split = DSPSplitComplex(realp: realPtr.baseAddress!, imagp: imagPtr.baseAddress!)
                windowed.withUnsafeBufferPointer { wptr in
                    wptr.baseAddress!.withMemoryRebound(to: DSPComplex.self, capacity: n / 2) { complexPtr in
                        vDSP_ctoz(complexPtr, 2, &split, 1, vDSP_Length(n / 2))
                    }
                }
                vDSP_fft_zrip(setup, &split, 1, log2N, FFTDirection(FFT_FORWARD))
                var mags = [Float](repeating: 0, count: n / 2)
                vDSP_zvmags(&split, 1, &mags, 1, vDSP_Length(n / 2))
                return mags
            }
        }

        // Group magnitudes into log-spaced bands.
        let binCount = magnitudes.count
        var bands = [Float](repeating: 0, count: bandCount)
        for b in 0..<bandCount {
            let lo = Self.binIndex(for: b, total: bandCount, max: binCount)
            let hi = Self.binIndex(for: b + 1, total: bandCount, max: binCount)
            let range = lo..<max(hi, lo + 1)
            var sum: Float = 0
            for i in range where i < binCount { sum += magnitudes[i] }
            let avg = sum / Float(max(range.count, 1))
            // Compress with log so quiet content is visible; clamp to [0, 1].
            let scaled = log10f(1 + avg * 5e3) / 4.0
            bands[b] = min(max(scaled, 0), 1)
        }
        return bands
    }

    private static func binIndex(for band: Int, total: Int, max: Int) -> Int {
        // Log-spaced indexing for nicer-looking bars.
        let minLog = log2f(2)
        let maxLog = log2f(Float(max))
        let t = Float(band) / Float(total)
        let frac = minLog + t * (maxLog - minLog)
        return Int(powf(2, frac))
    }
}

import AppKit
import SwiftUI
import Combine

/// Owns a floating NSPanel that shows the recording pill at the bottom of the main screen.
@MainActor
final class RecordingOverlayController {
    private let panel: NSPanel
    private let session: DictationSession
    private var cancellables = Set<AnyCancellable>()

    init(session: DictationSession) {
        self.session = session

        let size = NSSize(width: 110, height: 35)
        panel = NSPanel(
            contentRect: NSRect(origin: .zero, size: size),
            styleMask: [.borderless, .nonactivatingPanel],
            backing: .buffered,
            defer: false
        )
        panel.level = .floating
        panel.isFloatingPanel = true
        panel.backgroundColor = .clear
        panel.isOpaque = false
        panel.hasShadow = true
        panel.ignoresMouseEvents = true
        panel.collectionBehavior = [.canJoinAllSpaces, .stationary, .fullScreenAuxiliary]
        panel.contentView = NSHostingView(
            rootView: RecordingOverlayView()
                .environmentObject(session)
                .environmentObject(session.recorder)
        )

        positionPanel()

        session.$state
            .sink { [weak self] state in self?.handle(state: state) }
            .store(in: &cancellables)
    }

    private func positionPanel() {
        guard let screen = NSScreen.main else { return }
        let frame = screen.visibleFrame
        let size = panel.frame.size
        let origin = NSPoint(
            x: frame.minX + frame.width * 0.02,
            y: frame.maxY - size.height - 40
        )
        panel.setFrameOrigin(origin)
    }

    private func handle(state: RecordingState) {
        switch state {
        case .idle, .error:
            panel.orderOut(nil)
        default:
            positionPanel()
            panel.orderFrontRegardless()
        }
    }
}

struct RecordingOverlayView: View {
    @EnvironmentObject private var session: DictationSession
    @EnvironmentObject private var recorder: AudioRecorder

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 18)
                .fill(.black.opacity(0.82))
                .overlay(
                    RoundedRectangle(cornerRadius: 18)
                        .strokeBorder(.white.opacity(0.08), lineWidth: 1)
                )

            HStack(spacing: 6) {
                WaveformBars(levels: recorder.bandLevels)
                    .frame(maxWidth: .infinity)

                if let icon = session.targetAppIcon {
                    Image(nsImage: icon)
                        .resizable()
                        .interpolation(.high)
                        .frame(width: 18, height: 18)
                }
            }
            .padding(.leading, 10)
            .padding(.trailing, 6)
            .padding(.vertical, 5)
        }
        .frame(width: 110, height: 35)
    }
}

private struct WaveformBars: View {
    let levels: [Float]

    var body: some View {
        GeometryReader { geo in
            let count = max(levels.count, 1)
            let spacing: CGFloat = 2
            let totalSpacing = spacing * CGFloat(count - 1)
            let barWidth = max((geo.size.width - totalSpacing) / CGFloat(count), 1)
            HStack(alignment: .center, spacing: spacing) {
                ForEach(0..<count, id: \.self) { i in
                    let value = CGFloat(levels[i])
                    Capsule()
                        .fill(.red.opacity(0.85))
                        .frame(width: barWidth, height: max(geo.size.height * value, 2))
                        .animation(.easeOut(duration: 0.08), value: value)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }
}

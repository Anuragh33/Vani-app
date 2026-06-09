import AppKit
import SwiftUI
import Combine

@MainActor
final class MenuBarController {
    private let statusItem: NSStatusItem
    private let popover: NSPopover
    private let session: DictationSession
    private let settings: AppSettings
    private var cancellables = Set<AnyCancellable>()

    init(session: DictationSession, settings: AppSettings) {
        self.session = session
        self.settings = settings
        self.statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)

        self.popover = NSPopover()
        popover.behavior = .transient
        popover.contentSize = NSSize(width: 320, height: 380)
        popover.contentViewController = NSHostingController(
            rootView: StatusPopoverView()
                .environmentObject(session)
                .environmentObject(settings)
        )

        if let button = statusItem.button {
            button.image = NSImage(systemSymbolName: "mic.fill", accessibilityDescription: "Vani")
            button.target = self
            button.action = #selector(togglePopover(_:))
        }

        session.$state
            .sink { [weak self] state in self?.updateIcon(for: state) }
            .store(in: &cancellables)
    }

    @objc private func togglePopover(_ sender: Any?) {
        guard let button = statusItem.button else { return }
        if popover.isShown {
            popover.performClose(sender)
        } else {
            popover.show(relativeTo: button.bounds, of: button, preferredEdge: .minY)
            popover.contentViewController?.view.window?.makeKey()
        }
    }

    private func updateIcon(for state: RecordingState) {
        guard let button = statusItem.button else { return }
        switch state {
        case .recording:
            button.image = NSImage(systemSymbolName: "mic.fill", accessibilityDescription: "Recording")
            button.contentTintColor = .systemRed
        case .transcribing, .polishing, .injecting:
            button.image = NSImage(systemSymbolName: "waveform", accessibilityDescription: state.label)
            button.contentTintColor = .systemOrange
        default:
            button.image = NSImage(systemSymbolName: "mic.fill", accessibilityDescription: "Vani")
            button.contentTintColor = nil
        }
    }
}

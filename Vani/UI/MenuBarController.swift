import AppKit
import SwiftUI
import Combine

@MainActor
final class MenuBarController {
    private let statusItem: NSStatusItem
    private let popover: NSPopover
    private let session: DictationSession
    private let settings: AppSettings
    private var settingsWindow: NSWindow?
    private var cancellables = Set<AnyCancellable>()

    init(session: DictationSession, settings: AppSettings) {
        self.session = session
        self.settings = settings
        self.statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)

        self.popover = NSPopover()
        popover.behavior = .transient
        popover.contentSize = NSSize(width: 320, height: 400)
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

        // Expose openSettings so the popover can call it.
        StatusPopoverView.openSettingsAction = { [weak self] in self?.showSettings() }
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

    func showSettings() {
        popover.performClose(nil)

        if let win = settingsWindow, win.isVisible {
            win.makeKeyAndOrderFront(nil)
            NSApp.activate(ignoringOtherApps: true)
            return
        }

        let host = NSHostingController(
            rootView: SettingsView()
                .environmentObject(settings)
                .environmentObject(session)
        )
        let win = NSWindow(contentViewController: host)
        win.title = "Vani Settings"
        win.styleMask = [.titled, .closable, .miniaturizable]
        win.isReleasedWhenClosed = false
        win.center()
        win.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        settingsWindow = win
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

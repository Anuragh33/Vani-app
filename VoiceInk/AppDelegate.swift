import AppKit
import Combine
import SwiftUI

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate, ObservableObject {
    let settings = AppSettings()
    let hotkeyManager = HotkeyManager()
    lazy var session = DictationSession(settings: settings)
    private var menuBarController: MenuBarController?
    private var overlayController: RecordingOverlayController?
    private var onboardingWindow: NSWindow?
    private var cancellables = Set<AnyCancellable>()

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.accessory)

        menuBarController = MenuBarController(session: session, settings: settings)
        overlayController = RecordingOverlayController(session: session)

        hotkeyManager.hotkeyPressed
            .sink { [weak self] in self?.session.beginDictation() }
            .store(in: &cancellables)

        hotkeyManager.hotkeyReleased
            .sink { [weak self] in
                Task { await self?.session.endDictation() }
            }
            .store(in: &cancellables)

        hotkeyManager.start(matching: settings.hotkey)

        settings.$hotkey
            .dropFirst()
            .sink { [weak self] newBinding in
                self?.hotkeyManager.start(matching: newBinding)
            }
            .store(in: &cancellables)

        if !AccessibilityPermissions.isTrusted() {
            showOnboarding()
        }

        // Pre-install the speech model in the background.
        Task.detached(priority: .utility) {
            await SpeechEngine.ensureAssetsInstalled()
        }

        // Mirror selected settings via iCloud key-value store (no-op on unsigned dev builds).
        iCloudSync.shared.pushLocalToCloud()
        iCloudSync.shared.startObserving { [weak self] in
            guard self != nil else { return }
            // Trigger a Settings reload by re-emitting the existing object.
            NSLog("Vani: iCloud pulled remote settings")
        }
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        return false  // stay alive as a menu-bar app
    }

    func applicationWillTerminate(_ notification: Notification) {
        hotkeyManager.stop()
    }

    private func showOnboarding() {
        let view = OnboardingView { [weak self] in
            self?.onboardingWindow?.close()
            self?.onboardingWindow = nil
        }
        let host = NSHostingController(rootView: view)
        let window = NSWindow(contentViewController: host)
        window.title = "Welcome to Vani"
        window.styleMask = [.titled, .closable]
        window.isReleasedWhenClosed = false
        window.center()
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        self.onboardingWindow = window
    }
}

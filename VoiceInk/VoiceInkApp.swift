import SwiftUI

@main
struct VaniApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate

    var body: some Scene {
        // No scenes — this is a menu-bar-only app (LSUIElement = YES).
        // All UI is driven from AppDelegate via MenuBarController.
        _EmptyScene()
    }
}

// Minimal no-op scene so the compiler is happy.
private struct _EmptyScene: Scene {
    var body: some Scene { Settings { EmptyView() } }
}

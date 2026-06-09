import Foundation

/// Mirrors a subset of settings into iCloud key-value storage so they roam across the user's Macs.
/// Requires the `com.apple.developer.ubiquity-kvstore-identifier` entitlement on signed builds.
@MainActor
final class iCloudSync {
    static let shared = iCloudSync()
    private let store = NSUbiquitousKeyValueStore.default
    private var observer: NSObjectProtocol?

    /// Keys to keep in sync. Hotkey, custom vocab, context, locale.
    static let keys: [String] = [
        "vani.context",
        "vani.polishEnabled",
        "vani.hotkey",
        "vani.customVocabulary",
        "vani.localeIdentifier",
        "vani.autoContext"
    ]

    /// Pushes the current `UserDefaults` values into the iCloud store.
    func pushLocalToCloud() {
        let defaults = UserDefaults.standard
        for key in Self.keys {
            if let value = defaults.object(forKey: key) {
                store.set(value, forKey: key)
            }
        }
        store.synchronize()
    }

    /// Pulls iCloud values down into `UserDefaults`.
    func pullCloudToLocal() {
        let defaults = UserDefaults.standard
        for key in Self.keys {
            if let value = store.object(forKey: key) {
                defaults.set(value, forKey: key)
            }
        }
    }

    /// Begins listening for remote changes; pull → notify → settings reload.
    func startObserving(onChange: @escaping @Sendable @MainActor () -> Void) {
        observer = NotificationCenter.default.addObserver(
            forName: NSUbiquitousKeyValueStore.didChangeExternallyNotification,
            object: store,
            queue: .main
        ) { _ in
            Task { @MainActor in
                iCloudSync.shared.pullCloudToLocal()
                onChange()
            }
        }
        store.synchronize()
    }

    func stop() {
        if let observer { NotificationCenter.default.removeObserver(observer) }
        observer = nil
    }
}

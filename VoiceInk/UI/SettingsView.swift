import SwiftUI
import Speech

struct SettingsView: View {
    @EnvironmentObject private var settings: AppSettings
    @EnvironmentObject private var session: DictationSession
    @StateObject private var assetMonitor = SpeechEngine.AssetMonitor.shared
    @State private var axTrusted = AccessibilityPermissions.isTrusted()
    @State private var supportedLocales: [Locale] = []
    @State private var vocabularyDraft: String = ""

    var body: some View {
        Form {
            Section("Hotkey") {
                HStack {
                    Text("Trigger")
                    Spacer()
                    HotkeyRecorderView(binding: $settings.hotkey)
                }
                Text("Tap, then press a key or modifier. Modifier-only bindings (e.g. Right Option) trigger on hold.")
                    .font(.caption)
                    .foregroundStyle(.tertiary)
                HStack {
                    Button("Use Fn") { settings.hotkey = .fn }
                    Button("Use Right Option") { settings.hotkey = .rightOption }
                }
            }

            Section("Behavior") {
                Picker("Context", selection: $settings.context) {
                    ForEach(DictationContext.allCases) { ctx in
                        Text(ctx.rawValue).tag(ctx)
                    }
                }
                Toggle("AI polish (Foundation Models)", isOn: $settings.polishEnabled)
                Toggle("Auto-detect context from frontmost app", isOn: $settings.autoContext)
                Toggle("Launch at login", isOn: $settings.launchAtLogin)
            }

            Section("Language") {
                HStack {
                    Text("Locale")
                    Spacer()
                    Picker("", selection: $settings.localeIdentifier) {
                        Text("System (\(Locale.current.identifier))").tag("")
                        ForEach(supportedLocales, id: \.identifier) { l in
                            Text(displayName(for: l)).tag(l.identifier)
                        }
                    }
                    .labelsHidden()
                    .frame(width: 240)
                }
                Text("Switching locale may trigger a model download.")
                    .font(.caption)
                    .foregroundStyle(.tertiary)
            }

            Section("Custom vocabulary") {
                Text("Names, jargon, or acronyms to bias recognition. One per line.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                TextEditor(text: $vocabularyDraft)
                    .font(.system(.body, design: .monospaced))
                    .frame(minHeight: 90)
                    .border(Color.secondary.opacity(0.2))
                    .onChange(of: vocabularyDraft) { _, new in
                        settings.customVocabulary = new
                            .split(whereSeparator: \.isNewline)
                            .map { String($0).trimmingCharacters(in: .whitespaces) }
                            .filter { !$0.isEmpty }
                    }
            }

            Section("Status") {
                StatusRow(
                    label: "Speech model",
                    state: AssetStatusLabel.text(for: assetMonitor.state),
                    color: AssetStatusLabel.color(for: assetMonitor.state)
                )
                StatusRow(
                    label: "Foundation Models",
                    state: TextPolisher.isAvailable() ? "Available" : "Unavailable",
                    color: TextPolisher.isAvailable() ? .green : .orange
                )
            }

            Section("Permissions") {
                HStack {
                    Image(systemName: axTrusted ? "checkmark.circle.fill" : "exclamationmark.triangle.fill")
                        .foregroundStyle(axTrusted ? .green : .orange)
                    Text(axTrusted ? "Accessibility: granted" : "Accessibility: not granted")
                    Spacer()
                    if !axTrusted {
                        Button("Open Settings") {
                            AccessibilityPermissions.openPrivacySettings()
                        }
                    }
                }
                Button("Re-check") { axTrusted = AccessibilityPermissions.isTrusted() }
            }
        }
        .formStyle(.grouped)
        .frame(width: 560, height: 720)
        .padding()
        .task {
            vocabularyDraft = settings.customVocabulary.joined(separator: "\n")
            await loadSupportedLocales()
        }
    }

    private func loadSupportedLocales() async {
        let locales = await SpeechTranscriber.supportedLocales
        self.supportedLocales = locales.sorted { displayName(for: $0) < displayName(for: $1) }
    }

    private func displayName(for locale: Locale) -> String {
        Locale.current.localizedString(forIdentifier: locale.identifier)
            ?? locale.identifier
    }
}

private struct StatusRow: View {
    let label: String
    let state: String
    let color: Color

    var body: some View {
        HStack {
            Text(label)
            Spacer()
            HStack(spacing: 6) {
                Circle().fill(color).frame(width: 8, height: 8)
                Text(state).foregroundStyle(.secondary)
            }
        }
    }
}

enum AssetStatusLabel {
    static func text(for state: SpeechEngine.AssetState) -> String {
        switch state {
        case .unknown:           return "Checking…"
        case .installing:        return "Downloading model…"
        case .ready:             return "Installed"
        case .unsupported:       return "Locale unsupported"
        case .failed(let msg):   return "Failed: \(msg)"
        }
    }

    static func color(for state: SpeechEngine.AssetState) -> Color {
        switch state {
        case .ready: return .green
        case .installing, .unknown: return .orange
        case .unsupported, .failed: return .red
        }
    }
}

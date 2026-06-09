import SwiftUI

struct StatusPopoverView: View {
    @EnvironmentObject private var session: DictationSession
    @EnvironmentObject private var settings: AppSettings

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            header
            Divider()
            controls
            Divider()
            recent
            Divider()
            footer
        }
        .padding(14)
        .frame(width: 320)
    }

    private var header: some View {
        HStack {
            Image(systemName: "mic.fill")
                .foregroundStyle(.tint)
            VStack(alignment: .leading, spacing: 2) {
                Text("Vani").font(.headline)
                Text("Hold \(hotkeyLabel) to dictate")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            Circle()
                .fill(session.state.isActive ? Color.red : Color.gray.opacity(0.4))
                .frame(width: 8, height: 8)
        }
    }

    private var controls: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("Context").font(.caption).foregroundStyle(.secondary)
                Spacer()
                Picker("", selection: $settings.context) {
                    ForEach(DictationContext.allCases) { ctx in
                        Text(ctx.rawValue).tag(ctx)
                    }
                }
                .labelsHidden()
                .pickerStyle(.menu)
                .frame(width: 160)
            }
            Toggle("AI polish", isOn: $settings.polishEnabled)
        }
    }

    private var recent: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Recent").font(.caption).foregroundStyle(.secondary)
            if session.history.isEmpty {
                Text("No dictations yet")
                    .font(.caption)
                    .foregroundStyle(.tertiary)
                    .frame(maxWidth: .infinity, alignment: .leading)
            } else {
                ScrollView {
                    VStack(alignment: .leading, spacing: 4) {
                        ForEach(session.history.prefix(6)) { entry in
                            HistoryRow(entry: entry)
                                .environmentObject(session)
                        }
                    }
                }
                .frame(maxHeight: 140)
            }
        }
    }

    private var footer: some View {
        HStack {
            Button("Settings…") {
                NSApp.activate(ignoringOtherApps: true)
                if #available(macOS 14, *) {
                    NSApp.sendAction(Selector(("showSettingsWindow:")), to: nil, from: nil)
                } else {
                    NSApp.sendAction(Selector(("showPreferencesWindow:")), to: nil, from: nil)
                }
            }
            Spacer()
            Button("Quit") { NSApp.terminate(nil) }
        }
    }

    private var hotkeyLabel: String {
        settings.hotkey.displayName
    }
}

private struct HistoryRow: View {
    let entry: DictationEntry
    @EnvironmentObject private var session: DictationSession
    @State private var hovered = false

    var body: some View {
        HStack(alignment: .top, spacing: 6) {
            Text("•")
                .foregroundStyle(.tertiary)
            VStack(alignment: .leading, spacing: 2) {
                Text(entry.displayText)
                    .font(.caption)
                    .lineLimit(2)
                if let app = entry.appName {
                    Text(app).font(.caption2).foregroundStyle(.tertiary)
                }
            }
            Spacer(minLength: 0)
            if hovered {
                Button {
                    session.copyToClipboard(entry)
                } label: {
                    Image(systemName: "doc.on.doc")
                }
                .help("Copy")
                .buttonStyle(.borderless)
                Button {
                    session.reinject(entry)
                } label: {
                    Image(systemName: "arrow.right.doc.on.clipboard")
                }
                .help("Re-inject into focused app")
                .buttonStyle(.borderless)
            }
        }
        .padding(.horizontal, 4)
        .padding(.vertical, 2)
        .background(hovered ? Color.secondary.opacity(0.08) : Color.clear)
        .cornerRadius(4)
        .onHover { hovered = $0 }
    }
}

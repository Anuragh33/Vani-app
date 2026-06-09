import SwiftUI
import AppKit

struct OnboardingView: View {
    let onDone: () -> Void
    @State private var axTrusted = AccessibilityPermissions.isTrusted()
    @State private var checking = false

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack(spacing: 12) {
                Image(systemName: "mic.fill")
                    .font(.system(size: 26))
                    .foregroundStyle(.tint)
                VStack(alignment: .leading, spacing: 2) {
                    Text("Welcome to Vani").font(.title2).bold()
                    Text("100% on-device dictation for macOS")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
            }

            Divider()

            VStack(alignment: .leading, spacing: 10) {
                Label("Hold Right Option to dictate", systemImage: "keyboard")
                Label("Release to inject polished text", systemImage: "text.cursor")
                Label("Nothing leaves your Mac", systemImage: "lock.shield")
            }
            .font(.callout)

            Divider()

            VStack(alignment: .leading, spacing: 8) {
                Text("One-time permission").font(.headline)
                Text("Vani needs Accessibility access to type text into other apps.")
                    .font(.callout)
                    .foregroundStyle(.secondary)

                HStack {
                    Image(systemName: axTrusted ? "checkmark.circle.fill" : "exclamationmark.triangle.fill")
                        .foregroundStyle(axTrusted ? .green : .orange)
                    Text(axTrusted ? "Accessibility: granted" : "Accessibility: not granted")
                    Spacer()
                    if !axTrusted {
                        Button("Open System Settings…") {
                            AccessibilityPermissions.openPrivacySettings()
                        }
                    }
                    Button(checking ? "Checking…" : "Re-check") {
                        checking = true
                        DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) {
                            axTrusted = AccessibilityPermissions.isTrusted()
                            checking = false
                        }
                    }
                }
            }

            Spacer()

            HStack {
                Spacer()
                Button("Continue") { onDone() }
                    .keyboardShortcut(.defaultAction)
                    .disabled(!axTrusted)
            }
        }
        .padding(24)
        .frame(width: 460, height: 420)
    }
}

import SwiftUI
import AppKit
import Carbon.HIToolbox

/// A click-to-capture button for binding a hotkey.
/// Tap, press a modifier-only key (e.g. Right Option) OR modifiers + key, release.
struct HotkeyRecorderView: View {
    @Binding var binding: HotkeyBinding
    @State private var isRecording = false

    var body: some View {
        Button {
            isRecording.toggle()
        } label: {
            HStack {
                Image(systemName: isRecording ? "record.circle.fill" : "keyboard")
                Text(isRecording ? "Press a key…" : binding.displayName)
                    .frame(minWidth: 160, alignment: .leading)
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(
                RoundedRectangle(cornerRadius: 6)
                    .fill(isRecording ? Color.red.opacity(0.18) : Color.secondary.opacity(0.12))
            )
        }
        .buttonStyle(.plain)
        .background(
            KeyCaptureRepresentable(isRecording: $isRecording, binding: $binding)
        )
    }
}

private struct KeyCaptureRepresentable: NSViewRepresentable {
    @Binding var isRecording: Bool
    @Binding var binding: HotkeyBinding

    func makeNSView(context: Context) -> KeyCaptureView {
        let v = KeyCaptureView()
        v.onCapture = { newBinding in
            self.binding = newBinding
            self.isRecording = false
        }
        return v
    }

    func updateNSView(_ nsView: KeyCaptureView, context: Context) {
        nsView.isRecording = isRecording
        if isRecording {
            DispatchQueue.main.async {
                nsView.window?.makeFirstResponder(nsView)
            }
        }
    }
}

final class KeyCaptureView: NSView {
    var isRecording = false
    var onCapture: ((HotkeyBinding) -> Void)?
    private var pendingModifierKey: Int?
    private var sawNonModifierWhileHeld = false

    override var acceptsFirstResponder: Bool { true }

    override func keyDown(with event: NSEvent) {
        guard isRecording else { super.keyDown(with: event); return }
        // A normal key while a modifier was held — commit modifier+key binding immediately
        // and disable the pending modifier-only commit.
        sawNonModifierWhileHeld = true
        let keyCode = Int(event.keyCode)
        let cgFlags = Self.cgFlags(from: event.modifierFlags)
        let binding = HotkeyBinding(
            keyCode: keyCode,
            modifierOnly: false,
            modifierFlags: cgFlags
        )
        pendingModifierKey = nil
        onCapture?(binding)
    }

    override func flagsChanged(with event: NSEvent) {
        guard isRecording else { super.flagsChanged(with: event); return }
        let keyCode = Int(event.keyCode)
        guard Self.isModifierKey(keyCode) else { return }
        let isDown = !event.modifierFlags.intersection([.command, .control, .option, .shift, .function]).isEmpty
            && event.modifierFlags.rawValue != 0
        if isDown {
            pendingModifierKey = keyCode
            sawNonModifierWhileHeld = false
        } else if pendingModifierKey == keyCode && !sawNonModifierWhileHeld {
            // Released the modifier without pressing anything else — commit as modifier-only.
            let binding = HotkeyBinding(
                keyCode: keyCode,
                modifierOnly: true,
                modifierFlags: 0
            )
            pendingModifierKey = nil
            onCapture?(binding)
        } else {
            pendingModifierKey = nil
        }
    }

    private static func isModifierKey(_ code: Int) -> Bool {
        switch code {
        case kVK_Command, kVK_RightCommand,
             kVK_Option, kVK_RightOption,
             kVK_Control, kVK_RightControl,
             kVK_Shift, kVK_RightShift,
             kVK_Function:
            return true
        default:
            return false
        }
    }

    private static func cgFlags(from ns: NSEvent.ModifierFlags) -> UInt64 {
        var raw: UInt64 = 0
        if ns.contains(.control)  { raw |= CGEventFlags.maskControl.rawValue }
        if ns.contains(.option)   { raw |= CGEventFlags.maskAlternate.rawValue }
        if ns.contains(.shift)    { raw |= CGEventFlags.maskShift.rawValue }
        if ns.contains(.command)  { raw |= CGEventFlags.maskCommand.rawValue }
        return raw
    }
}

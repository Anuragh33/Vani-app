import Foundation
import Combine
import CoreGraphics
import Carbon.HIToolbox

/// Global hotkey listener using CGEventTap.
///
/// Modifier-only hotkeys (Right Option etc.) listen for `.flagsChanged` and watch the
/// device-dependent bit for that specific key. Non-modifier hotkeys listen for `.keyDown`
/// and `.keyUp` and gate on required modifier flags.
@MainActor
final class HotkeyManager: ObservableObject {
    let hotkeyPressed = PassthroughSubject<Void, Never>()
    let hotkeyReleased = PassthroughSubject<Void, Never>()

    private var eventTap: CFMachPort?
    private var runLoopSource: CFRunLoopSource?
    private var currentBinding: HotkeyBinding = .rightOption
    private var isHeld = false

    /// Per-keycode device-dependent CGEventFlags mask for modifier keys.
    /// Values mirror `<IOKit/hidsystem/IOLLEvent.h>` `NX_DEVICE*KEYMASK`.
    private static let modifierKeyMask: [Int: UInt64] = [
        kVK_Control:        0x00000001,
        kVK_Shift:          0x00000002,
        kVK_RightShift:     0x00000004,
        kVK_Command:        0x00000008,
        kVK_RightCommand:   0x00000010,
        kVK_Option:         0x00000020,
        kVK_RightOption:    0x00000040,
        kVK_RightControl:   0x00002000,
        kVK_Function:       0x00800000,
    ]

    func start(matching binding: HotkeyBinding) {
        stop()
        currentBinding = binding

        let mask: CGEventMask
        if binding.modifierOnly {
            mask = CGEventMask(1 << CGEventType.flagsChanged.rawValue)
        } else {
            mask = CGEventMask(1 << CGEventType.keyDown.rawValue) |
                   CGEventMask(1 << CGEventType.keyUp.rawValue) |
                   CGEventMask(1 << CGEventType.flagsChanged.rawValue)
        }

        let refcon = Unmanaged.passUnretained(self).toOpaque()

        guard let tap = CGEvent.tapCreate(
            tap: .cgAnnotatedSessionEventTap,
            place: .headInsertEventTap,
            options: .listenOnly,
            eventsOfInterest: mask,
            callback: { _, type, event, refcon in
                guard let refcon else { return Unmanaged.passUnretained(event) }
                let manager = Unmanaged<HotkeyManager>.fromOpaque(refcon).takeUnretainedValue()
                Task { @MainActor in manager.handle(type: type, event: event) }
                return Unmanaged.passUnretained(event)
            },
            userInfo: refcon
        ) else {
            NSLog("Vani: failed to create CGEventTap — check Accessibility permission")
            return
        }

        let source = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, tap, 0)
        CFRunLoopAddSource(CFRunLoopGetCurrent(), source, .commonModes)
        CGEvent.tapEnable(tap: tap, enable: true)

        self.eventTap = tap
        self.runLoopSource = source
    }

    func stop() {
        if let tap = eventTap {
            CGEvent.tapEnable(tap: tap, enable: false)
        }
        if let source = runLoopSource {
            CFRunLoopRemoveSource(CFRunLoopGetCurrent(), source, .commonModes)
        }
        eventTap = nil
        runLoopSource = nil
        isHeld = false
    }

    private func handle(type: CGEventType, event: CGEvent) {
        if currentBinding.modifierOnly {
            guard type == .flagsChanged else { return }
            let keyMask = Self.modifierKeyMask[currentBinding.keyCode] ?? 0x40
            let down = (event.flags.rawValue & keyMask) != 0
            if down && !isHeld {
                isHeld = true
                hotkeyPressed.send()
            } else if !down && isHeld {
                isHeld = false
                hotkeyReleased.send()
            }
        } else {
            guard type == .keyDown || type == .keyUp else { return }
            let keyCode = Int(event.getIntegerValueField(.keyboardEventKeycode))
            guard keyCode == currentBinding.keyCode else { return }
            let required = currentBinding.modifierFlags
            let interesting: UInt64 =
                CGEventFlags.maskControl.rawValue
                | CGEventFlags.maskAlternate.rawValue
                | CGEventFlags.maskShift.rawValue
                | CGEventFlags.maskCommand.rawValue
            let actual = event.flags.rawValue & interesting
            guard actual == (required & interesting) else { return }
            if type == .keyDown && !isHeld {
                isHeld = true
                hotkeyPressed.send()
            } else if type == .keyUp && isHeld {
                isHeld = false
                hotkeyReleased.send()
            }
        }
    }
}

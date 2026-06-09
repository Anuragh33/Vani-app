import Foundation
import Combine
import Carbon.HIToolbox

enum DictationContext: String, CaseIterable, Identifiable {
    case general = "General"
    case email   = "Email"
    case slack   = "Slack / Chat"
    case code    = "Code comment"
    case notes   = "Notes"

    var id: String { rawValue }

    var systemHint: String {
        switch self {
        case .general: return "Clean, natural prose."
        case .email:   return "Professional, complete sentences."
        case .slack:   return "Casual, concise, no formal punctuation."
        case .code:    return "Technical language, keep identifiers exact."
        case .notes:   return "Bullet-friendly, preserve structure."
        }
    }
}

struct HotkeyBinding: Codable, Equatable {
    /// Virtual keycode from Carbon (e.g. kVK_RightOption = 0x3D).
    var keyCode: Int
    /// Whether this is a modifier-only hotkey (uses flagsChanged events).
    var modifierOnly: Bool
    /// Required modifier flags (CGEventFlags raw value) for non-modifier-only bindings.
    var modifierFlags: UInt64

    static let rightOption = HotkeyBinding(
        keyCode: kVK_RightOption,
        modifierOnly: true,
        modifierFlags: 0
    )

    static let fn = HotkeyBinding(
        keyCode: kVK_Function,
        modifierOnly: true,
        modifierFlags: 0
    )

    var displayName: String {
        if modifierOnly {
            switch keyCode {
            case kVK_RightOption: return "Right Option (hold)"
            case kVK_Option:      return "Left Option (hold)"
            case kVK_RightControl: return "Right Control (hold)"
            case kVK_Control:      return "Left Control (hold)"
            case kVK_RightShift:   return "Right Shift (hold)"
            case kVK_Shift:        return "Left Shift (hold)"
            case kVK_RightCommand: return "Right ⌘ (hold)"
            case kVK_Command:      return "Left ⌘ (hold)"
            case kVK_Function:     return "Fn (hold)"
            default:               return "Modifier (hold)"
            }
        }
        var parts: [String] = []
        let flags = CGEventFlags(rawValue: modifierFlags)
        if flags.contains(.maskControl) { parts.append("⌃") }
        if flags.contains(.maskAlternate) { parts.append("⌥") }
        if flags.contains(.maskShift) { parts.append("⇧") }
        if flags.contains(.maskCommand) { parts.append("⌘") }
        parts.append(KeyCodeNames.name(for: keyCode))
        return parts.joined()
    }
}

enum KeyCodeNames {
    static func name(for keyCode: Int) -> String {
        switch keyCode {
        case kVK_ANSI_A: return "A"
        case kVK_ANSI_B: return "B"
        case kVK_ANSI_C: return "C"
        case kVK_ANSI_D: return "D"
        case kVK_ANSI_E: return "E"
        case kVK_ANSI_F: return "F"
        case kVK_ANSI_G: return "G"
        case kVK_ANSI_H: return "H"
        case kVK_ANSI_I: return "I"
        case kVK_ANSI_J: return "J"
        case kVK_ANSI_K: return "K"
        case kVK_ANSI_L: return "L"
        case kVK_ANSI_M: return "M"
        case kVK_ANSI_N: return "N"
        case kVK_ANSI_O: return "O"
        case kVK_ANSI_P: return "P"
        case kVK_ANSI_Q: return "Q"
        case kVK_ANSI_R: return "R"
        case kVK_ANSI_S: return "S"
        case kVK_ANSI_T: return "T"
        case kVK_ANSI_U: return "U"
        case kVK_ANSI_V: return "V"
        case kVK_ANSI_W: return "W"
        case kVK_ANSI_X: return "X"
        case kVK_ANSI_Y: return "Y"
        case kVK_ANSI_Z: return "Z"
        case kVK_Space: return "Space"
        case kVK_Return: return "↩"
        case kVK_Tab: return "⇥"
        case kVK_Escape: return "⎋"
        case kVK_F1: return "F1"
        case kVK_F2: return "F2"
        case kVK_F3: return "F3"
        case kVK_F4: return "F4"
        case kVK_F5: return "F5"
        case kVK_F6: return "F6"
        case kVK_F7: return "F7"
        case kVK_F8: return "F8"
        case kVK_F9: return "F9"
        case kVK_F10: return "F10"
        case kVK_F11: return "F11"
        case kVK_F12: return "F12"
        default: return "Key \(keyCode)"
        }
    }
}

@MainActor
final class AppSettings: ObservableObject {
    private let defaults = UserDefaults.standard

    @Published var context: DictationContext {
        didSet { defaults.set(context.rawValue, forKey: Keys.context) }
    }

    @Published var polishEnabled: Bool {
        didSet { defaults.set(polishEnabled, forKey: Keys.polish) }
    }

    @Published var hotkey: HotkeyBinding {
        didSet {
            if let data = try? JSONEncoder().encode(hotkey) {
                defaults.set(data, forKey: Keys.hotkey)
            }
        }
    }

    @Published var historyLimit: Int {
        didSet { defaults.set(historyLimit, forKey: Keys.historyLimit) }
    }

    @Published var autoContext: Bool {
        didSet { defaults.set(autoContext, forKey: Keys.autoContext) }
    }

    @Published var customVocabulary: [String] {
        didSet { defaults.set(customVocabulary, forKey: Keys.customVocabulary) }
    }

    /// BCP-47 locale identifier; empty string means "use system current".
    @Published var localeIdentifier: String {
        didSet { defaults.set(localeIdentifier, forKey: Keys.localeIdentifier) }
    }

    var resolvedLocale: Locale {
        localeIdentifier.isEmpty ? .current : Locale(identifier: localeIdentifier)
    }

    @Published var launchAtLogin: Bool {
        didSet {
            defaults.set(launchAtLogin, forKey: Keys.launchAtLogin)
            _ = LaunchAtLogin.set(launchAtLogin)
        }
    }

    init() {
        let raw = defaults.string(forKey: Keys.context) ?? DictationContext.general.rawValue
        self.context = DictationContext(rawValue: raw) ?? .general
        self.polishEnabled = defaults.object(forKey: Keys.polish) as? Bool ?? true
        if let data = defaults.data(forKey: Keys.hotkey),
           let decoded = try? JSONDecoder().decode(HotkeyBinding.self, from: data) {
            self.hotkey = decoded
        } else {
            self.hotkey = .fn
        }
        self.historyLimit = defaults.object(forKey: Keys.historyLimit) as? Int ?? 25
        self.autoContext = defaults.object(forKey: Keys.autoContext) as? Bool ?? true
        self.customVocabulary = (defaults.array(forKey: Keys.customVocabulary) as? [String]) ?? []
        self.localeIdentifier = defaults.string(forKey: Keys.localeIdentifier) ?? ""
        let storedLAL = defaults.object(forKey: Keys.launchAtLogin) as? Bool ?? false
        self.launchAtLogin = LaunchAtLogin.isEnabled || storedLAL
    }

    private enum Keys {
        static let context = "vani.context"
        static let polish = "vani.polishEnabled"
        static let hotkey = "vani.hotkey"
        static let historyLimit = "vani.historyLimit"
        static let launchAtLogin = "vani.launchAtLogin"
        static let autoContext = "vani.autoContext"
        static let customVocabulary = "vani.customVocabulary"
        static let localeIdentifier = "vani.localeIdentifier"
    }
}

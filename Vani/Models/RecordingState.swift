import Foundation

enum RecordingState: Equatable {
    case idle
    case recording
    case transcribing
    case polishing
    case injecting
    case error(String)

    var isActive: Bool {
        switch self {
        case .idle, .error: return false
        default: return true
        }
    }

    var label: String {
        switch self {
        case .idle: return "Idle"
        case .recording: return "Recording…"
        case .transcribing: return "Transcribing…"
        case .polishing: return "Polishing…"
        case .injecting: return "Injecting…"
        case .error(let msg): return "Error: \(msg)"
        }
    }
}

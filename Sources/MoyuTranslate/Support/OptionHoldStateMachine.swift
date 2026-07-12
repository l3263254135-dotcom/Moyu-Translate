import Foundation

struct OptionHoldStateMachine {
    let threshold: TimeInterval
    private(set) var pressedAt: TimeInterval?
    private(set) var didTrigger = false

    init(threshold: TimeInterval = 0.35) {
        self.threshold = threshold
    }

    mutating func press(at time: TimeInterval) {
        guard pressedAt == nil else { return }
        pressedAt = time
        didTrigger = false
    }

    mutating func cancel() {
        pressedAt = nil
        didTrigger = false
    }

    mutating func shouldTrigger(at time: TimeInterval) -> Bool {
        guard let pressedAt, !didTrigger, time - pressedAt >= threshold else { return false }
        didTrigger = true
        return true
    }
}

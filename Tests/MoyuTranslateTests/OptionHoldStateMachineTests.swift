import Testing
@testable import MoyuTranslate

struct OptionHoldStateMachineTests {
    @Test func triggersOnlyAfterThreshold() {
        var machine = OptionHoldStateMachine(threshold: 0.35)
        machine.press(at: 10)
        let beforeThreshold = machine.shouldTrigger(at: 10.34)
        let atThreshold = machine.shouldTrigger(at: 10.35)
        let afterTrigger = machine.shouldTrigger(at: 10.8)
        #expect(!beforeThreshold)
        #expect(atThreshold)
        #expect(!afterTrigger)
    }

    @Test func cancelResetsPendingGesture() {
        var machine = OptionHoldStateMachine(threshold: 0.35)
        machine.press(at: 10)
        machine.cancel()
        let afterCancel = machine.shouldTrigger(at: 11)
        #expect(!afterCancel)
    }
}

import assert from 'node:assert/strict'
import test from 'node:test'

test('closed encounters expose only the reset action', async () => {
  const controlsModule = await import('../src/bubble-controls.js')
  assert.equal(typeof controlsModule.deriveBubbleControls, 'function')

  assert.deepEqual(controlsModule.deriveBubbleControls({
    closed: true,
    turnStatus: 'closed',
    localOnly: false,
    sessionBroken: false,
    bridgeState: 'online',
  }), {
    composerHidden: true,
    resetLabel: 'Begin again',
    inputDisabled: true,
    sendDisabled: true,
    stopHidden: true,
    stopDisabled: true,
    retryHidden: true,
    retryDisabled: false,
    leaveDisabled: true,
    sendLabel: 'Send',
  })
})

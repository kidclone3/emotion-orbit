export function deriveBubbleControls({
  closed,
  turnStatus,
  localOnly,
  sessionBroken,
  bridgeState,
}) {
  const inFlight = turnStatus === 'requesting' || turnStatus === 'cancelling'
  const canRetry = turnStatus === 'failed' || turnStatus === 'cancelled'
  const unavailable = localOnly || sessionBroken || closed

  return {
    composerHidden: closed,
    resetLabel: closed ? 'Begin again' : 'Reset',
    inputDisabled: unavailable || inFlight || canRetry,
    sendDisabled: unavailable || inFlight || canRetry || bridgeState !== 'online',
    stopHidden: !inFlight,
    stopDisabled: turnStatus !== 'requesting',
    retryHidden: !canRetry,
    retryDisabled: bridgeState !== 'online',
    leaveDisabled: closed,
    sendLabel: inFlight ? 'Listening…' : 'Send',
  }
}

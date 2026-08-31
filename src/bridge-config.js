export function bridgeSupportsChat(config) {
  return config.mode === 'same-origin'
}

function sameOriginSocketUrl(pageLocation) {
  const protocol = pageLocation.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${pageLocation.host}/chat`
}

export function resolveBridgeConfig({
  chatEnabled = false,
  pageLocation,
}) {
  if (!chatEnabled) return { mode: 'disabled', url: null }
  return { mode: 'same-origin', url: sameOriginSocketUrl(pageLocation) }
}

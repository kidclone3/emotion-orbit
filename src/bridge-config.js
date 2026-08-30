export function bridgeSupportsChat(config) {
  return config.mode === 'same-origin' || config.mode === 'configured'
}

function sameOriginSocketUrl(pageLocation) {
  const protocol = pageLocation.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${pageLocation.host}/chat`
}

export function resolveBridgeConfig({ pageLocation, configuredUrl = '' }) {
  if (configuredUrl) {
    try {
      const url = new URL(configuredUrl)
      const secureEnough = pageLocation.protocol !== 'https:' || url.protocol === 'wss:'
      if (
        ['ws:', 'wss:'].includes(url.protocol)
        && secureEnough
        && !url.username
        && !url.password
      ) {
        return { mode: 'configured', url: url.href }
      }
    } catch {
      // Invalid build-time values fail closed to local-only mode.
    }
    return { mode: 'local-only', url: null }
  }

  if (pageLocation.hostname.toLowerCase().endsWith('.github.io')) {
    return { mode: 'local-only', url: null }
  }

  return { mode: 'same-origin', url: sameOriginSocketUrl(pageLocation) }
}

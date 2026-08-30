export function createRenderScheduler({
  reducedMotion,
  requestAnimationFrameImpl = globalThis.requestAnimationFrame,
  cancelAnimationFrameImpl = globalThis.cancelAnimationFrame,
  render,
}) {
  let pendingFrame = 0
  let renderedFrames = 0
  let destroyed = false

  return {
    request() {
      if (destroyed || pendingFrame) return false
      pendingFrame = requestAnimationFrameImpl(() => {
        pendingFrame = 0
        if (destroyed) return
        render()
        renderedFrames += 1
      })
      return true
    },
    destroy() {
      destroyed = true
      if (pendingFrame) cancelAnimationFrameImpl(pendingFrame)
      pendingFrame = 0
    },
    getState() {
      return {
        mode: reducedMotion ? 'on-demand' : 'continuous',
        pending: Boolean(pendingFrame),
        renderedFrames,
      }
    },
  }
}

export function createAdaptiveQualityController({
  initialTier = 'balanced',
  downgradeFps = 40,
  upgradeFps = 55,
  downgradeSamples = 4,
  upgradeSamples = 8,
  cooldownSamples = 6,
}) {
  const tiers = ['low', 'balanced', 'high']
  let tierIndex = Math.max(0, tiers.indexOf(initialTier))
  let lowSamples = 0
  let highSamples = 0
  let cooldown = 0

  return {
    observe(fps) {
      if (cooldown > 0) {
        cooldown -= 1
        return null
      }
      if (tierIndex === 0 && fps < downgradeFps) {
        lowSamples = 0
        highSamples = 0
        return null
      }
      if (tierIndex === tiers.length - 1 && fps >= upgradeFps) {
        lowSamples = 0
        highSamples = 0
        return null
      }


      lowSamples = fps < downgradeFps ? lowSamples + 1 : 0
      highSamples = fps >= upgradeFps ? highSamples + 1 : 0
      let nextIndex = tierIndex
      if (lowSamples >= downgradeSamples) nextIndex = Math.max(0, tierIndex - 1)
      else if (highSamples >= upgradeSamples) nextIndex = Math.min(tiers.length - 1, tierIndex + 1)
      if (nextIndex === tierIndex) return null

      tierIndex = nextIndex
      lowSamples = 0
      highSamples = 0
      cooldown = cooldownSamples
      return tiers[tierIndex]
    },
    reset() {
      lowSamples = 0
      highSamples = 0
      cooldown = 0
    },
    getState() {
      return {
        tier: tiers[tierIndex],
        lowSamples,
        highSamples,
        cooldown,
      }
    },
  }
}

export function resolveInitialQuality({
  requested = 'auto',
  coarsePointer = false,
  hardwareConcurrency = Number.POSITIVE_INFINITY,
  deviceMemory = Number.POSITIVE_INFINITY,
} = {}) {
  if (['low', 'balanced', 'high'].includes(requested)) return requested
  return coarsePointer || hardwareConcurrency <= 4 || deviceMemory <= 4 ? 'low' : 'balanced'
}

export function createContextRecoveryController() {
  let state = 'ready'
  return {
    lose() {
      if (state !== 'ready') return false
      state = 'lost'
      return true
    },
    restore() {
      if (state !== 'lost') return false
      state = 'ready'
      return true
    },
    destroy() {
      state = 'destroyed'
    },
    getState() {
      return state
    },
  }
}

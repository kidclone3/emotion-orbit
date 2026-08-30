export function createStaticLiquidExperience() {
  return {
    setVisual() {},
    pulse() {},
    scheduleResize() {},
    setHidden() {},
    requestFrame() {},
    destroy() {},
    getState() {
      return {
        renderer: 'fallback',
        context: 'unavailable',
        quality: { tier: 'static', adaptive: false },
        renderMode: 'static',
      }
    },
  }
}

export function createSafeLiquidExperience({ create, onFailure = () => {} }) {
  try {
    return create()
  } catch (error) {
    onFailure(error)
    return createStaticLiquidExperience()
  }
}

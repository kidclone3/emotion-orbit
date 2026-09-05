import test from 'node:test'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'

registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'three/webgpu' && context.parentURL?.endsWith('/src/jelly-character.js')) {
    return { url: new URL('./helpers/jelly-renderer.js', import.meta.url).href, shortCircuit: true }
  }
  return next(specifier, context)
} })
const { mountJellyCharacter } = await import('../src/jelly-character.js')

function environment(reducedMotion = false) {
  const jobs = new Map()
  let id = 0, now = 0
  class Element extends EventTarget {
    style = {}; dataset = {}; children = []; clientHeight = 400; disabled = false
    attrs = new Map()
    append(child) { this.children.push(child); child.parent = this }
    prepend(child) { this.children.unshift(child); child.parent = this }
    remove() { if (this.parent) this.parent.children = this.parent.children.filter(c => c !== this) }
    setAttribute(name, value) { this.attrs.set(name, value) }
    getAttribute(name) { return this.attrs.get(name) }
    set innerHTML(value) {
      this.markup = value
      for (const name of ['.jelly-shadow', '.jelly-static', 'button']) {
        const el = new Element(); el.selector = name; this.append(el)
      }
    }
    querySelector(selector) { return this.children.find(el => el.selector === selector) }
    getBoundingClientRect() { return { left: 0, top: 0, bottom: 400, width: 500, height: 400 } }
    getContext() { return { fillRect() {}, createLinearGradient: () => ({ addColorStop() {} }) } }
    focus() { if (!this.disabled) document.activeElement = this }
    blur() { if (document.activeElement === this) document.activeElement = null }
  }
  globalThis.document = Object.assign(new EventTarget(), { createElement: () => new Element(), hidden: false, activeElement: null })
  globalThis.window = new EventTarget()
  globalThis.matchMedia = () => Object.assign(new EventTarget(), { matches: reducedMotion })
  globalThis.ResizeObserver = class { observe() {} disconnect() {} }
  globalThis.requestAnimationFrame = fn => { jobs.set(++id, fn); return id }
  globalThis.cancelAnimationFrame = id => jobs.delete(id)
  globalThis.devicePixelRatio = 1
  globalThis.jellyFailInit = false
  delete globalThis.jellyRenderer
  const parent = new Element()
  return { parent, jobs, tick() { now += 1000 / 60; const pending = [...jobs.values()]; jobs.clear(); pending.forEach(fn => fn(now)) } }
}
const until = async predicate => {
  for (let i = 0; i < 100 && !predicate(); i++) await new Promise(resolve => setImmediate(resolve))
  assert.ok(predicate(), 'async renderer reached expected boundary')
}

for (const action of ['fail', 'dispose']) {
  for (const settlement of ['resolve', 'reject']) {
    test(`${action} during pending compilation finalizes after ${settlement} without leaking or double destruction`, async () => {
      const env = environment()
      const jelly = mountJellyCharacter(env.parent)
      await until(() => globalThis.jellyRenderer?.compiling)
      const renderer = globalThis.jellyRenderer
      if (action === 'fail') renderer.onError(); else jelly.dispose()
      assert.equal(renderer.disposals, 0, 'backend must remain valid until compile settles')
      assert.equal(jelly.getState().fallback, action === 'fail')
      assert.equal(jelly.getState().disposed, action === 'dispose')
      if (settlement === 'reject') renderer.reject(Error('compile failed')); else renderer.resume()
      await until(() => renderer.disposals === 1)
      assert.equal(renderer.liveResources, 0)
      assert.equal(jelly.getState().resourcesReleased, 1)
      assert.equal(env.parent.children[0]?.children.includes(renderer.domElement) ?? false, false)
      jelly.dispose()
      renderer.onError()
      assert.equal(renderer.disposals, 1)
      assert.equal(env.jobs.size, 0)
      delete globalThis.jellyRenderer
    })
  }
}

for (const css of [false, true]) {
  for (const reducedMotion of [false, true]) {
    test(`${css ? 'CSS' : 'GPU'} scheduler reaches final closure optics (reduced=${reducedMotion})`, async () => {
      const env = environment(reducedMotion)
      globalThis.jellyFailInit = css
      const jelly = mountJellyCharacter(env.parent)
      if (css) await until(() => jelly.getState().backend === 'static')
      else {
        await until(() => globalThis.jellyRenderer?.compiling)
        globalThis.jellyRenderer.resume()
        await until(() => env.jobs.size > 0)
      }
      jelly.respond({ closed: true })
      let steps = 0
      while (env.jobs.size && steps++ < 1200) env.tick()
      const s = jelly.getState()
      assert.ok(steps > 0 && steps < 1200)
      assert.equal(s.visualState, 'closure')
      assert.ok(Math.abs(s.optics.value - (reducedMotion ? -.018 : -.06)) <= .00001, `value ${s.optics.value}`)
      assert.ok(s.optics.pressure <= .00001)
      jelly.dispose()
    })
  }
}

for (const method of ['sync', 'respond']) {
  test(`${method} closure immediately disables and blurs the semantic control, including while hidden`, async () => {
    const env = environment()
    globalThis.jellyFailInit = true
    const jelly = mountJellyCharacter(env.parent)
    await until(() => jelly.getState().backend === 'static')
    const button = env.parent.children[0].querySelector('button')
    button.focus()
    assert.equal(document.activeElement, button)
    document.hidden = true
    jelly[method]({ closed: true })
    assert.equal(button.disabled, true)
    assert.notEqual(document.activeElement, button)
    assert.doesNotMatch(button.getAttribute('aria-label'), /drag|wheel|pinch|resize/i)
    jelly.sync({ stage: 'story' })
    assert.equal(button.disabled, true, 'closed simulation has no reusable unlocked lifecycle')
    button.focus()
    assert.notEqual(document.activeElement, button)
    jelly.dispose()
  })
}

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import * as optional from '../src/jelly-optional.js'

function environment() {
  const events = []
  class Element {
    constructor() {
      this.attrs = new Map()
      this.children = []
      this.className = ''
      this.inert = false
      this.parent = null
      this.removeCalls = 0
    }
    append(...children) {
      for (const child of children) {
        this.children.push(child)
        child.parent = this
        events.push({ type: 'append', className: child.className, count: this.children.length })
      }
    }
    remove() {
      this.removeCalls++
      if (!this.parent) return
      const parent = this.parent
      parent.children = parent.children.filter(child => child !== this)
      this.parent = null
      events.push({ type: 'remove', className: this.className, count: parent.children.length })
    }
    setAttribute(name, value) { this.attrs.set(name, String(value)) }
    getAttribute(name) { return this.attrs.get(name) }
    set innerHTML(value) { this.markup = value }
  }
  globalThis.document = { createElement: () => new Element() }
  return { parent: new Element(), events }
}

function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

test('optional loading shell is present before the loader promise settles', async () => {
  const env = environment()
  const loading = deferred()
  const jelly = optional.loadOptionalJelly({ load: () => loading.promise, parent: env.parent })
  const shell = env.parent.children[0]

  assert.ok(shell)
  assert.match(shell.className, /\bjelly-loading\b/)
  assert.equal(shell.getAttribute('aria-hidden'), 'true')
  assert.equal(shell.inert, true)

  jelly.dispose()
  loading.resolve({})
  await jelly.ready
})

test('successful mount appends the real character before removing its loading shell', async () => {
  const env = environment()
  const loading = deferred()
  const jelly = optional.loadOptionalJelly({ load: () => loading.promise, parent: env.parent })
  await Promise.resolve()

  loading.resolve({ mountJellyCharacter(parent) {
    const real = document.createElement('div')
    real.className = 'alone-jelly'
    parent.append(real)
    return { sync() {}, dispose() { real.remove() } }
  } })
  await jelly.ready

  assert.deepEqual(env.events.map(event => `${event.type}:${event.className}`), [
    'append:alone-jelly jelly-loading',
    'append:alone-jelly',
    'remove:alone-jelly jelly-loading',
  ])
  assert.ok(env.events.every(event => event.count > 0), 'handoff never leaves the character region empty')
  assert.equal(env.parent.children[0].className, 'alone-jelly')
  jelly.dispose()
})

test('rejected optional loader removes its shell and resolves unavailable without sensitive errors', async () => {
  const env = environment()
  const jelly = optional.loadOptionalJelly({
    load: async () => { throw Error('secret') },
    parent: env.parent,
  })
  assert.equal(env.parent.children.length, 1)

  await jelly.ready

  assert.equal(env.parent.children.length, 0)
  assert.equal(jelly.getState().backend, 'unavailable')
  assert.ok(!JSON.stringify(jelly.getState()).includes('secret'))
})

test('throwing character mount removes its shell and resolves unavailable without sensitive errors', async () => {
  const env = environment()
  const jelly = optional.loadOptionalJelly({
    load: async () => ({ mountJellyCharacter() { throw Error('secret') } }),
    parent: env.parent,
  })
  assert.equal(env.parent.children.length, 1)

  await jelly.ready

  assert.equal(env.parent.children.length, 0)
  assert.equal(jelly.getState().backend, 'unavailable')
  assert.ok(!JSON.stringify(jelly.getState()).includes('secret'))
})

test('early disposal removes the shell and prevents a late loader from mounting', async () => {
  const env = environment()
  const loading = deferred()
  let mounted = 0
  const jelly = optional.loadOptionalJelly({ load: () => loading.promise, parent: env.parent })
  assert.equal(env.parent.children.length, 1)
  await Promise.resolve()

  jelly.dispose()
  assert.equal(env.parent.children.length, 0)
  loading.resolve({ mountJellyCharacter() { mounted++ } })
  await jelly.ready

  assert.equal(mounted, 0)
  assert.equal(jelly.getState().disposed, true)
})

test('loading and mounted cleanup remain idempotent', async () => {
  const env = environment()
  let disposed = 0
  const jelly = optional.loadOptionalJelly({
    load: async () => ({ mountJellyCharacter(parent) {
      const real = document.createElement('div')
      real.className = 'alone-jelly'
      parent.append(real)
      return { sync() {}, dispose() { disposed++; real.remove() } }
    } }),
    parent: env.parent,
  })
  const shell = env.parent.children[0]
  assert.ok(shell)
  await jelly.ready

  jelly.dispose()
  jelly.dispose()

  assert.equal(shell.removeCalls, 1)
  assert.equal(disposed, 1)
  assert.equal(env.parent.children.length, 0)
})

test('late mount receives only the latest application-safe visual state', async () => {
  environment()
  let received
  const jelly = optional.loadOptionalJelly({
    load: async () => ({ mountJellyCharacter() {
      return { sync(state) { received = state }, dispose() {} }
    } }),
  })
  jelly.sync({ stage: 'mirror', closed: false, turnStatus: 'idle', history: ['private'] })

  await jelly.ready

  assert.deepEqual(received, { stage: 'mirror', closed: false, turnStatus: 'idle' })
  jelly.dispose()
})

test('jelly CSS never uses percentage lengths as box-shadow offsets', async () => {
  const css = await readFile(new URL('../src/bubble-style.css', import.meta.url), 'utf8')
  const shadows = [...css.matchAll(/\bbox-shadow\s*:\s*([^;}]+)/g)].map(([, value]) => value)
  assert.ok(shadows.length > 0)

  for (const shadow of shadows) {
    let depth = 0
    let topLevel = ''
    for (const character of shadow) {
      if (character === '(') depth++
      else if (character === ')') depth--
      else if (depth === 0) topLevel += character
    }
    assert.doesNotMatch(topLevel, /-?(?:\d+(?:\.\d*)?|\.\d+)%/)
  }
})

test('loading fallback has four small limbs with shimmer clipped to each jelly form', async () => {
  const env = environment()
  const loading = deferred()
  const jelly = optional.loadOptionalJelly({ load: () => loading.promise, parent: env.parent })
  const markup = env.parent.children[0].markup

  for (const name of ['arm-left', 'arm-right', 'leg-left', 'leg-right']) {
    assert.equal((markup.match(new RegExp(`jelly-static-${name}`, 'g')) ?? []).length, 1)
  }
  assert.equal((markup.match(/jelly-forming-shimmer/g) ?? []).length, 5)
  assert.doesNotMatch(markup, /<div class="jelly-static-form"[^>]*>\s*<span class="jelly-forming-shimmer"/)

  jelly.dispose()
  loading.resolve({})
  await jelly.ready
})

test('fallback CSS keeps limbs visible until GPU handoff and restrains reduced motion', async () => {
  const css = await readFile(new URL('../src/bubble-style.css', import.meta.url), 'utf8')
  const reducedMotion = css.match(/@media\(prefers-reduced-motion:reduce\)\{([^{}]|\{[^{}]*\})*?\}/g)?.at(-1) ?? ''

  assert.match(css, /\.jelly-static-limb\{[^}]*background:/)
  assert.match(css, /\.jelly-loading \.jelly-static-limb\{[^}]*overflow:hidden/)
  assert.match(css, /\.alone-jelly\[data-ready=true\] \.jelly-static-form\{display:none\}/)
  assert.match(reducedMotion, /\.jelly-loading \.jelly-static-form[^{}]*\{animation:none\}/)
  assert.match(reducedMotion, /\.jelly-forming-shimmer[^{}]*\{animation:none\}/)
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { createJellyLifecycle, watchJellyDevice } from '../src/jelly-lifecycle.js'

function clock() {
  let next = 0
  const jobs = new Map()
  return { jobs, schedule: fn => { jobs.set(++next, fn); return next }, cancel: id => jobs.delete(id), tick() { const pending = [...jobs.values()]; jobs.clear(); pending.forEach(fn => fn(100)) } }
}

test('dispose during async creation releases late resource once and never schedules a frame', async () => {
  let resolve, disposed = 0
  const c = clock()
  const life = createJellyLifecycle({ ...c, create: () => new Promise(r => { resolve = r }), draw() {}, fallback() {} })
  const ready = life.start()
  life.dispose()
  life.dispose()
  resolve({ dispose() { disposed++ } })
  await ready
  assert.equal(disposed, 1)
  assert.equal(c.jobs.size, 0)
})

test('visibility pauses frames; render failure releases resource and falls back once', async () => {
  const c = clock()
  let disposed = 0, failures = 0, draws = 0
  const life = createJellyLifecycle({ ...c, create: async () => ({ dispose() { disposed++ } }), draw() { draws++; throw Error('lost') }, fallback() { failures++ } })
  await life.start()
  life.setVisible(false)
  c.tick()
  assert.equal(draws, 0)
  life.setVisible(true)
  c.tick()
  assert.equal(draws, 1)
  assert.equal(disposed, 1)
  assert.equal(failures, 1)
  life.fail()
  life.dispose()
  assert.equal(disposed, 1)
  assert.equal(failures, 1)
  assert.equal(c.jobs.size, 0)
})

test('initialization failure becomes a static fallback without an unhandled rejection', async () => {
  let failures = 0
  const c = clock()
  const life = createJellyLifecycle({ ...c, create: async () => { throw Error('no adapter') }, draw() {}, fallback() { failures++ } })
  await life.start()
  assert.equal(failures, 1)
  assert.equal(c.jobs.size, 0)
})

test('device destruction triggers fallback unless the owner has already disposed', async () => {
  for (const disposeFirst of [false, true]) {
    let resolve, losses = 0
    const device = { lost: new Promise(r => { resolve = r }) }
    const stop = watchJellyDevice(device, () => losses++)
    if (disposeFirst) stop()
    resolve({ reason: 'destroyed' })
    await Promise.resolve()
    assert.equal(losses, disposeFirst ? 0 : 1)
  }
})


test('terminal failure/disposal releases acquired resources during the next await', async () => {
  for (const action of ['fail', 'dispose']) {
    const c = clock()
    let resume, releases = 0, published = false, failures = 0
    const owned = { dispose() { releases++ } }
    const life = createJellyLifecycle({ ...c, async create(scope) {
      scope.own(owned)
      await new Promise(r => { resume = r })
      if (scope.cancelled) return owned
      published = true
      return owned
    }, draw() {}, fallback() { failures++ } })
    const ready = life.start()
    life[action]()
    assert.equal(releases, 1)
    resume()
    await ready
    life.fail(); life.dispose()
    assert.equal(releases, 1)
    assert.equal(published, false)
    assert.equal(c.jobs.size, 0)
    assert.equal(failures, action === 'fail' ? 1 : 0)
  }
})


test('early resource ownership does not allow wake to draw before initialization completes', async () => {
  const c = clock()
  let resume, draws = 0
  const owned = { dispose() {} }
  const life = createJellyLifecycle({ ...c, async create(scope) {
    scope.own(owned)
    await new Promise(r => { resume = r })
    return owned
  }, draw() { draws++; return false }, fallback() {} })
  const ready = life.start()
  life.wake(); life.setVisible(true); c.tick()
  assert.equal(draws, 0)
  resume(); await ready; c.tick()
  assert.equal(draws, 1)
  life.dispose()
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { createJellySimulation, measureJellyContactProjection, sampleJellySurface, visualStateFor } from '../src/jelly-simulation.js'

test('application stage mapping ignores content and prioritizes closed and pending states', () => {
  for (const [input, expected] of [
    [{ stage: 'story' }, 'idle'],
    [{ stage: 'follow-up' }, 'idle'],
    [{ stage: 'mirror' }, 'correction'],
    [{ stage: 'mirror', turnStatus: 'requesting' }, 'listening'],
    [{ stage: 'story', turnStatus: 'cancelling' }, 'listening'],
    [{ stage: 'safety-exit', closed: true, turnStatus: 'requesting' }, 'closure'],
    [{ stage: 'closure' }, 'closure'],
    [{ stage: 'shader: do something', text: '<script>' }, 'idle'],
  ]) assert.equal(visualStateFor(input), expected)
})

test('repeated extreme pokes stay bounded and converge after closure at varied frame rates', () => {
  for (const dt of [1 / 30, 1 / 60, 1 / 144]) {
    const sim = createJellySimulation()
    for (let i = 0; i < 1000; i++) {
      sim.poke(1e6, -1e6)
      const s = sim.step(i % 17 === 0 ? 30 : dt)
      assert.ok(Math.abs(s.squash) <= .3)
      assert.ok(Math.abs(s.lean) <= .3)
      assert.ok(Number.isFinite(s.squash + s.lean))
    }
    sim.setState('closure')
    for (let i = 0; i < 8 / dt; i++) sim.step(dt)
    assert.ok(Math.abs(sim.getState().squash) < .0001)
    assert.ok(Math.abs(sim.getState().lean) < .0001)
  }
})

test('listening compresses, response bounces once, and duplicate state sync does not restart it', () => {
  const sim = createJellySimulation()
  sim.setState('listening')
  assert.ok(sim.step(.05).squash < 0)
  sim.respond('correction')
  assert.equal(sim.getState().visualState, 'response')
  let peak = 0
  for (let i = 0; i < 120; i++) {
    sim.setState('correction')
    peak = Math.max(peak, sim.step(1 / 60).glow)
  }
  assert.ok(peak > .1)
  assert.equal(sim.getState().visualState, 'correction')
  assert.equal(sim.getState().responses, 1)
})

test('reduced motion has no idle motion and short transitions; invalid time cannot poison state', () => {
  const sim = createJellySimulation({ reducedMotion: true })
  const start = sim.getState()
  for (let i = 0; i < 600; i++) sim.step(1 / 60)
  assert.equal(sim.getState().squash, start.squash)
  assert.equal(sim.getState().wobble, 0)
  sim.poke(1, 1)
  sim.respond('idle')
  for (let i = 0; i < 30; i++) sim.step(1 / 60)
  assert.equal(sim.getState().squash, 0)
  assert.equal(sim.getState().glow, 0)
  sim.step(NaN)
  assert.ok(Number.isFinite(sim.getState().squash))
})

test('renderer fallback settles an in-flight response into its destination without changing motion preference', () => {
  const sim = createJellySimulation()
  sim.respond('closure')
  sim.step(.05)
  sim.settle()
  assert.equal(sim.getState().visualState, 'closure')
  assert.equal(sim.getState().squash, 0)
  assert.equal(sim.getState().glow, 0)
  assert.equal(sim.getState().reducedMotion, false)
})


test('grab preserves offset, springs toward bounded target and throws then returns home', () => {
  const sim = createJellySimulation()
  sim.grab(.1, .05)
  sim.drag(.2, .1)
  assert.equal(sim.getState().position.x, 0)
  const s = sim.step(1 / 60)
  assert.ok(s.position.x > 0 && s.position.x < .1)
  for (let i = 0; i < 240; i++) sim.step(1 / 120)
  assert.ok(Math.abs(sim.getState().position.x - .1) < .001)
  sim.release(1, .5)
  assert.equal(sim.getState().throwCount, 1)
  assert.ok(sim.step(1 / 60).velocity.x > 0)
  for (let i = 0; i < 1200; i++) sim.step(1 / 120)
  assert.ok(Math.abs(sim.getState().position.x) < .001)
})
test('motion and scale stay finite and bounded across rates, extreme input and closure', () => {
  for (const dt of [1/30, 1/60, 1/144, 100, NaN, Infinity]) {
    const sim = createJellySimulation()
    for (let i=0; i<300; i++) {
      sim.grab(0, 0); sim.drag(i % 2 ? 1e300 : NaN, -1e300); sim.resize(i % 2 ? 1e300 : -1e300); sim.release(1e300, Infinity)
      const s = sim.step(dt)
      assert.ok(Number.isFinite(s.position.x + s.position.y + s.velocity.x + s.velocity.y + s.scale))
      assert.ok(Math.abs(s.position.x) <= .18 && Math.abs(s.position.y) <= .14)
      assert.ok(s.scale >= .75 && s.scale <= 1.2)
    }
    sim.setState('closure'); sim.grab(0,0); sim.drag(.1,.1); sim.resize(1.2)
    assert.equal(sim.getState().grabbed, false)
    sim.settle()
    assert.deepEqual(sim.getState().position, sim.getState().homePosition)
  }
})
test('reduced motion suppresses throws and returns quickly', () => {
  const sim = createJellySimulation({ reducedMotion: true })
  sim.grab(0,0); sim.drag(.1,.1); sim.step(.05); sim.release(3,3)
  assert.equal(sim.getState().throwCount, 0)
  for(let i=0;i<60;i++) sim.step(1/60)
  assert.ok(Math.abs(sim.getState().position.x)<.001)
})
test('scale eases, invalid resize is ignored, contact is bounded and closure locked', () => {
  const sim = createJellySimulation()
  sim.resize(1.2)
  assert.equal(sim.getState().scale, 1)
  assert.ok(sim.step(.05).scale > 1)
  sim.resize(NaN)
  assert.equal(sim.getState().targetScale, 1.2)
  sim.contact(1,1)
  assert.equal(sim.getState().interactionMode, 'hover')
  assert.ok(Math.abs(sim.step(.05).lean) > 0)
  sim.setState('closure'); sim.contact(1,1)
  assert.equal(sim.getState().interactionMode, 'locked')
})


test('equal elapsed drag/return at 30, 60 and 144 Hz agrees within a small stage fraction', () => {
  const values = [30, 60, 144].map(hz => {
    const sim = createJellySimulation()
    sim.grab(.05, .02); sim.drag(.17, .12); sim.resize(1.2)
    for(let i = 0; i < hz; i++) sim.step(1/hz)
    sim.release(.4, -.2)
    for(let i = 0; i < hz/2; i++) sim.step(1/hz)
    return sim.getState()
  })
  for(const s of values) {
    assert.ok(Math.abs(s.position.x - values[0].position.x) < .003)
    assert.ok(Math.abs(s.position.y - values[0].position.y) < .003)
    assert.ok(Math.abs(s.scale - values[0].scale) < .001)
  }
})


test('closure preserves the held transform then settles without teleporting', () => {
  for (const respond of [false, true]) {
    const sim = createJellySimulation()
    sim.grab(0,0); sim.drag(.15,.1); sim.resize(1.2)
    for(let i=0;i<30;i++) sim.step(1/60)
    const before=sim.getState()
    if(respond) sim.respond('closure'); else sim.setState('closure')
    assert.deepEqual(sim.getState().position,before.position)
    assert.equal(sim.getState().scale,before.scale)
    assert.equal(sim.getState().interactionMode,'locked')
    for(let i=0;i<480;i++) sim.step(1/60)
    assert.ok(Math.hypot(sim.getState().position.x,sim.getState().position.y)<.001)
  }
})

test('secondary optics lag body, stay bounded and agree across frame rates', () => {
  const samples=[30,60,144].map(hz=>{
    const sim=createJellySimulation()
    assert.ok(sim.getState().optics, 'secondary optical state exists')
    sim.grab(0,0);sim.drag(.16,.12);sim.resize(1.2)
    const first=sim.step(1/60)
    assert.ok(first.optics.x>0 && first.optics.x<first.position.x)
    for(let i=0;i<hz;i++) sim.step(1/hz)
    const s=sim.getState()
    assert.ok(Math.abs(s.optics.x-s.position.x)<.005)
    assert.ok(s.optics.value>0 && s.optics.value<=.12)
    return s.optics
  })
  for(const s of samples) assert.ok(Math.abs(s.x-samples[0].x)<.002)
})

test('value transitions are continuous, bounded and restrained under reduced motion', () => {
  for(const reducedMotion of [false,true]) {
    const sim=createJellySimulation({reducedMotion})
    assert.ok(sim.getState().optics)
    for(const next of ['listening','correction','closure']) {
      const before=sim.getState().optics.value
      sim.setState(next)
      assert.equal(sim.getState().optics.value,before)
      for(let i=0;i<120;i++) {
        const s=sim.step(1/60)
        assert.ok(Math.abs(s.optics.value)<= (reducedMotion?.04:.12))
        assert.ok(Number.isFinite(s.optics.pressure))
      }
    }
    assert.ok(sim.getState().optics.value<0)
  }
})

for (const reducedMotion of [false, true]) {
  test(`demand scheduling settles closure body, scale and optical targets (reduced=${reducedMotion})`, () => {
    const sim = createJellySimulation({ reducedMotion })
    sim.grab(0, 0); sim.drag(.15, .1); sim.resize(1.2)
    for (let i = 0; i < 30; i++) sim.step(1 / 60)
    sim.respond('closure')
    let steps = 0
    while (sim.getState().needsFrame && steps++ < 1200) sim.step(1 / 60)
    const s = sim.getState()
    assert.equal(s.visualState, 'closure')
    assert.ok(steps > 0 && steps < 1200)
    assert.equal(s.needsFrame, false)
    assert.ok(Math.abs(s.optics.value - (reducedMotion ? -.018 : -.06)) <= .00001)
    assert.ok(s.optics.pressure <= .00001)
    assert.ok(Math.hypot(s.position.x, s.position.y, s.velocity.x, s.velocity.y) <= .0001)
    assert.ok(Math.abs(s.scale - 1.2) <= .0001)
    assert.equal(s.glow, 0)
    assert.equal(s.transitionRemaining, 0)
  })
  test(`fallback closure keeps requesting frames for value alone (reduced=${reducedMotion})`, () => {
    const sim = createJellySimulation({ reducedMotion })
    sim.setState('closure'); sim.settle()
    let steps = 0
    while (sim.getState().needsFrame && steps++ < 600) sim.step(1 / 60)
    assert.ok(steps > 0 && steps < 600)
    assert.ok(Math.abs(sim.getState().optics.value - (reducedMotion ? -.018 : -.06)) <= .00001)
    assert.equal(sim.getState().needsFrame, false)
  })
}

test('local surface pull is immediate, bounded, and stronger at contact than across the body', () => {
  const sim = createJellySimulation()
  assert.equal(sim.grab(0, 0, .72, -.48), true)
  sim.drag(.16, -.12)
  const s = sim.step(1 / 144)
  assert.deepEqual(s.deformation.anchor, { x: .72, y: -.48 })
  assert.ok(Math.hypot(s.deformation.pull.x, s.deformation.pull.y) > 0)
  assert.ok(Math.abs(s.deformation.pull.x) <= .2)
  assert.ok(Math.abs(s.deformation.pull.y) <= .18)
  const near = sampleJellySurface(s.deformation, .72, -.48)
  const distal = sampleJellySurface(s.deformation, -.72, .48)
  assert.ok(Math.hypot(near.x, near.y) > Math.hypot(distal.x, distal.y) * 4)
  assert.ok(near.x > 0)
})

test('anchor rebase preserves the active bulge then moves it continuously across frame rates', () => {
  const finals = []
  for (const hz of [30, 60, 144]) {
    const sim = createJellySimulation()
    sim.grab(0, 0, -.75, .35)
    sim.drag(.16, -.1)
    for (let i = 0; i < Math.round(hz * .2); i++) sim.step(1 / hz)
    const before = sim.getState().deformation
    const oldSurface = sampleJellySurface(before, -.75, .35)
    sim.rebase(.1, 0, .65, -.45)
    const immediate = sim.getState().deformation
    const immediateSurface = sampleJellySurface(immediate, -.75, .35)
    assert.deepEqual(immediate.anchor, before.anchor)
    assert.deepEqual(immediate.pull, before.pull)
    assert.deepEqual(immediate.recoil, before.recoil)
    assert.deepEqual(immediate.targetAnchor, { x: .65, y: -.45 })
    assert.deepEqual(immediateSurface, oldSurface)
    const first = sim.step(1 / hz).deformation
    const firstSurface = sampleJellySurface(first, -.75, .35)
    assert.ok(Math.hypot(first.anchor.x - before.anchor.x, first.anchor.y - before.anchor.y) < .45)
    assert.ok(Math.hypot(firstSurface.x, firstSurface.y) > Math.hypot(oldSurface.x, oldSurface.y) * .7)
    for (let i = 1; i < hz * 2; i++) sim.step(1 / hz)
    const settled = sim.getState().deformation
    assert.ok(Math.hypot(settled.anchor.x - .65, settled.anchor.y + .45) < .0001)
    finals.push(settled.anchor)
    sim.setState('closure')
    let steps = 0
    while (sim.getState().needsFrame && steps++ < hz * 10) sim.step(1 / hz)
    assert.equal(sim.getState().interactionMode, 'locked')
    assert.equal(sim.getState().needsFrame, false)
  }
  for (const anchor of finals) assert.ok(Math.hypot(anchor.x - finals[0].x, anchor.y - finals[0].y) < .0001)
})

test('quick regrab retargets active recoil without relocating the existing bulge', () => {
  for (const hz of [30, 60, 144]) {
    const sim = createJellySimulation()
    sim.grab(0, 0, -.7, .4)
    sim.drag(.16, -.1)
    for (let i = 0; i < Math.round(hz * .2); i++) sim.step(1 / hz)
    sim.release(.4, -.2)
    sim.step(1 / hz)
    const before = sim.getState().deformation
    const oldSurface = sampleJellySurface(before, before.anchor.x, before.anchor.y)
    assert.ok(before.active)
    assert.equal(sim.grab(.04, -.02, .72, -.46), true)
    const immediate = sim.getState().deformation
    assert.deepEqual(immediate.anchor, before.anchor)
    assert.deepEqual(immediate.pull, before.pull)
    assert.deepEqual(immediate.recoil, before.recoil)
    assert.deepEqual(immediate.targetAnchor, { x: .72, y: -.46 })
    assert.deepEqual(sampleJellySurface(immediate, before.anchor.x, before.anchor.y), oldSurface)
    const first = sim.step(1 / hz).deformation
    const firstSurface = sampleJellySurface(first, before.anchor.x, before.anchor.y)
    assert.ok(Math.hypot(firstSurface.x, firstSurface.y) > Math.hypot(oldSurface.x, oldSurface.y) * .65)
    for (let i = 1; i < hz * 2; i++) sim.step(1 / hz)
    const settled = sim.getState().deformation
    assert.ok(Math.hypot(settled.anchor.x - .72, settled.anchor.y + .46) < .0001)
  }
  const settled = createJellySimulation()
  assert.equal(settled.grab(0, 0, .52, -.31), true)
  assert.deepEqual(settled.getState().deformation.anchor, { x: .52, y: -.31 })
  assert.deepEqual(settled.getState().deformation.targetAnchor, { x: .52, y: -.31 })
})

test('moving grab gives local deformation a visible share of projected contact motion', () => {
  const sim = createJellySimulation()
  sim.grab(0, 0, .68, .32)
  sim.drag(.16, -.1)
  let s
  for (let i = 0; i < 6; i++) s = sim.step(1 / 60)
  const projected = measureJellyContactProjection(s, .68, .32, 1.25)
  assert.ok(projected.localShare >= .38, `local projected share ${projected.localShare}`)
  assert.ok(projected.body >= .015 && projected.body <= .14, `bounded projected body follow ${projected.body}`)
  assert.ok(projected.total > projected.body)
  const near = sampleJellySurface(s.deformation, .68, .32)
  assert.ok(Math.abs(near.x) <= .2 && Math.abs(near.y) <= .18)
})

test('local pull preserves volume with bounded distal counter-deformation', () => {
  const sim = createJellySimulation()
  sim.grab(0, 0, -.65, .55)
  sim.drag(.18, .14)
  for (let i = 0; i < 20; i++) sim.step(1 / 120)
  const d = sim.getState().deformation
  const near = sampleJellySurface(d, -.65, .55)
  const distal = sampleJellySurface(d, .9, -.9)
  assert.ok(d.compensation > 0 && d.compensation <= .2)
  assert.ok(d.volumeScale >= .9 && d.volumeScale < 1)
  assert.ok(near.x > 0 && distal.x < 0)
  assert.ok(Math.hypot(distal.x, distal.y) < Math.hypot(near.x, near.y))
})

test('released local pull recoils without snapping and converges across frame rates', () => {
  const finals = []
  for (const hz of [30, 60, 144]) {
    const sim = createJellySimulation()
    sim.grab(0, 0, .5, .25)
    sim.drag(.17, .1)
    for (let i = 0; i < Math.round(hz * .2); i++) sim.step(1 / hz)
    const held = sim.getState().deformation.pull.x
    sim.release()
    const first = sim.step(1 / hz).deformation.pull.x
    assert.ok(Math.abs(first) > .001 && Math.abs(first - held) < Math.abs(held))
    let crossed = false
    for (let i = 0; i < hz * 4; i++) {
      const pull = sim.step(1 / hz).deformation.pull.x
      if (pull * held < 0) crossed = true
      assert.ok(Number.isFinite(pull) && Math.abs(pull) <= .2)
    }
    assert.equal(crossed, true)
    finals.push(sim.getState().deformation.pull.x)
  }
  for (const value of finals) assert.ok(Math.abs(value) < .0001)
})

test('extreme and invalid local deformation inputs remain finite and bounded', () => {
  const sim = createJellySimulation()
  for (const values of [
    [Infinity, NaN, Infinity, -Infinity],
    [1e300, -1e300, 1e300, -1e300],
    [-1e300, 1e300, -1e300, 1e300],
  ]) {
    sim.grab(...values)
    sim.drag(values[0], values[1])
    const s = sim.step(Infinity)
    const sampled = sampleJellySurface(s.deformation, values[2], values[3])
    for (const value of [
      s.deformation.anchor.x, s.deformation.anchor.y,
      s.deformation.pull.x, s.deformation.pull.y,
      s.deformation.recoil.x, s.deformation.recoil.y,
      s.deformation.compensation, s.deformation.volumeScale,
      sampled.x, sampled.y, sampled.weight,
    ]) assert.ok(Number.isFinite(value))
    assert.ok(Math.abs(sampled.x) <= .24 && Math.abs(sampled.y) <= .24)
    sim.cancel()
  }
})

test('downward boundary impact transfers a bounded impulse into squash and recoil', () => {
  const sim = createJellySimulation()
  sim.grab(0, 0, 0, -.75)
  sim.drag(0, .14)
  for (let i = 0; i < 90; i++) sim.step(1 / 120)
  sim.release(0, 1.5)
  let peakImpact = 0
  let minimumSquash = 0
  let upwardRecoil = 0
  for (let i = 0; i < 180; i++) {
    const s = sim.step(1 / 120)
    peakImpact = Math.max(peakImpact, s.groundImpact)
    minimumSquash = Math.min(minimumSquash, s.squash)
    upwardRecoil = Math.min(upwardRecoil, s.deformation.recoil.y)
  }
  assert.ok(peakImpact > .1 && peakImpact <= 1)
  assert.ok(minimumSquash < -.01)
  assert.ok(upwardRecoil < 0)
})

test('face poses and idle blink are deterministic, bounded, and never reinterpret grabbing as sadness', () => {
  const a = createJellySimulation()
  const b = createJellySimulation()
  let blinkPeak = 0
  for (let i = 0; i < 600; i++) {
    const faceA = a.step(1 / 60).face
    const faceB = b.step(1 / 60).face
    assert.deepEqual(faceA, faceB)
    assert.ok(faceA.blink >= 0 && faceA.blink <= 1)
    assert.ok(faceA.eyeOpen >= .15 && faceA.eyeOpen <= 1.1)
    blinkPeak = Math.max(blinkPeak, faceA.blink)
  }
  assert.ok(blinkPeak > .5)
  a.grab(0, 0, 0, 0)
  assert.equal(a.getState().face.pose, 'idle')
  assert.equal(a.getState().face.mouthCurve, 0)
  a.setState('listening')
  assert.equal(a.getState().face.pose, 'listening')
  a.setState('correction')
  assert.equal(a.getState().face.pose, 'correction')
  assert.ok(Math.abs(a.getState().face.mouthTilt) > 0)
})

test('reduced motion disables blink and closure settles deformation without reopening interaction', () => {
  const sim = createJellySimulation({ reducedMotion: true })
  sim.grab(0, 0, .6, -.4)
  sim.drag(.18, .14)
  for (let i = 0; i < 30; i++) assert.equal(sim.step(1 / 60).face.blink, 0)
  assert.ok(Math.hypot(sim.getState().deformation.pull.x, sim.getState().deformation.pull.y) <= .08)
  sim.setState('closure')
  const closurePose = sim.getState().face
  assert.equal(closurePose.pose, 'closure')
  assert.ok(closurePose.eyeOpen < .6)
  assert.equal(sim.grab(0, 0, 0, 0), false)
  sim.setState('idle')
  let steps = 0
  while (sim.getState().needsFrame && steps++ < 600) sim.step(1 / 60)
  const settled = sim.getState()
  assert.equal(settled.interactionMode, 'locked')
  assert.equal(settled.visualState, 'closure')
  assert.ok(Math.hypot(settled.deformation.pull.x, settled.deformation.pull.y) < .0001)
  assert.equal(settled.needsFrame, false)
})

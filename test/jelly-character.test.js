import test from 'node:test'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import { Raycaster, Vector2, Vector3 } from 'three/webgpu'

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
    captured = new Set()
    attrs = new Map()
    append(child) { this.children.push(child); child.parent = this }
    prepend(child) { this.children.unshift(child); child.parent = this }
    remove() { if (this.parent) this.parent.children = this.parent.children.filter(c => c !== this) }
    setAttribute(name, value) { this.attrs.set(name, value) }
    getAttribute(name) { return this.attrs.get(name) }
    set innerHTML(value) {
      this.markup = value
      for (const name of ['.jelly-shadow', '.jelly-static-form', '.jelly-static', 'button']) {
        const el = new Element(); el.selector = name; this.append(el)
      }
    }
    querySelector(selector) { return this.children.find(el => el.selector === selector) }
    getBoundingClientRect() { return { left: 0, top: 0, bottom: 400, width: 500, height: 400 } }
    setPointerCapture(id) { this.captured.add(id) }
    hasPointerCapture(id) { return this.captured.has(id) }
    releasePointerCapture(id) { this.captured.delete(id) }
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

function projectedBounds(object, camera, include = () => true) {
  object.updateMatrixWorld(true)
  camera.updateMatrixWorld()
  const positions = object.geometry.attributes.position
  const point = new object.position.constructor()
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (let i = 0; i < positions.count; i++) {
    if (!include(positions.getY(i))) continue
    point.fromBufferAttribute(positions, i).applyMatrix4(object.matrixWorld).project(camera)
    minX = Math.min(minX, point.x); minY = Math.min(minY, point.y)
    maxX = Math.max(maxX, point.x); maxY = Math.max(maxY, point.y)
  }
  return { minX, minY, maxX, maxY }
}

function projectedTerminalRatio(limb, camera) {
  limb.updateMatrixWorld(true)
  camera.updateMatrixWorld()
  limb.geometry.computeBoundingBox()
  const positions = limb.geometry.attributes.position
  const { min: { y: minY }, max: { y: maxY } } = limb.geometry.boundingBox
  const length = maxY - minY
  const start = new Vector3(0, maxY, 0).applyMatrix4(limb.matrixWorld).project(camera)
  const end = new Vector3(0, minY, 0).applyMatrix4(limb.matrixWorld).project(camera)
  const dx = end.x - start.x, dy = end.y - start.y
  const magnitude = Math.hypot(dx, dy)
  const nx = -dy / magnitude, ny = dx / magnitude
  const point = new Vector3()
  const span = (startT, endT) => {
    let minimum = Infinity, maximum = -Infinity
    for (let i = 0; i < positions.count; i++) {
      const t = (maxY - positions.getY(i)) / length
      if (t < startT || t > endT) continue
      point.fromBufferAttribute(positions, i).applyMatrix4(limb.matrixWorld).project(camera)
      const crossAxis = point.x * nx + point.y * ny
      minimum = Math.min(minimum, crossAxis)
      maximum = Math.max(maximum, crossAxis)
    }
    return maximum - minimum
  }
  return span(.54, .9) / span(.18, .46)
}

function visibleProjectedAxisLength(limb, body, camera) {
  limb.updateMatrixWorld(true)
  body.updateMatrixWorld(true)
  camera.updateMatrixWorld()
  limb.geometry.computeBoundingBox()
  const { min, max } = limb.geometry.boundingBox
  const raycaster = new Raycaster()
  const ndc = new Vector2()
  const world = new Vector3()
  const cameraWorld = camera.getWorldPosition(new Vector3())
  const radius = Math.max(max.x - min.x, max.z - min.z) * .5
  let length = 0, previous = null
  for (let i = 0; i <= 24; i++) {
    const t = i / 24
    world.set(0, max.y + (min.y - max.y) * t, 0).applyMatrix4(limb.matrixWorld)
    const projected = world.clone().project(camera)
    ndc.set(projected.x, projected.y)
    raycaster.setFromCamera(ndc, camera)
    const bodyHit = raycaster.intersectObject(body, false)[0]
    const visible = !bodyHit || cameraWorld.distanceTo(world) - radius <= bodyHit.distance + .005
    if (visible && previous?.visible) length += Math.hypot(projected.x - previous.x, projected.y - previous.y)
    previous = { x: projected.x, y: projected.y, visible }
  }
  return length
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

test('GPU renderer embeds a procedural face in the body deformation and releases its resources', async () => {
  const env = environment()
  const jelly = mountJellyCharacter(env.parent)
  await until(() => globalThis.jellyRenderer?.compiling)
  const renderer = globalThis.jellyRenderer
  renderer.resume()
  await until(() => env.jobs.size > 0)
  env.tick()
  const body = renderer.scene.getObjectByName('jelly-body')
  const face = renderer.scene.getObjectByName('jelly-face')
  assert.ok(body)
  assert.ok(face)
  assert.equal(face.children.filter(child => child.userData.faceRole === 'eye').length, 2)
  assert.equal(face.children.filter(child => child.userData.faceRole === 'mouth').length, 1)
  const leftEye = face.getObjectByName('jelly-eye-left')
  const mouth = face.getObjectByName('jelly-mouth')
  const beforeEye = leftEye.position.clone()
  const beforeMouth = mouth.position.clone()
  const bodyBefore = body.geometry.attributes.position.array.slice()
  let minProjectedX = Infinity, maxProjectedX = -Infinity
  const projected = beforeEye.clone()
  for (let i = 0; i < body.geometry.attributes.position.count; i++) {
    projected.fromBufferAttribute(body.geometry.attributes.position, i).applyMatrix4(body.matrixWorld).project(renderer.camera)
    minProjectedX = Math.min(minProjectedX, projected.x)
    maxProjectedX = Math.max(maxProjectedX, projected.x)
  }
  const faceProjectedX = face.children.map(feature => feature.getWorldPosition(projected.clone()).project(renderer.camera).x)
  const bodyCenterX = (minProjectedX + maxProjectedX) * .5
  const faceCenterX = faceProjectedX.reduce((sum, value) => sum + value, 0) / faceProjectedX.length
  assert.ok(Math.abs(faceCenterX - bodyCenterX) <= .06, `face center ${faceCenterX} follows body center ${bodyCenterX}`)
  const eyeSpan = Math.abs(faceProjectedX[1] - faceProjectedX[0])
  assert.ok(eyeSpan / (maxProjectedX - minProjectedX) >= .24, `eye span ratio ${eyeSpan / (maxProjectedX - minProjectedX)}`)
  const faceMaterial = leftEye.material
  assert.equal(faceMaterial.transparent, true)
  assert.ok(faceMaterial.opacity >= .65 && faceMaterial.opacity <= .9)
  assert.ok(faceMaterial.color.g > faceMaterial.color.r && faceMaterial.color.g > faceMaterial.color.b)
  assert.ok(faceMaterial.roughness < .4)
  for (const feature of face.children) {
    let surfaceZ = -Infinity
    for (let i = 0; i < body.geometry.attributes.position.count; i++) {
      const dx = bodyBefore[i * 3] - feature.position.x
      const dy = bodyBefore[i * 3 + 1] - feature.position.y
      if (dx * dx + dy * dy < .025) surfaceZ = Math.max(surfaceZ, bodyBefore[i * 3 + 2])
    }
    let featureFrontZ = -Infinity
    const featurePositions = feature.geometry.attributes.position
    for (let i = 0; i < featurePositions.count; i++) {
      featureFrontZ = Math.max(featureFrontZ, feature.position.z + featurePositions.getZ(i) * feature.scale.z)
    }
    assert.ok(Number.isFinite(surfaceZ))
    assert.ok(featureFrontZ > surfaceZ, `${feature.name} remains visible at the body surface`)
  }
  let nearest = 0
  let nearestDistance = Infinity
  for (let i = 0; i < body.geometry.attributes.position.count; i++) {
    const dx = bodyBefore[i * 3] - beforeEye.x
    const dy = bodyBefore[i * 3 + 1] - beforeEye.y
    const dz = bodyBefore[i * 3 + 2] - beforeEye.z
    const distance = dx * dx + dy * dy + dz * dz
    if (distance < nearestDistance) { nearestDistance = distance; nearest = i }
  }
  const button = env.parent.children[0].querySelector('button')
  const pointer = (type, values) => {
    const result = new Event(type, { cancelable: true })
    for (const [key, value] of Object.entries(values)) Object.defineProperty(result, key, { value })
    return result
  }
  button.dispatchEvent(pointer('pointerdown', {
    button: 0, pointerId: 1, pointerType: 'mouse', clientX: 175, clientY: 170,
  }))
  const resolvedAnchor = jelly.getState().deformation.anchor
  assert.ok(Math.abs(resolvedAnchor.x) <= 1 && Math.abs(resolvedAnchor.y) <= 1)
  assert.ok(Math.hypot(resolvedAnchor.x + .3, resolvedAnchor.y - .15) > .05, 'renderer raycast replaces rectangle approximation')
  button.dispatchEvent(pointer('pointermove', {
    pointerId: 1, pointerType: 'mouse', clientX: 275, clientY: 130,
  }))
  for (let i = 0; i < 4; i++) env.tick()
  const eyeDelta = leftEye.position.clone().sub(beforeEye)
  const mouthDelta = mouth.position.clone().sub(beforeMouth)
  const bodyDeltaX = body.geometry.attributes.position.getX(nearest) - bodyBefore[nearest * 3]
  assert.ok(eyeDelta.length() > mouthDelta.length())
  assert.ok(eyeDelta.x > 0)
  assert.ok(bodyDeltaX > 0)
  const resources = new Set()
  for (const child of face.children) {
    resources.add(child.geometry)
    resources.add(child.material)
  }
  let released = 0
  for (const resource of resources) resource.addEventListener('dispose', () => released++)
  jelly.dispose()
  assert.equal(released, resources.size)
  assert.equal(renderer.disposals, 1)
  assert.equal(env.jobs.size, 0)
})

test('GPU body owns four small procedural limbs made from its jelly material', async () => {
  const env = environment()
  const jelly = mountJellyCharacter(env.parent)
  await until(() => globalThis.jellyRenderer?.compiling)
  const renderer = globalThis.jellyRenderer
  renderer.resume()
  await until(() => env.jobs.size > 0)
  env.tick()

  const body = renderer.scene.getObjectByName('jelly-body')
  const limbs = renderer.scene.getObjectByName('jelly-limbs')
  assert.ok(limbs)
  assert.equal(limbs.parent, body)
  assert.deepEqual(limbs.children.map(limb => limb.name).sort(), [
    'jelly-arm-left',
    'jelly-arm-right',
    'jelly-leg-left',
    'jelly-leg-right',
  ])
  assert.equal(new Set(limbs.children.map(limb => limb.geometry)).size, 4)

  body.geometry.computeBoundingBox()
  const bodySize = body.geometry.boundingBox.getSize(new body.position.constructor())
  const bodyExtent = Math.max(bodySize.x, bodySize.y, bodySize.z)
  for (const limb of limbs.children) {
    assert.equal(limb.material, body.material, `${limb.name} shares the translucent body material`)
    limb.geometry.computeBoundingBox()
    const size = limb.geometry.boundingBox.getSize(new body.position.constructor())
    const extent = Math.max(size.x, size.y, size.z)
    assert.ok(extent >= bodyExtent * .12, `${limb.name} remains visibly embodied`)
    assert.ok(extent <= bodyExtent * .42, `${limb.name} stays small beside the body`)
  }

  jelly.dispose()
})

test('desktop projection exposes comparable left and right arm protrusion around the rotated body', async () => {
  const env = environment()
  const jelly = mountJellyCharacter(env.parent)
  await until(() => globalThis.jellyRenderer?.compiling)
  const renderer = globalThis.jellyRenderer
  renderer.resume()
  await until(() => env.jobs.size > 0)
  env.tick()

  const body = renderer.scene.getObjectByName('jelly-body')
  const left = renderer.scene.getObjectByName('jelly-arm-left')
  const right = renderer.scene.getObjectByName('jelly-arm-right')
  const bodyBounds = projectedBounds(body, renderer.camera)
  const bodyWidth = bodyBounds.maxX - bodyBounds.minX
  const leftLength = visibleProjectedAxisLength(left, body, renderer.camera)
  const rightLength = visibleProjectedAxisLength(right, body, renderer.camera)
  const balance = leftLength / rightLength

  assert.ok(leftLength >= bodyWidth * .07, `visible left arm length ${leftLength / bodyWidth}`)
  assert.ok(rightLength >= bodyWidth * .07, `visible right arm length ${rightLength / bodyWidth}`)
  assert.ok(balance >= .9 && balance <= 1.1, `visible projected arm ratio ${balance}`)
  jelly.dispose()
})

test('projected arm and leg terminals widen into readable tiny hands and feet', async () => {
  const env = environment()
  const jelly = mountJellyCharacter(env.parent)
  await until(() => globalThis.jellyRenderer?.compiling)
  const renderer = globalThis.jellyRenderer
  renderer.resume()
  await until(() => env.jobs.size > 0)
  env.tick()

  for (const name of ['jelly-arm-left', 'jelly-arm-right']) {
    const ratio = projectedTerminalRatio(renderer.scene.getObjectByName(name), renderer.camera)
    assert.ok(ratio >= 1.38, `${name} projected terminal ratio ${ratio}`)
  }
  for (const name of ['jelly-leg-left', 'jelly-leg-right']) {
    const ratio = projectedTerminalRatio(renderer.scene.getObjectByName(name), renderer.camera)
    assert.ok(ratio >= 1.24, `${name} projected terminal ratio ${ratio}`)
  }

  jelly.dispose()
})

test('limb roots follow local body deformation while inheriting body scale and rotation', async () => {
  const env = environment()
  const jelly = mountJellyCharacter(env.parent)
  await until(() => globalThis.jellyRenderer?.compiling)
  const renderer = globalThis.jellyRenderer
  renderer.resume()
  await until(() => env.jobs.size > 0)
  env.tick()

  const body = renderer.scene.getObjectByName('jelly-body')
  const limbs = renderer.scene.getObjectByName('jelly-limbs')
  const before = limbs.children.map(limb => limb.position.clone())
  const button = env.parent.children[0].querySelector('button')
  const pointer = (type, values) => {
    const event = new Event(type, { cancelable: true })
    for (const [key, value] of Object.entries(values)) Object.defineProperty(event, key, { value })
    return event
  }
  button.dispatchEvent(pointer('pointerdown', {
    button: 0, pointerId: 2, pointerType: 'mouse', clientX: 175, clientY: 170,
  }))
  button.dispatchEvent(pointer('pointermove', {
    pointerId: 2, pointerType: 'mouse', clientX: 285, clientY: 125,
  }))
  for (let i = 0; i < 8; i++) env.tick()

  assert.equal(limbs.parent, body)
  assert.ok(Math.hypot(body.rotation.x, body.rotation.y, body.rotation.z) > .1)
  assert.deepEqual([limbs.rotation.x, limbs.rotation.y, limbs.rotation.z], [0, 0, 0])
  assert.ok(limbs.children.some((limb, index) => limb.position.distanceTo(before[index]) > .002))

  const worldBeforeScale = limbs.children.map(limb => limb.getWorldPosition(limb.position.clone()).distanceTo(body.position))
  for (let i = 0; i < 6; i++) button.dispatchEvent(pointer('keydown', { key: '+', ctrlKey: false, metaKey: false, altKey: false }))
  for (let i = 0; i < 60; i++) env.tick()
  const worldAfterScale = limbs.children.map(limb => limb.getWorldPosition(limb.position.clone()).distanceTo(body.position))
  assert.ok(worldAfterScale.some((distance, index) => distance > worldBeforeScale[index] * 1.08))

  jelly.dispose()
})

for (const reducedMotion of [false, true]) {
  test(`limb transforms stay finite and bounded under extreme input (reduced=${reducedMotion})`, async () => {
    const env = environment(reducedMotion)
    const jelly = mountJellyCharacter(env.parent)
    await until(() => globalThis.jellyRenderer?.compiling)
    const renderer = globalThis.jellyRenderer
    renderer.resume()
    await until(() => env.jobs.size > 0)
    env.tick()
    const limbs = renderer.scene.getObjectByName('jelly-limbs')
    const button = env.parent.children[0].querySelector('button')
    const initialQuaternions = limbs.children.map(limb => limb.quaternion.clone())

    const wheel = new Event('wheel', { cancelable: true })
    Object.defineProperties(wheel, { deltaY: { value: -1e300 }, deltaMode: { value: 0 } })
    button.dispatchEvent(wheel)
    for (let frame = 0; frame < 240; frame++) {
      env.tick()
      for (const limb of limbs.children) {
        const values = [
          ...limb.position.toArray(),
          ...limb.quaternion.toArray(),
          ...limb.scale.toArray(),
          ...limb.matrixWorld.elements,
        ]
        assert.ok(values.every(Number.isFinite), `${limb.name} transform remains finite: ${JSON.stringify({ position: limb.position.toArray(), quaternion: limb.quaternion.toArray(), scale: limb.scale.toArray(), matrix: limb.matrixWorld.elements, parent: limb.parent.matrixWorld.elements })}`)
        assert.ok(limb.position.length() <= 1.6, `${limb.name} root remains attached to body bounds`)
        assert.ok(Math.max(...limb.scale.toArray().map(Math.abs)) <= 1.25)
      }
    }
    if (reducedMotion) {
      for (let i = 0; i < limbs.children.length; i++) {
        assert.ok(limbs.children[i].quaternion.angleTo(initialQuaternions[i]) <= 1e-7, `${limbs.children[i].name} changed ${limbs.children[i].quaternion.angleTo(initialQuaternions[i])}`)
      }
    }

    jelly.dispose()
  })
}

test('limb resources dispose once despite shared jelly material and repeated teardown', async () => {
  const env = environment()
  const jelly = mountJellyCharacter(env.parent)
  await until(() => globalThis.jellyRenderer?.compiling)
  const renderer = globalThis.jellyRenderer
  renderer.resume()
  await until(() => env.jobs.size > 0)
  env.tick()
  const limbs = renderer.scene.getObjectByName('jelly-limbs')
  const resources = new Set(limbs.children.flatMap(limb => [limb.geometry, limb.material]))
  const releases = new Map([...resources].map(resource => [resource, 0]))
  for (const resource of resources) resource.addEventListener('dispose', () => releases.set(resource, releases.get(resource) + 1))

  jelly.dispose()
  jelly.dispose()
  renderer.onError()

  assert.equal(resources.size, 5)
  assert.deepEqual([...releases.values()], [1, 1, 1, 1, 1])
  assert.equal(renderer.disposals, 1)
  assert.equal(env.jobs.size, 0)
})

test('static fallback keeps the four-limb silhouette and body-bounded control', async () => {
  const env = environment()
  globalThis.jellyFailInit = true
  const jelly = mountJellyCharacter(env.parent)
  await until(() => jelly.getState().backend === 'static')
  const host = env.parent.children[0]
  const markup = host.markup

  for (const name of ['arm-left', 'arm-right', 'leg-left', 'leg-right']) {
    assert.equal((markup.match(new RegExp(`jelly-static-${name}`, 'g')) ?? []).length, 1)
  }
  assert.match(markup, /jelly-static-form/)
  assert.equal(host.dataset.ready, 'false')
  const button = host.querySelector('button')
  assert.equal(button.style.left, '25%')
  assert.equal(button.style.width, '50%')

  jelly.dispose()
})

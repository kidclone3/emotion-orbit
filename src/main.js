import './style.css'
import { analyzeEmotionMessage, EMOTIONS, EMOTION_ORDER } from './emotions.js'
import {
  createChatSession,
  createCompletionAnnouncer,
  isChatInFlight,
} from './chat-session.js'
import { bridgeSupportsChat, resolveBridgeConfig } from './bridge-config.js'
import { createPiChatClient } from './pi-chat.js'
import { resolveInitialQuality } from './render-policy.js'
import {
  createSafeLiquidExperience,
  createStaticLiquidExperience,
} from './safe-liquid-experience.js'
import { probeWebGLCapability } from './webgl-capability.js'

const bridgeConfig = resolveBridgeConfig({
  pageLocation: location,
  configuredUrl: import.meta.env.VITE_PI_CHAT_URL ?? '',
})
const localOnly = !bridgeSupportsChat(bridgeConfig)
const productThesis = localOnly
  ? 'Describe a feeling. The field translates your words into color and motion; Pi is unavailable on this static site.'
  : 'Describe a feeling. Pi responds, and the field translates your words into color and motion.'
const initialBridgeLabel = localOnly
  ? 'Local field ready · Pi unavailable here'
  : 'Pi connecting'
const initialConversation = localOnly
  ? '<article class="chat-message is-field"><span>Field</span><p>What is moving through you?</p></article>'
  : '<article class="chat-message is-assistant"><span>Pi</span><p>What is moving through you?</p></article>'

const app = document.querySelector('#app')
app.innerHTML = `
<main class="experience" data-emotion="wonder">
  <header class="topbar">
    <div class="brand" aria-label="Emotion Orbit">
      <span class="brand-mark" aria-hidden="true"></span>
      <span>EMOTION ORBIT</span>
    </div>
    <div class="service-cluster">
      <div class="status" id="bridge-status" role="status" aria-live="polite">
        <span class="status-dot" id="bridge-dot" aria-hidden="true"></span>
        <span>${initialBridgeLabel}</span>
      </div>
      <button class="text-control" id="reconnect-button" type="button"${localOnly ? ' hidden' : ''}>Reconnect</button>
    </div>
  </header>
  <section class="copy" aria-labelledby="main-title">
    <h1 id="main-title">Let feeling <em>take form.</em></h1>
    <p class="product-thesis">${productThesis}</p>
    <p class="intro" id="emotion-copy">${EMOTIONS.wonder.copy}</p>
    <p class="field-transition" id="field-transition">Field resting in wonder.</p>
    <section class="chat-panel" aria-label="${localOnly ? 'Local emotion field' : 'Conversation with Pi'}">
      <div class="chat-log" id="chat-log" role="log" aria-live="off">
        ${initialConversation}
      </div>
      <form class="mood-form" id="chat-form">
        <label class="sr-only" for="chat-input">Describe what you feel</label>
        <div class="input-row">
          <textarea id="chat-input" name="message" rows="1" maxlength="2000" placeholder="Describe what you feel…" required></textarea>
          <button id="send-button" type="submit">Send</button>
        </div>
        <div class="chat-actions" id="chat-actions" aria-label="Response controls" hidden>
          <button class="text-control" id="stop-button" type="button" hidden>Stop response</button>
          <button class="text-control" id="retry-button" type="button" hidden>Retry last message</button>
        </div>
        <p class="form-note" id="form-note" role="status" aria-live="polite">${localOnly ? 'The local field is ready.' : 'Connecting to Pi.'} Visual readings are interpretive, not diagnostic.</p>
      </form>
    </section>
  </section>
  <div class="scene-wrap" id="scene-wrap" aria-hidden="true">
    <div class="scene" id="scene"></div>
  </div>
  <p class="render-status" id="render-status" role="status" aria-live="polite" hidden></p>
  <nav class="emotion-nav" aria-label="Select an emotional state">
    ${EMOTION_ORDER.map((key) => `
      <button class="emotion-button${key === 'wonder' ? ' is-active' : ''}" type="button" data-emotion="${key}" aria-pressed="${key === 'wonder'}" style="--swatch:${EMOTIONS[key].primary}">
        <span class="emotion-index">${EMOTIONS[key].number}</span><span>${EMOTIONS[key].label}</span>
      </button>`).join('')}
  </nav>
  <p class="sr-only" id="emotion-announcement" aria-live="polite"></p>
  <p class="sr-only" id="pi-announcement" aria-live="polite"></p>
</main>`

const $ = (selector) => document.querySelector(selector)
const experience = $('.experience')
const sceneMount = $('#scene')
const sceneWrap = $('#scene-wrap')
const emotionCopy = $('#emotion-copy')
const fieldTransition = $('#field-transition')
const announcement = $('#emotion-announcement')
const piAnnouncement = $('#pi-announcement')
const formNote = $('#form-note')
const chatForm = $('#chat-form')
const chatInput = $('#chat-input')
const chatLog = $('#chat-log')
const chatSubmit = $('#send-button')
const chatActions = $('#chat-actions')
const stopButton = $('#stop-button')
const retryButton = $('#retry-button')
const reconnectButton = $('#reconnect-button')
const bridgeStatus = $('#bridge-status span:last-child')
const bridgeDot = $('#bridge-dot')
const renderStatus = $('#render-status')
const completionAnnouncer = createCompletionAnnouncer({
  schedule: requestAnimationFrame,
  publish: (message) => {
    piAnnouncement.textContent = message
  },
})
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches
const params = new URLSearchParams(location.search)
const requestedQuality = ['low', 'balanced', 'high'].includes(params.get('quality'))
  ? params.get('quality')
  : 'auto'
const quality = resolveInitialQuality({
  requested: requestedQuality,
  coarsePointer: matchMedia('(pointer: coarse)').matches,
  hardwareConcurrency: navigator.hardwareConcurrency,
  deviceMemory: navigator.deviceMemory,
})
const seedValue = Number(params.get('seed'))
const seed = Number.isFinite(seedValue) && params.has('seed') ? seedValue : 17

function showRenderStatus(status, message) {
  renderStatus.hidden = false
  renderStatus.dataset.status = status
  renderStatus.textContent = message
}

sceneMount.addEventListener('liquidstatus', (event) => {
  showRenderStatus(event.detail.status, event.detail.message)
})

function renderStaticFallback() {
  experience.classList.add('is-fallback')
  sceneMount.innerHTML = '<div class="static-orbit" aria-hidden="true"></div>'
  showRenderStatus(
    'fallback',
    'Visual field is using a static fallback. Emotion controls and local color changes still work.',
  )
}

const webglCapability = probeWebGLCapability()
let liquid
if (!webglCapability.supported) {
  renderStaticFallback()
  liquid = createStaticLiquidExperience()
} else {
  try {
    const { LiquidExperience } = await import('./liquid-experience.js')
    liquid = createSafeLiquidExperience({
      create: () => new LiquidExperience({
        mount: sceneMount,
        initialVisual: EMOTIONS.wonder,
        reduceMotion: reduceMotion,
        baseline: params.get('view') === 'no-post',
        quality,
        seed,
      }),
      onFailure: renderStaticFallback,
    })
  } catch {
    renderStaticFallback()
    liquid = createStaticLiquidExperience()
  }
}

let currentVisualContext = {
  label: EMOTIONS.wonder.label,
  primary: EMOTIONS.wonder.primary,
  accent: EMOTIONS.wonder.accent,
}

function setCssPalette(visual) {
  document.documentElement.style.setProperty('--emotion-primary', visual.primary)
  document.documentElement.style.setProperty('--emotion-accent', visual.accent)
  document.documentElement.style.setProperty('--emotion-bg', visual.background)
  document.documentElement.style.setProperty('--emotion-glow', visual.glow)
}

function applyVisualState(visual, name, source = 'control') {
  const emotion = EMOTIONS[name]
  if (!emotion) return

  liquid.setVisual(visual)
  currentVisualContext = {
    label: source === 'chat' ? `${emotion.label} blend` : emotion.label,
    primary: visual.primary,
    accent: visual.accent,
  }
  experience.dataset.emotion = name
  setCssPalette(visual)
  emotionCopy.textContent = emotion.copy
  fieldTransition.textContent = `Field tuned to ${emotion.label.toLowerCase()}.`
  announcement.textContent = `${emotion.label} visual state. ${emotion.copy}`
  document.querySelectorAll('.emotion-button').forEach((button) => {
    const active = button.dataset.emotion === name
    button.classList.toggle('is-active', active)
    button.setAttribute('aria-pressed', String(active))
  })
}

function selectEmotion(name) {
  const emotion = EMOTIONS[name]
  if (!emotion) return
  applyVisualState(emotion, name)
  if (localOnly || bridgeOnline) {
    formNote.textContent = 'Visual readings are interpretive, not diagnostic.'
  } else {
    formNote.textContent = withDisclaimer('Local field changed. Pi remains offline.')
  }
}

function pulseField() {
  liquid.pulse()
}


document.querySelectorAll('.emotion-button').forEach((button) => {
  button.addEventListener('click', () => selectEmotion(button.dataset.emotion))
})

const BRIDGE_LABELS = {
  connecting: 'Pi connecting',
  online: 'Pi online',
  reconnecting: 'Pi reconnecting',
  offline: 'Pi offline',
  'network-error': 'Pi network failure',
  closed: 'Pi connection closed',
  'local-only': 'Local field ready · Pi unavailable here',
}

let bridgeState = localOnly ? 'local-only' : 'connecting'
let bridgeOnline = false
let activeAssistantText = null
let messageSequence = 0
const chatSession = createChatSession()
bridgeDot.dataset.status = bridgeState

function nextMessageId() {
  return `message-${Date.now()}-${messageSequence++}`
}

function withDisclaimer(message) {
  return `${message} Visual readings are interpretive, not diagnostic.`
}

function appendChatMessage(role, text = '') {
  const article = document.createElement('article')
  article.className = `chat-message is-${role}`
  const author = document.createElement('span')
  author.textContent = role === 'assistant' ? 'Pi' : 'You'
  const body = document.createElement('p')
  body.textContent = text
  article.append(author, body)
  chatLog.append(article)
  chatLog.scrollTop = chatLog.scrollHeight
  return body
}

function syncChatControls() {
  const { status } = chatSession.getState()
  const inFlight = isChatInFlight(status)
  const retryable = status === 'failed' || status === 'cancelled'
  chatForm.setAttribute('aria-busy', String(inFlight))
  experience.dataset.chatState = status
  chatActions.hidden = !inFlight && !retryable
  chatSubmit.disabled = inFlight
  stopButton.hidden = !inFlight
  stopButton.disabled = status !== 'busy'
  retryButton.hidden = !retryable
  retryButton.disabled = inFlight
}

function finishAssistantUi() {
  activeAssistantText?.closest('.chat-message')?.classList.remove('is-typing')
  activeAssistantText = null
  syncChatControls()
}

function failCurrentResponse(message, errorKind = 'provider') {
  if (!chatSession.fail(message, errorKind)) return false
  if (activeAssistantText) {
    const article = activeAssistantText.closest('.chat-message')
    article.classList.remove('is-typing')
    article.classList.add('is-error')
    article.querySelector('span').textContent = 'Pi status'
    activeAssistantText.textContent = message
  }
  finishAssistantUi()
  formNote.textContent = withDisclaimer(
    errorKind === 'network'
      ? 'Network failure interrupted Pi. Reconnect, then retry the saved message.'
      : 'Pi or its provider could not complete the response. Retry the saved message.',
  )
  return true
}

function confirmCancellation() {
  if (!chatSession.confirmCancelled()) return false
  if (activeAssistantText) {
    const article = activeAssistantText.closest('.chat-message')
    article.classList.remove('is-typing')
    article.classList.add('is-cancelled')
    article.querySelector('span').textContent = 'Pi status'
    if (!activeAssistantText.textContent || activeAssistantText.textContent === 'Stopping response…') {
      activeAssistantText.textContent = 'Response stopped.'
    }
  }
  finishAssistantUi()
  formNote.textContent = withDisclaimer(
    'Pi response cancelled. Retry the saved message when ready.',
  )
  return true
}

function updateBridgeStatus(status, message) {
  const previousStatus = bridgeState
  bridgeState = status
  bridgeOnline = status === 'online'
  bridgeDot.dataset.status = status
  bridgeStatus.textContent = BRIDGE_LABELS[status] ?? 'Pi offline'
  reconnectButton.hidden = localOnly || status === 'online' || status === 'connecting'

  if (status === 'local-only') {
    formNote.textContent = 'Visual readings are interpretive, not diagnostic.'
    return
  }

  if (
    !bridgeOnline
    && ['busy', 'cancelling'].includes(chatSession.getState().status)
  ) {
    failCurrentResponse(
      message || 'Pi disconnected before completing the response.',
      'network',
    )
    return
  }

  const chatStatus = chatSession.getState().status
  if (chatStatus === 'busy' || chatStatus === 'cancelling') return
  if (bridgeOnline && (chatStatus === 'failed' || chatStatus === 'cancelled')) {
    formNote.textContent = withDisclaimer('Pi is online. Retry the saved message when ready.')
    return
  }
  if (bridgeOnline) {
    formNote.textContent = ['offline', 'network-error', 'reconnecting'].includes(previousStatus)
      ? withDisclaimer('Pi reconnected.')
      : 'Visual readings are interpretive, not diagnostic.'
    return
  }
  formNote.textContent = withDisclaimer(
    message || 'Pi is unavailable; the local emotion field still works.',
  )
}

function announceCompletedResponse(message) {
  completionAnnouncer.announce(message)
}

function handlePiMessage(message) {
  if (message.type === 'bridge_status') {
    updateBridgeStatus(message.status, message.message)
    return
  }

  if (message.type === 'assistant_delta') {
    if (chatSession.getState().status !== 'busy') return
    chatSession.append(message.delta)
    if (!activeAssistantText) {
      activeAssistantText = appendChatMessage('assistant')
      activeAssistantText.closest('.chat-message').classList.add('is-typing')
    }
    const textNode = activeAssistantText.firstChild
      ?? activeAssistantText.appendChild(document.createTextNode(''))
    textNode.appendData(message.delta)
    chatLog.scrollTop = chatLog.scrollHeight
    return
  }

  if (message.type === 'assistant_done') {
    if (chatSession.getState().status === 'cancelling') {
      confirmCancellation()
      return
    }
    if (chatSession.getState().status !== 'busy') return
    if (!chatSession.getState().response.trim()) {
      if (!activeAssistantText) activeAssistantText = appendChatMessage('assistant')
      failCurrentResponse('Pi returned no text. Retry the saved message.', 'provider')
      return
    }
    const completion = chatSession.complete()
    finishAssistantUi()
    formNote.textContent = withDisclaimer('Pi response complete.')
    if (completion) announceCompletedResponse(completion)
    return
  }

  if (message.type === 'assistant_error') {
    if (chatSession.getState().status === 'cancelling') {
      confirmCancellation()
      return
    }
    if (chatSession.getState().status !== 'busy') return
    if (!activeAssistantText) activeAssistantText = appendChatMessage('assistant')
    failCurrentResponse(message.message, 'provider')
  }
}

const piChat = localOnly
  ? null
  : createPiChatClient({
      url: bridgeConfig.url,
      onMessage: handlePiMessage,
      onStatus: updateBridgeStatus,
    })
if (localOnly) updateBridgeStatus('local-only')

function dispatchPrompt(prompt) {
  syncChatControls()
  if (!bridgeOnline) {
    chatSession.fail('Pi is offline.', 'network')
    syncChatControls()
    formNote.textContent = withDisclaimer(
      'Field changed locally. Pi is offline; reconnect, then retry the saved message.',
    )
    return false
  }

  try {
    piChat.send(prompt.message, prompt.id, prompt.visual)
  } catch {
    chatSession.fail('Pi connection failed.', 'network')
    syncChatControls()
    formNote.textContent = withDisclaimer(
      'Field changed locally. Pi could not receive the message; reconnect and retry.',
    )
    return false
  }

  activeAssistantText = appendChatMessage('assistant')
  activeAssistantText.closest('.chat-message').classList.add('is-typing')
  formNote.textContent = withDisclaimer('Pi is responding. The local field has already changed.')
  return true
}

chatForm.addEventListener('submit', (event) => {
  event.preventDefault()
  const message = chatInput.value.trim()
  if (!message || isChatInFlight(chatSession.getState().status)) {
    chatInput.focus()
    return
  }

  const reading = analyzeEmotionMessage(message, currentVisualContext)
  const prompt = {
    id: nextMessageId(),
    message,
    visual: {
      label: `${EMOTIONS[reading.dominant].label} blend`,
      primary: reading.visual.primary,
      accent: reading.visual.accent,
    },
  }

  appendChatMessage('user', message)
  chatInput.value = ''
  applyVisualState(reading.visual, reading.dominant, 'chat')
  pulseField()
  if (localOnly) {
    formNote.textContent = 'Visual readings are interpretive, not diagnostic.'
    syncChatControls()
    return
  }
  chatSession.begin(prompt)
  dispatchPrompt(prompt)
})

stopButton.addEventListener('click', () => {
  piChat?.abort()
  if (!chatSession.cancel()) return
  if (activeAssistantText) {
    const article = activeAssistantText.closest('.chat-message')
    article.classList.remove('is-typing')
    article.querySelector('span').textContent = 'Pi status'
    activeAssistantText.textContent ||= 'Stopping response…'
  }
  syncChatControls()
  formNote.textContent = withDisclaimer('Cancelling the Pi response…')
})

retryButton.addEventListener('click', () => {
  if (!bridgeOnline) {
    formNote.textContent = withDisclaimer(
      'Pi is offline. Reconnect before retrying the saved message.',
    )
    reconnectButton.focus()
    return
  }
  const prompt = chatSession.retry(nextMessageId())
  if (!prompt) return
  dispatchPrompt(prompt)
})

reconnectButton.addEventListener('click', () => {
  piChat?.reconnect()
})

chatInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault()
    chatForm.requestSubmit()
  }
})

const handleResize = liquid.scheduleResize
const handleVisibilityChange = () => liquid.setHidden(document.hidden)
const sceneObserver = new ResizeObserver(liquid.scheduleResize)

function shutdown() {
  sceneObserver.disconnect()
  removeEventListener('resize', handleResize)
  document.removeEventListener('visibilitychange', handleVisibilityChange)
  piChat?.close()
  liquid.destroy()
}

addEventListener('beforeunload', shutdown, { once: true })
addEventListener('resize', handleResize, { passive: true })
sceneObserver.observe(sceneWrap)
document.addEventListener('visibilitychange', handleVisibilityChange)
setCssPalette(EMOTIONS.wonder)
syncChatControls()

window.__emotionOrbit = {
  getState: () => ({
    ...liquid.getState(),
    emotion: experience.dataset.emotion,
    bridge: bridgeState,
    bridgeMode: bridgeConfig.mode,
    webglCapability,
    chat: chatSession.getState(),
  }),
  selectEmotion,
  pulse: pulseField,
  reconnect: () => piChat?.reconnect() ?? false,
}

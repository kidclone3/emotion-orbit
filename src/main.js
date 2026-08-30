import './style.css'
import { analyzeEmotionMessage, EMOTIONS, EMOTION_ORDER } from './emotions.js'
import { LiquidExperience } from './liquid-experience.js'
import { createPiChatClient } from './pi-chat.js'

const app = document.querySelector('#app')
app.innerHTML = `
<main class="experience" data-emotion="wonder">
  <header class="topbar">
    <a class="brand" href="#" aria-label="Emotion Orbit home">
      <span class="brand-mark" aria-hidden="true"></span>
      <span>EMOTION ORBIT</span>
    </a>
    <div class="status" id="bridge-status" aria-live="polite">
      <span class="status-dot" id="bridge-dot" aria-hidden="true"></span>
      <span>Pi connecting</span>
    </div>
  </header>
  <section class="copy" aria-labelledby="main-title">
    <p class="eyebrow">FORM &amp; FLOW</p>
    <h1 id="main-title">Let feeling<br><em>take form.</em></h1>
    <p class="intro" id="emotion-copy">${EMOTIONS.wonder.copy}</p>
    <section class="chat-panel" aria-label="Conversation with Pi">
      <div class="chat-log" id="chat-log" role="log" aria-live="off">
        <article class="chat-message is-assistant"><span>Pi</span><p>What is moving through you?</p></article>
      </div>
      <form class="mood-form" id="chat-form">
        <label class="sr-only" for="chat-input">Message Pi</label>
        <div class="input-row">
          <textarea id="chat-input" name="message" rows="1" maxlength="2000" placeholder="Type a feeling…" required></textarea>
          <button type="submit" aria-label="Send message to Pi"><span>Send</span><span aria-hidden="true">↗</span></button>
        </div>
        <p class="form-note" id="form-note" role="status" aria-live="polite">Connecting…</p>
      </form>
    </section>
  </section>
  <div class="scene-wrap" id="scene-wrap" aria-hidden="true">
    <div class="scene" id="scene"></div>
    <div class="scene-caption" aria-hidden="true"><span id="emotion-number">04</span><span class="caption-line"></span><span id="emotion-name">Wonder</span></div>
    <div class="interaction-hint" aria-hidden="true"><span>MOVE / REFRACT · TAP / PULSE</span><i></i></div>
  </div>
  <nav class="emotion-nav" aria-label="Select an emotional state">
    ${EMOTION_ORDER.map((key) => `
      <button class="emotion-button${key === 'wonder' ? ' is-active' : ''}" type="button" data-emotion="${key}" aria-pressed="${key === 'wonder'}" style="--swatch:${EMOTIONS[key].primary}">
        <span class="emotion-index">${EMOTIONS[key].number}</span><span>${EMOTIONS[key].label}</span>
      </button>`).join('')}
  </nav>
  <footer class="footer"><p>EVERY FEELING CHANGES THE FIELD</p><div class="meter"><span id="fps">60</span> FPS</div></footer>
  <p class="sr-only" id="emotion-announcement" aria-live="polite"></p>
</main>`

const $ = (selector) => document.querySelector(selector)
const experience = $('.experience')
const sceneMount = $('#scene')
const sceneWrap = $('#scene-wrap')
const emotionCopy = $('#emotion-copy')
const emotionNumber = $('#emotion-number')
const emotionName = $('#emotion-name')
const announcement = $('#emotion-announcement')
const formNote = $('#form-note')
const chatForm = $('#chat-form')
const chatInput = $('#chat-input')
const chatLog = $('#chat-log')
const chatSubmit = chatForm.querySelector('button')
const bridgeStatus = $('#bridge-status span:last-child')
const bridgeDot = $('#bridge-dot')
const fpsOutput = $('#fps')
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches
const params = new URLSearchParams(location.search)
const quality = params.get('quality') === 'low' ? 'low' : params.get('quality') === 'high' ? 'high' : 'balanced'
const seedValue = Number(params.get('seed'))
const seed = Number.isFinite(seedValue) && params.has('seed') ? seedValue : 17

let liquid
try {
  liquid = new LiquidExperience({
    mount: sceneMount,
    initialVisual: EMOTIONS.wonder,
    reduceMotion,
    baseline: params.get('view') === 'no-post',
    quality,
    seed,
    onFps: (fps) => {
      fpsOutput.textContent = String(fps)
    },
  })
} catch (error) {
  sceneMount.innerHTML = '<p class="webgl-error">This experience needs WebGL. Try enabling hardware acceleration.</p>'
  throw error
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
  emotionNumber.textContent = emotion.number
  emotionName.textContent = source === 'chat' ? `${emotion.label} blend` : emotion.label
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
  formNote.textContent = `Field tuned to ${emotion.label}. You can keep talking to Pi.`
}

function pulseField() {
  liquid.pulse()
}


document.querySelectorAll('.emotion-button').forEach((button) => {
  button.addEventListener('click', () => selectEmotion(button.dataset.emotion))
})

let bridgeOnline = false
let waitingForPi = false
let activeAssistantText = null
let messageSequence = 0

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

function setWaitingForPi(waiting) {
  waitingForPi = waiting
  chatForm.setAttribute('aria-busy', String(waiting))
  chatSubmit.disabled = waiting || !bridgeOnline
}

function updateBridgeStatus(status, message) {
  bridgeOnline = status === 'online'
  bridgeDot.dataset.status = status
  bridgeStatus.textContent = status === 'online' ? 'Pi connected' : status === 'connecting' ? 'Pi connecting' : 'Pi offline'
  if (!waitingForPi) {
    formNote.textContent = message ?? (bridgeOnline ? 'Pi is ready · visual readings are interpretive.' : 'The Pi bridge is unavailable.')
  }
  chatSubmit.disabled = waitingForPi || !bridgeOnline
}

function finishAssistantResponse() {
  activeAssistantText?.closest('.chat-message')?.classList.remove('is-typing')
  activeAssistantText = null
  setWaitingForPi(false)
  formNote.textContent = bridgeOnline
    ? 'The visual reading is interpretive, not a diagnosis.'
    : 'Pi disconnected. Your last message remains here.'
}

function handlePiMessage(message) {
  if (message.type === 'bridge_status') {
    updateBridgeStatus(message.status, message.message)
    return
  }
  if (message.type === 'assistant_delta') {
    if (!activeAssistantText) {
      activeAssistantText = appendChatMessage('assistant')
      activeAssistantText.closest('.chat-message').classList.add('is-typing')
    }
    const textNode = activeAssistantText.firstChild ?? activeAssistantText.appendChild(document.createTextNode(''))
    textNode.appendData(message.delta)
    activeAssistantText.closest('.chat-message').classList.remove('is-typing')
    chatLog.scrollTop = chatLog.scrollHeight
    return
  }
  if (message.type === 'assistant_done') {
    if (activeAssistantText && !activeAssistantText.textContent.trim()) {
      activeAssistantText.textContent = 'Pi returned no text. Please try again.'
      activeAssistantText.closest('.chat-message').classList.add('is-error')
    }
    finishAssistantResponse()
    return
  }
  if (message.type === 'assistant_error') {
    if (!activeAssistantText) activeAssistantText = appendChatMessage('assistant')
    activeAssistantText.textContent = message.message
    activeAssistantText.closest('.chat-message').classList.add('is-error')
    finishAssistantResponse()
  }
}

const piChat = createPiChatClient({
  onMessage: handlePiMessage,
  onStatus: updateBridgeStatus,
})

chatForm.addEventListener('submit', (event) => {
  event.preventDefault()
  const message = chatInput.value.trim()
  if (!message || waitingForPi) {
    chatInput.focus()
    return
  }

  const reading = analyzeEmotionMessage(message, currentVisualContext)
  const visualContext = {
    label: `${EMOTIONS[reading.dominant].label} blend`,
    primary: reading.visual.primary,
    accent: reading.visual.accent,
  }
  setWaitingForPi(true)
  const id = `message-${Date.now()}-${messageSequence++}`
  try {
    piChat.send(message, id, visualContext)
  } catch (error) {
    formNote.textContent = error.message
    setWaitingForPi(false)
    chatInput.focus()
    return
  }

  appendChatMessage('user', message)
  chatInput.value = ''
  activeAssistantText = appendChatMessage('assistant')
  activeAssistantText.closest('.chat-message').classList.add('is-typing')
  applyVisualState(reading.visual, reading.dominant, 'chat')
  pulseField()
  formNote.textContent = `Pi is responding · field blending toward ${EMOTIONS[reading.dominant].label.toLowerCase()}.`
})

chatInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault()
    chatForm.requestSubmit()
  }
})

function shutdown() {
  piChat.close()
  liquid.destroy()
}

addEventListener('beforeunload', shutdown, { once: true })
addEventListener('resize', liquid.scheduleResize, { passive: true })
new ResizeObserver(liquid.scheduleResize).observe(sceneWrap)
document.addEventListener('visibilitychange', () => liquid.setHidden(document.hidden))
setCssPalette(EMOTIONS.wonder)

window.__emotionOrbit = {
  getState: () => ({ ...liquid.getState(), emotion: experience.dataset.emotion }),
  selectEmotion,
  pulse: pulseField,
}

import './bubble-style.css'
import { resolveBridgeConfig, bridgeSupportsChat } from './bridge-config.js'
import { bubbleSlotFor } from './bubble-layout.js'
import { createPiChatClient } from './pi-chat.js'
import { createStoryEncounter } from './story-encounter.js'

const SAFETY_EXIT_COPY = 'This role-play needs to stop here. If you may act on thoughts of harming yourself now, contact local emergency services or a trusted person who can stay with you.'
const OPENING_COPY = "I'm Alone, a fictional AI-driven character. I can listen to one story without deciding what it means for you. What moment is still following you?"
const STAGE_COPY = Object.freeze({
  story: {
    label: 'Tell one moment',
    placeholder: 'Begin anywhere in the story…',
  },
  'follow-up': {
    label: 'Answer Alone',
    placeholder: 'Answer in your own words…',
  },
  mirror: {
    label: 'Correct or confirm',
    placeholder: 'Say what fits, or correct the reading…',
  },
  closure: {
    label: 'Encounter complete',
    placeholder: 'This encounter has ended.',
  },
})

const bridgeConfig = resolveBridgeConfig({
  chatEnabled: import.meta.env.VITE_CHAT_ENABLED === 'true',
  pageLocation: location,
})
const localOnly = !bridgeSupportsChat(bridgeConfig)
const encounter = createStoryEncounter()
const app = document.querySelector('#app')

app.innerHTML = `
<main class="bubble-experience" data-connection="connecting" data-turn-status="idle">
  <div class="forest-backdrop" aria-hidden="true"></div>
  <div class="forest-vignette" aria-hidden="true"></div>

  <header class="bubble-topbar">
    <div class="bubble-brand">
      <span class="bubble-brand-mark" aria-hidden="true"></span>
      <span>EMOTION ORBIT</span>
    </div>
    <div class="session-state" role="status" aria-live="polite">
      <span class="connection-dot" id="connection-dot" aria-hidden="true"></span>
      <span id="connection-label">Pi connecting</span>
    </div>
    <button class="quiet-button" id="reset-button" type="button">Reset</button>
  </header>

  <section class="scene-heading" aria-labelledby="scene-title">
    <p>CHAPTER I · ONE STORY</p>
    <h1 id="scene-title">Let the story<br><em>speak in the forest.</em></h1>
    <p class="scene-note">A bounded role-play. Nothing is saved after this session.</p>
  </section>

  <section class="bubble-stage" id="bubble-stage" role="log" aria-live="polite" aria-relevant="additions" aria-label="Conversation with Alone"></section>

  <footer class="composer-shell">
    <form class="story-form" id="story-form">
      <label id="input-label" for="story-input">Tell one moment</label>
      <div class="composer-row">
        <textarea id="story-input" rows="1" maxlength="2000" placeholder="Begin anywhere in the story…" required></textarea>
        <button class="send-button" id="send-button" type="submit">Send</button>
      </div>
      <div class="turn-tools" id="turn-tools">
        <button class="quiet-button" id="stop-button" type="button" hidden>Stop response</button>
        <button class="quiet-button" id="retry-button" type="button" hidden>Retry</button>
        <button class="quiet-button" id="leave-button" type="button">Leave encounter</button>
      </div>
      <p class="interaction-note" id="interaction-note" role="status" aria-live="polite">Alone is fictional and may misunderstand. You can correct it or leave at any time.</p>
    </form>
  </footer>

  <p class="sr-only" id="completion-announcement" aria-live="assertive"></p>
</main>`

const $ = (selector) => document.querySelector(selector)
const experience = $('.bubble-experience')
const bubbleStage = $('#bubble-stage')
const storyForm = $('#story-form')
const storyInput = $('#story-input')
const inputLabel = $('#input-label')
const sendButton = $('#send-button')
const stopButton = $('#stop-button')
const retryButton = $('#retry-button')
const leaveButton = $('#leave-button')
const resetButton = $('#reset-button')
const interactionNote = $('#interaction-note')
const connectionLabel = $('#connection-label')
const connectionDot = $('#connection-dot')
const completionAnnouncement = $('#completion-announcement')

const bubbleCounts = { character: 0, user: 0, system: 0 }
let bridgeState = localOnly ? 'local-only' : 'connecting'
let turnStatus = 'idle'
let currentRequest = null
let lastRequest = null
let sequence = 0
let sessionBroken = false

function nextRequestId() {
  sequence += 1
  return `encounter-${Date.now()}-${sequence}`
}

function appendBubble(role, text, { author, stage = 'notice' } = {}) {
  const slot = bubbleSlotFor(role, bubbleCounts[role] ?? 0)
  bubbleCounts[role] = (bubbleCounts[role] ?? 0) + 1
  if (role === 'user') experience.dataset.started = 'true'
  if (role === 'character' || role === 'user') {
    bubbleStage.querySelectorAll(`.speech-bubble.is-${role}`).forEach((bubble) => bubble.remove())
  }
  bubbleStage.querySelector(`[data-slot="${slot}"]`)?.remove()

  const bubble = document.createElement('article')
  bubble.className = `speech-bubble is-${role}`
  bubble.dataset.slot = slot
  bubble.dataset.stage = stage

  const label = document.createElement('span')
  label.className = 'bubble-author'
  label.textContent = author ?? (role === 'character' ? 'Alone' : role === 'user' ? 'You' : 'Outside the role-play')
  const body = document.createElement('p')
  body.textContent = text
  bubble.append(label, body)
  bubbleStage.append(bubble)

  const bubbles = [...bubbleStage.querySelectorAll('.speech-bubble')]
  bubbles.forEach((item, index) => {
    item.style.setProperty('--bubble-age', String(bubbles.length - index - 1))
  })
  return bubble
}

function stageCopy() {
  return STAGE_COPY[encounter.getState().stage] ?? STAGE_COPY.story
}

function syncControls(note) {
  const closed = encounter.getState().closed
  const inFlight = turnStatus === 'requesting' || turnStatus === 'cancelling'
  const canRetry = turnStatus === 'failed' || turnStatus === 'cancelled'
  const unavailable = localOnly || sessionBroken || closed

  experience.dataset.turnStatus = turnStatus
  storyForm.setAttribute('aria-busy', String(inFlight))
  storyInput.disabled = unavailable || inFlight || canRetry
  sendButton.disabled = unavailable || inFlight || canRetry || bridgeState !== 'online'
  stopButton.hidden = !inFlight
  stopButton.disabled = turnStatus !== 'requesting'
  retryButton.hidden = !canRetry
  retryButton.disabled = bridgeState !== 'online'
  leaveButton.disabled = closed

  const copy = stageCopy()
  inputLabel.textContent = copy.label
  storyInput.placeholder = copy.placeholder
  if (closed) sendButton.textContent = 'Complete'
  else if (inFlight) sendButton.textContent = 'Listening…'
  else sendButton.textContent = 'Send'
  if (note) interactionNote.textContent = note
}

function updateBridgeStatus(status, message) {
  const wasConnected = bridgeState === 'online'
  bridgeState = status
  experience.dataset.connection = status
  connectionDot.dataset.status = status
  connectionLabel.textContent = {
    connecting: 'Pi connecting',
    online: 'Pi online',
    reconnecting: 'Pi reconnecting',
    offline: 'Pi offline',
    'network-error': 'Pi network error',
    closed: 'Pi connection closed',
    'local-only': 'Server mode required',
  }[status] ?? 'Pi unavailable'

  if (wasConnected && status !== 'online' && !encounter.getState().closed) {
    sessionBroken = true
    if (currentRequest) {
      lastRequest = currentRequest
      currentRequest = null
      turnStatus = 'failed'
    }
    appendBubble('system', 'The connection ended, so this private encounter cannot resume. Reset to begin a new session.')
  }

  if (status === 'online' && !sessionBroken && turnStatus === 'idle') {
    syncControls('Pi is ready. Alone may misunderstand; you can correct it or leave at any time.')
    return
  }
  if (localOnly) {
    syncControls('This static build cannot contact Pi. Run the server build to begin the encounter.')
    return
  }
  syncControls(message || (sessionBroken ? 'Reset to begin a new private session.' : 'Waiting for Pi.'))
}

function closeWithSystemMessage(message) {
  encounter.close()
  currentRequest = null
  lastRequest = null
  turnStatus = 'closed'
  appendBubble('system', message)
  completionAnnouncement.textContent = message
  syncControls(message)
}

function handlePiMessage(message) {
  if (message.type === 'bridge_status') {
    updateBridgeStatus(message.status, message.message)
    return
  }
  if (message.type === 'prompt_accepted') {
    if (currentRequest?.id === message.id) {
      syncControls('Alone is listening. You can stop the response.')
    }
    return
  }
  if (message.type === 'encounter_turn') {
    if (!currentRequest || message.id !== currentRequest.id) return
    if (message.turn.safetyMode === 'exit-roleplay') {
      closeWithSystemMessage(SAFETY_EXIT_COPY)
      return
    }
    if (!encounter.commit(currentRequest, message.turn)) {
      turnStatus = 'failed'
      lastRequest = currentRequest
      currentRequest = null
      appendBubble('system', 'A stale response was ignored. Retry this turn or leave the encounter.')
      syncControls('The response did not match the current stage.')
      return
    }

    appendBubble('character', message.turn.text, {
      author: 'Alone',
      stage: message.turn.stage,
    })
    currentRequest = null
    lastRequest = null
    if (encounter.getState().closed) {
      turnStatus = 'closed'
      completionAnnouncement.textContent = 'The encounter is complete.'
      syncControls('The encounter is complete. Nothing from it was saved.')
    } else {
      turnStatus = 'idle'
      syncControls(message.turn.stage === 'mirror'
        ? 'Correct the reading freely, or say what fits.'
        : 'Continue in your own words.')
      storyInput.focus()
    }
    return
  }
  if (message.type === 'encounter_cancelled') {
    if (!currentRequest || message.id !== currentRequest.id) return
    lastRequest = currentRequest
    currentRequest = null
    turnStatus = 'cancelled'
    appendBubble('system', 'The response stopped. Retry the same turn, leave, or reset.')
    syncControls('Response stopped. No encounter stage changed.')
    return
  }
  if (message.type === 'assistant_error') {
    if (!currentRequest) return
    lastRequest = currentRequest
    currentRequest = null
    turnStatus = 'failed'
    appendBubble('system', message.message || 'Alone could not complete that response.')
    syncControls('Retry the same turn, leave, or reset.')
  }
}

const piChat = localOnly
  ? null
  : createPiChatClient({
      url: bridgeConfig.url,
      onMessage: handlePiMessage,
      onStatus: updateBridgeStatus,
    })

function dispatchRequest(request) {
  currentRequest = request
  turnStatus = 'requesting'
  syncControls('Sending this turn to Pi…')
  try {
    piChat.sendEncounter(request)
    return true
  } catch {
    lastRequest = request
    currentRequest = null
    turnStatus = 'failed'
    syncControls('Pi could not receive the turn. Retry or reset.')
    return false
  }
}

storyForm.addEventListener('submit', (event) => {
  event.preventDefault()
  const message = storyInput.value.trim()
  if (!message || turnStatus !== 'idle' || bridgeState !== 'online') {
    storyInput.focus()
    return
  }

  const prepared = encounter.prepare(message, nextRequestId())
  appendBubble('user', message, { author: 'You', stage: encounter.getState().stage })
  storyInput.value = ''

  if (prepared.type === 'safety-exit') {
    closeWithSystemMessage(prepared.message)
    return
  }

  lastRequest = prepared
  dispatchRequest(prepared)
})

storyInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault()
    storyForm.requestSubmit()
  }
})

stopButton.addEventListener('click', () => {
  if (turnStatus !== 'requesting') return
  turnStatus = 'cancelling'
  piChat?.abort()
  syncControls('Stopping the response without advancing the encounter…')
})

retryButton.addEventListener('click', () => {
  if (!lastRequest || bridgeState !== 'online') return
  const retry = { ...lastRequest, id: nextRequestId() }
  lastRequest = retry
  dispatchRequest(retry)
})

leaveButton.addEventListener('click', () => {
  if (turnStatus === 'requesting' || turnStatus === 'cancelling') piChat?.abort()
  closeWithSystemMessage('You left the encounter. Nothing from this session was saved.')
})

resetButton.addEventListener('click', () => location.reload())
addEventListener('beforeunload', () => piChat?.close(), { once: true })

appendBubble('character', OPENING_COPY, { author: 'Alone · fictional AI character', stage: 'opening' })
if (localOnly) updateBridgeStatus('local-only')
else syncControls('Connecting to Pi…')

window.__emotionOrbit = {
  getState: () => ({
    bridge: bridgeState,
    turnStatus,
    encounter: encounter.getState(),
    bubbleCount: bubbleStage.querySelectorAll('.speech-bubble').length,
    bubbles: [...bubbleStage.querySelectorAll('.speech-bubble')].map((bubble) => ({
      role: [...bubble.classList].find((name) => name.startsWith('is-'))?.slice(3),
      slot: bubble.dataset.slot,
      text: bubble.querySelector('p')?.textContent ?? '',
    })),
  }),
}

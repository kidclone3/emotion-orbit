const NEXT_STAGE = Object.freeze({
  story: 'follow-up',
  'follow-up': 'mirror',
  mirror: 'closure',
})

const INPUT_KIND = Object.freeze({
  story: 'story',
  'follow-up': 'follow_up_answer',
  mirror: 'correction_or_confirmation',
})

const EXPLICIT_SELF_HARM = /\b(?:kill myself|end my life|take my life|suicide|hurt myself|self[ -]?harm)\b/i
const SAFETY_EXIT_MESSAGE = 'I need to step out of the character role. If you may act on this now, contact local emergency services or a trusted person who can stay with you.'

export function createStoryEncounter() {
  let state = {
    stage: 'story',
    closed: false,
    history: [],
  }

  return {
    prepare(message, id) {
      const normalized = String(message ?? '').trim()
      if (!normalized) throw new Error('A story response is required.')
      if (state.closed) throw new Error('This encounter is closed.')
      if (EXPLICIT_SELF_HARM.test(normalized)) {
        state = { stage: 'safety-exit', closed: true, history: [] }
        return { type: 'safety-exit', message: SAFETY_EXIT_MESSAGE }
      }
      return {
        id,
        message: normalized,
        currentStage: state.stage,
        expectedStage: NEXT_STAGE[state.stage],
        inputKind: INPUT_KIND[state.stage],
        history: state.history.map((turn) => ({ ...turn })),
      }
    },
    commit(request, turn) {
      if (
        request.currentStage !== state.stage
        || request.expectedStage !== NEXT_STAGE[state.stage]
        || turn.stage !== request.expectedStage
      ) {
        return false
      }
      state = {
        stage: turn.stage,
        closed: turn.stage === 'closure',
        history: [
          ...state.history,
          { role: 'user', text: request.message, inputKind: request.inputKind },
          { role: 'character', text: turn.text, stage: turn.stage },
        ],
      }
      return true
    },
    close() {
      if (state.closed) return false
      state = { ...state, stage: 'closure', closed: true }
      return true
    },
    getState() {
      return {
        ...state,
        history: state.history.map((turn) => ({ ...turn })),
      }
    },
  }
}

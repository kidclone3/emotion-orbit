export function isChatInFlight(status) {
  return status === 'busy' || status === 'cancelling'
}

export function createChatSession() {
  let state = {
    status: 'idle',
    prompt: null,
    response: '',
    errorKind: null,
  }

  return {
    begin(prompt) {
      state = { status: 'busy', prompt: { ...prompt }, response: '', errorKind: null }
    },
    append(delta) {
      if (state.status === 'busy') state.response += delta
      return null
    },
    complete() {
      if (state.status !== 'busy') return null
      state.status = 'success'
      return state.response.trim() ? `Pi responded: ${state.response}` : null
    },
    fail(_message, errorKind = 'provider') {
      if (!['busy', 'cancelling'].includes(state.status)) return false
      state.status = 'failed'
      state.errorKind = errorKind
      return true
    },
    cancel() {
      if (state.status !== 'busy') return false
      state.status = 'cancelling'
      state.errorKind = null
      return true
    },
    confirmCancelled() {
      if (state.status !== 'cancelling') return false
      state.status = 'cancelled'
      state.response = ''
      return true
    },
    retry(id) {
      if (!['failed', 'cancelled'].includes(state.status) || !state.prompt) return null
      const prompt = { ...state.prompt, id }
      state = { status: 'busy', prompt, response: '', errorKind: null }
      return { ...prompt }
    },
    getState() {
      return {
        ...state,
        prompt: state.prompt ? { ...state.prompt } : null,
      }
    },
  }
}

export function createCompletionAnnouncer({ schedule, publish }) {
  const queue = []
  let scheduled = false

  function drain() {
    if (scheduled || queue.length === 0) return
    scheduled = true
    publish('')
    schedule(() => {
      publish(queue.shift())
      scheduled = false
      drain()
    })
  }

  return {
    announce(message) {
      queue.push(message)
      drain()
    },
  }
}

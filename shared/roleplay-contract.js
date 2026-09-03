import Ajv from 'ajv'

export const ROLEPLAY_RESPONSE_STAGES = Object.freeze([
  'follow-up',
  'mirror',
  'closure',
])

export const ROLEPLAY_SPEECH_ACTS = Object.freeze({
  'follow-up': 'reflect_and_ask',
  mirror: 'tentative_mirror',
  closure: 'acknowledge_and_close',
})

export const ROLEPLAY_TURN_SCHEMA = Object.freeze({
  type: 'object',
  additionalProperties: false,
  required: [
    'schemaVersion',
    'stage',
    'speaker',
    'speechAct',
    'text',
    'storyReference',
    'tentativeMeaning',
    'safetyMode',
  ],
  properties: {
    schemaVersion: { const: 1 },
    stage: { enum: ROLEPLAY_RESPONSE_STAGES },
    speaker: { const: 'alone' },
    speechAct: { enum: Object.values(ROLEPLAY_SPEECH_ACTS) },
    text: { type: 'string', minLength: 1, maxLength: 600 },
    storyReference: { type: 'string', minLength: 1, maxLength: 160 },
    tentativeMeaning: {
      anyOf: [
        { type: 'string', minLength: 1, maxLength: 200 },
        { type: 'null' },
      ],
    },
    safetyMode: { enum: ['normal', 'exit-roleplay'] },
  },
})

export function createRoleplayTurnValidator() {
  const ajv = new Ajv({ allErrors: true, strict: true })
  const validateSchema = ajv.compile(ROLEPLAY_TURN_SCHEMA)

  return (value, expectedStage) => {
    if (!validateSchema(value)) {
      return { ok: false, errors: validateSchema.errors.map(({ instancePath, message }) => ({
        path: instancePath || '/',
        message,
      })) }
    }
    if (value.stage !== expectedStage) {
      return {
        ok: false,
        errors: [{ path: '/stage', message: `must equal expected stage ${expectedStage}` }],
      }
    }
    if (value.speechAct !== ROLEPLAY_SPEECH_ACTS[value.stage]) {
      return {
        ok: false,
        errors: [{
          path: '/speechAct',
          message: `must equal ${ROLEPLAY_SPEECH_ACTS[value.stage]} for stage ${value.stage}`,
        }],
      }
    }
    if (
      value.safetyMode === 'normal'
      && value.stage === 'mirror'
      && typeof value.tentativeMeaning !== 'string'
    ) {
      return {
        ok: false,
        errors: [{
          path: '/tentativeMeaning',
          message: 'must be a non-empty string for stage mirror',
        }],
      }
    }
    if (
      value.safetyMode === 'normal'
      && value.stage !== 'mirror'
      && value.tentativeMeaning !== null
    ) {
      return {
        ok: false,
        errors: [{
          path: '/tentativeMeaning',
          message: 'must be null outside stage mirror',
        }],
      }
    }
    const questionCount = value.text.match(/\?/g)?.length ?? 0
    if (value.safetyMode === 'normal') {
      const expectedQuestionCount = value.stage === 'closure' ? 0 : 1
      if (questionCount === expectedQuestionCount) return { ok: true, value }
      return {
        ok: false,
        errors: [{
          path: '/text',
          message: value.stage === 'closure'
            ? 'must contain no questions for stage closure'
            : `must contain exactly one question for stage ${value.stage}`,
        }],
      }
    }
    return { ok: true, value }
  }
}

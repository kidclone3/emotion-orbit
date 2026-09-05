import assert from 'node:assert/strict'
import test from 'node:test'

import { bubbleSlotFor } from '../src/bubble-layout.js'

test('positions character and user bubbles in distinct scene lanes', () => {
  assert.equal(bubbleSlotFor('character', 0), 'character-0')
  assert.equal(bubbleSlotFor('character', 3), 'character-0')
  assert.equal(bubbleSlotFor('user', 0), 'user-0')
  assert.equal(bubbleSlotFor('user', 4), 'user-1')
  assert.notEqual(bubbleSlotFor('character', 1), bubbleSlotFor('user', 1))
})

import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const FOREST_ASSET = '!public/assets/forest/hidden-forest-wide.png'

test('Docker context includes the EO-001 forest plate', async () => {
  const patterns = (await readFile(new URL('../.dockerignore', import.meta.url), 'utf8'))
    .split(/\r?\n/)
    .map((line) => line.trim())

  assert.ok(patterns.includes(FOREST_ASSET))
})

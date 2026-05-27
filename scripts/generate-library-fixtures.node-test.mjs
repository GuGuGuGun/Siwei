import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { generateFixtures } from './generate-library-fixtures.mjs'

test('generateFixtures writes deterministic siwei json documents', async () => {
  const out = await mkdtemp(join(tmpdir(), 'siwei-fixtures-test-'))

  const result = await generateFixtures({ docs: 2, nodes: 10, out, seed: 7 })
  const first = JSON.parse(await readFile(result.files[0], 'utf8'))

  assert.equal(result.files.length, 2)
  assert.equal(first.title, 'Fixture 文档 1')
  assert.equal(first.root.children.length, 4)
  assert.equal(first.root.children.every((node) => node.tags.length > 0), true)
  assert.equal(first.root.children.some((node) => node.note?.includes('fixture-note')), true)
})

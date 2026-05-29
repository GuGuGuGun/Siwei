import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import assert from 'node:assert/strict'

test('sidecar build script creates a launcher instead of using bare Node as the agent binary', async () => {
  const source = await readFile(new URL('./build-pi-sidecar.mjs', import.meta.url), 'utf8')

  assert.match(source, /siwei-pi-agent-sidecar\.mjs/)
  assert.match(source, /execFileSync/)
  assert.match(source, /siwei-node-runtime/)
  assert.doesNotMatch(source, /copyFile\(execPath,\s*outputPath\)/)
})

test('sidecar exposes the controlled mind map insertion tool', async () => {
  const source = await readFile(new URL('../sidecars/siwei-pi-agent-sidecar.mjs', import.meta.url), 'utf8')

  assert.match(source, /mindmap_insert_nodes/)
  assert.match(source, /mindmap\.insertNodes/)
  assert.match(source, /documentId/)
  assert.match(source, /snapshotKey/)
})

import test from 'node:test'
import assert from 'node:assert/strict'

import { CLI_DRIVERS } from '../index.js'

const args = (options) => CLI_DRIVERS.claude.args({ model: 'opus', json: true, ...options })

test('a brain runs in plan mode and cannot write, even with full authority', () => {
  const claude = args({ authority: 'full', readonly: true })
  assert.equal(claude[claude.indexOf('--permission-mode') + 1], 'plan')
  assert.equal(claude.includes('--dangerously-skip-permissions'), false)
  // The write-capable tools are denied outright.
  const denied = claude.slice(claude.indexOf('--disallowedTools') + 1, claude.indexOf('--disallowedTools') + 7)
  for (const tool of ['Write', 'Edit', 'Bash']) assert.ok(denied.includes(tool), `missing ${tool}`)
})

test('a worker keeps the permission behaviour it had', () => {
  const full = args({ authority: 'full', readonly: false })
  assert.ok(full.includes('--dangerously-skip-permissions'))
  assert.equal(full.includes('--permission-mode'), false)
  const limited = args({ authority: 'workspace', readonly: false })
  assert.equal(limited[limited.indexOf('--permission-prompts') + 1], 'none')
})

test('brain mode still asks for json so the conversation can be resumed', () => {
  const claude = args({ authority: 'workspace', readonly: true })
  assert.equal(claude[claude.indexOf('--output-format') + 1], 'json')
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { CLI_DRIVERS, cliSessionKey, parseCliJson } from '../index.js'

test('a claude JSON reply yields the answer and the session id', () => {
  const stdout = JSON.stringify({
    type: 'result',
    subtype: 'success',
    result: 'claude-ok',
    session_id: 'abc-123',
    total_cost_usd: 0.01,
  })
  const parsed = parseCliJson(stdout)
  assert.equal(parsed.text, 'claude-ok')
  assert.equal(parsed.sessionId, 'abc-123')
})

test('a chatty line before the JSON does not hide it', () => {
  const stdout = `warning: something\n${JSON.stringify({ result: 'ok', session_id: 's-1' })}\n`
  const parsed = parseCliJson(stdout)
  assert.equal(parsed.text, 'ok')
  assert.equal(parsed.sessionId, 's-1')
})

test('plain text is returned untouched and has no session', () => {
  const parsed = parseCliJson('just an answer')
  assert.equal(parsed.text, 'just an answer')
  assert.equal(parsed.sessionId, '')
})

test('an empty stream parses to nothing', () => {
  assert.deepEqual(parseCliJson(''), { text: '', sessionId: '' })
  assert.deepEqual(parseCliJson(undefined), { text: '', sessionId: '' })
})

test('a session key is one per driver and folder', () => {
  const key = cliSessionKey('claude', 'C:\\work')
  assert.equal(key, cliSessionKey('claude', 'C:\\work'))
  assert.notEqual(key, cliSessionKey('claude', 'C:\\other'))
  assert.notEqual(key, cliSessionKey('codex', 'C:\\work'))
})

test('claude declares resume, asks for JSON and passes --resume only when it has an id', () => {
  const driver = CLI_DRIVERS.claude
  assert.equal(driver.resume, true)
  const fresh = driver.args({ model: 'opus', authority: 'workspace', json: true })
  assert.ok(fresh.includes('--output-format'))
  assert.equal(fresh[fresh.indexOf('--output-format') + 1], 'json')
  assert.equal(fresh.includes('--resume'), false)
  const resumed = driver.args({ model: 'opus', authority: 'workspace', json: true, sessionId: 's-9' })
  assert.equal(resumed[resumed.indexOf('--resume') + 1], 's-9')
})

test('a probe asks for plain text so its answer needs no parsing', () => {
  const args = CLI_DRIVERS.claude.args({ model: '', authority: 'workspace', json: false })
  assert.equal(args[args.indexOf('--output-format') + 1], 'text')
})

test('a temporary directory can stand in for the state dir', () => {
  const dir = mkdtempSync(join(tmpdir(), 'supa-cli-'))
  try {
    assert.ok(cliSessionKey('claude', dir).endsWith(dir))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { withinSession } from '../index.js'

test('withinSession keeps only the records a session produced', () => {
  const records = [
    { at: 1, session: 'a', kind: 'start' },
    { at: 2, session: 'b', kind: 'start' },
    { at: 3, session: 'a', kind: 'done', ms: 10 },
  ]
  assert.deepEqual(withinSession(records, 'a').map((r) => r.at), [1, 3])
  assert.deepEqual(withinSession(records, 'b').map((r) => r.at), [2])
})

test('withinSession with no session returns every record', () => {
  const records = [{ at: 1, session: 'a' }, { at: 2 }]
  assert.equal(withinSession(records, ''), records)
  assert.equal(withinSession(records, undefined), records)
})

test('records written before sessions existed do not match a session filter', () => {
  const records = [{ at: 1, kind: 'start' }]
  assert.deepEqual(withinSession(records, 'a'), [])
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { pickOpenStart, loadUsage } from '../index.js'

test('pickOpenStart finds the start row of a child', () => {
  const records = [
    { kind: 'start', child: 'c1', route: 'handoff', at: 1 },
    { kind: 'start', child: 'c2', route: 'handoff', at: 2 },
  ]
  assert.equal(pickOpenStart(records, 'c1').at, 1)
  assert.equal(pickOpenStart(records, 'c2').at, 2)
})

test('pickOpenStart returns null once the child already closed', () => {
  const records = [
    { kind: 'start', child: 'c1', route: 'handoff', at: 1 },
    { kind: 'done', child: 'c1', route: 'handoff', at: 2 },
  ]
  assert.equal(pickOpenStart(records, 'c1'), null)
})

test('pickOpenStart ignores rows that are not ours or not openable', () => {
  const records = [
    { kind: 'start', child: 'c1', route: 'deepseek-official/x@high', at: 1 },
    { kind: 'start', child: '', route: 'handoff', at: 2 },
  ]
  assert.equal(pickOpenStart(records, 'c1'), null)
  assert.equal(pickOpenStart(records, ''), null)
})

test('loadUsage is a no-op filter when nothing is asked', () => {
  assert.deepEqual(loadUsage({}), [])
})

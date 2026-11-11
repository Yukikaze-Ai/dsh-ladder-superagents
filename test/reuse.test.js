import test from 'node:test'
import assert from 'node:assert/strict'
import { attributeReuse } from '../index.js'

test('a reuse takes the route of the worker it continued', () => {
  const records = [
    { child: 'c1', route: 'deepseek-official/deepseek-flash@high', slot: 4, kind: 'start' },
    { route: 'reused', reused: 'c1', kind: 'start', task: 'follow-up' },
  ]
  const [first, second] = attributeReuse(records)
  assert.equal(first.route, 'deepseek-official/deepseek-flash@high')
  assert.equal(second.route, 'deepseek-official/deepseek-flash@high')
  assert.equal(second.slot, 4)
  assert.equal(second.reusedOf, 'c1')
})

test('a reuse of an unknown worker keeps the reused marker', () => {
  const [record] = attributeReuse([{ route: 'reused', reused: 'gone', kind: 'start' }])
  assert.equal(record.route, 'reused')
  assert.equal(record.reusedOf, undefined)
})

test('attributeReuse leaves ordinary records untouched', () => {
  const records = [{ child: 'c1', route: 'r', slot: 2, kind: 'done', ms: 5 }]
  assert.equal(attributeReuse(records)[0], records[0])
})

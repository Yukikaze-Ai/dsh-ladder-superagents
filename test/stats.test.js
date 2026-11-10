import test from 'node:test'
import assert from 'node:assert/strict'

import { ceilingOf, withinHours } from '../index.js'

const now = Date.now()
const hoursAgo = (hours) => now - hours * 3600_000

/** Newest first is not required by the helper; order in must equal order out. */
const records = [
  { at: hoursAgo(5), route: 'old' },
  { at: hoursAgo(2), route: 'recent' },
  { at: hoursAgo(0.25), route: 'newest' },
]

test('withinHours with a non-positive span returns every record', () => {
  assert.equal(withinHours(records, 0), records)
  assert.equal(withinHours(records, -3), records)
})

test('withinHours keeps only records newer than the cutoff', () => {
  const kept = withinHours(records, 1)
  assert.deepEqual(kept.map((record) => record.route), ['newest'])
})

test('withinHours keeps the records inside a wider window in their original order', () => {
  const kept = withinHours(records, 3)
  assert.deepEqual(kept.map((record) => record.route), ['recent', 'newest'])
})

test('withinHours filters into a new array instead of mutating its input', () => {
  const kept = withinHours(records, 1)
  assert.notEqual(kept, records)
  assert.equal(records.length, 3)
})

test('withinHours leaves an empty list empty', () => {
  assert.deepEqual(withinHours([], 1), [])
  assert.deepEqual(withinHours([], 0), [])
})

test('withinHours with a non-numeric span returns every record', () => {
  assert.equal(withinHours(records, 'nope'), records)
  assert.equal(withinHours(records, undefined), records)
  assert.equal(withinHours(records, Number.NaN), records)
})

// ceilingOf's 1/5/10 and 0/11 cases already live in routing.test.js; these are
// the clamps beyond them, kept here so the two pure helpers sit side by side.
test('ceilingOf clamps slots far outside the 1-10 range', () => {
  assert.equal(ceilingOf(-5), 10)
  assert.equal(ceilingOf(100), 1)
})

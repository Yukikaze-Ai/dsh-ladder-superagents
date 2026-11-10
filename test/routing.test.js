import test from 'node:test'
import assert from 'node:assert/strict'

import { ceilingOf, chooseTier } from '../index.js'

/** A tier is only its slot for the router: everything else is decoration. */
const tier = (slot) => ({ slot, id: `t${slot}`, label: `T${slot}` })
const slots = (list) => list.map((entry) => entry.slot)
const ladder = (...numbers) => numbers.map(tier).sort((a, b) => a.slot - b.slot)

test('ceilingOf maps a slot to the difficulty it covers', () => {
  assert.equal(ceilingOf(1), 10)
  assert.equal(ceilingOf(5), 6)
  assert.equal(ceilingOf(10), 1)
})

test('ceilingOf clamps out-of-range slots', () => {
  assert.equal(ceilingOf(0), 10)
  assert.equal(ceilingOf(11), 1)
})

test('a dense ladder sends each difficulty to its own slot', () => {
  const dense = ladder(1, 2, 3, 4, 5, 6, 7, 8, 9, 10)
  for (let difficulty = 1; difficulty <= 10; difficulty += 1) {
    const { pick, degraded } = chooseTier(dense, difficulty)
    assert.equal(pick.slot, 11 - difficulty, `difficulty ${difficulty}`)
    assert.equal(degraded, false, `difficulty ${difficulty} should not degrade`)
  }
})

test('a hole in the ladder is covered by the stronger tier above it', () => {
  // T1, T2, T4, T7 are defined; T3, T5, T6, T8, T9, T10 are empty.
  const sparse = ladder(1, 2, 4, 7)
  assert.equal(chooseTier(sparse, 10).pick.slot, 1) // T1
  assert.equal(chooseTier(sparse, 9).pick.slot, 2) // T2
  assert.equal(chooseTier(sparse, 8).pick.slot, 2) // wants T3, covered by T2
  assert.equal(chooseTier(sparse, 7).pick.slot, 4) // T4
  assert.equal(chooseTier(sparse, 6).pick.slot, 4) // wants T5, covered by T4
  assert.equal(chooseTier(sparse, 5).pick.slot, 4) // wants T6, covered by T4
  assert.equal(chooseTier(sparse, 4).pick.slot, 7) // T7
  assert.equal(chooseTier(sparse, 3).pick.slot, 7) // wants T8, covered by T7
  assert.equal(chooseTier(sparse, 1).pick.slot, 7) // wants T10, covered by T7
})

test('the pick is the weakest tier that still covers the difficulty', () => {
  const sparse = ladder(1, 2, 4, 7)
  // Difficulty 8 needs a ceiling of at least 8; only T1 and T2 reach it and T2
  // is the weaker of the two.
  const { pick, desired, degraded } = chooseTier(sparse, 8)
  assert.equal(desired, 3)
  assert.equal(pick.slot, 2)
  assert.equal(degraded, true)
})

test('an exact hit is not reported as degraded', () => {
  const sparse = ladder(1, 2, 4, 7)
  const { pick, degraded } = chooseTier(sparse, 7)
  assert.equal(pick.slot, 4)
  assert.equal(degraded, false)
})

test('when every tier is too weak, the strongest one still runs the task', () => {
  const weakOnly = ladder(5, 7)
  const { pick, chain } = chooseTier(weakOnly, 10)
  assert.equal(pick.slot, 5)
  assert.deepEqual(slots(chain), [5, 7])
})

test('the fallback chain starts at the pick and walks weaker', () => {
  const sparse = ladder(1, 2, 4, 7)
  assert.deepEqual(slots(chooseTier(sparse, 8).chain), [2, 4, 7])
  assert.deepEqual(slots(chooseTier(sparse, 10).chain), [1, 2, 4, 7])
  assert.deepEqual(slots(chooseTier(sparse, 1).chain), [7])
})

test('an empty ladder has nothing to pick', () => {
  assert.equal(chooseTier([], 5).pick, null)
  assert.equal(chooseTier(undefined, 5).pick, null)
})

test('difficulty outside 1-10 is clamped instead of crashing', () => {
  const sparse = ladder(1, 2, 4, 7)
  assert.equal(chooseTier(sparse, 0).pick.slot, 7)
  assert.equal(chooseTier(sparse, 11).pick.slot, 1)
  assert.equal(chooseTier(sparse, Number.NaN).pick.slot, 7)
})

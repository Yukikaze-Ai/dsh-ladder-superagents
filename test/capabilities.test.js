import test from 'node:test'
import assert from 'node:assert/strict'

import { chooseTier } from '../index.js'

/** A tier is slot + tags for the router; everything else is decoration. */
const tier = (slot, tags = []) => ({ slot, tags, id: `t${slot}`, label: `T${slot}` })
const ladder = (...tiers) => tiers.sort((a, b) => a.slot - b.slot)

test('needs narrow the pool before difficulty decides', () => {
  const pool = ladder(tier(2, []), tier(4, ['long-context']), tier(7, ['bulk-edit']))
  const picked = chooseTier(pool, 3, ['long-context'])
  assert.equal(picked.pick.slot, 4)
  assert.equal(picked.matched, true)
})

test('needs require every tag, not any one of them', () => {
  const pool = ladder(tier(2, ['long-context']), tier(4, ['long-context', 'bulk-edit']))
  const picked = chooseTier(pool, 5, ['long-context', 'bulk-edit'])
  assert.equal(picked.pick.slot, 4)
})

test('no tier matches the needs, so difficulty decides and says so', () => {
  const pool = ladder(tier(2, []), tier(6, ['bulk-edit']))
  const picked = chooseTier(pool, 8, ['long-context'])
  assert.equal(picked.pick.slot, 2) // 3 wants T3; the hole falls to the stronger T2
  assert.equal(picked.matched, false)
  assert.deepEqual(picked.missing, ['long-context'])
})

test('an empty needs list routes exactly as before', () => {
  const pool = ladder(tier(2, []), tier(4, ['long-context']))
  const withNeeds = chooseTier(pool, 3, [])
  const without = chooseTier(pool, 3)
  assert.equal(withNeeds.pick.slot, without.pick.slot)
  assert.equal(withNeeds.matched, true)
})

test('the fallback chain only contains tiers that carry the tags', () => {
  const pool = ladder(tier(2, []), tier(4, ['long-context']), tier(7, ['long-context']))
  const picked = chooseTier(pool, 6, ['long-context'])
  assert.deepEqual(picked.chain.map((entry) => entry.slot), [4, 7])
})

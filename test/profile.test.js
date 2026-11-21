import test from 'node:test'
import assert from 'node:assert/strict'

import { resolveProfile } from '../index.js'

test('the two products are normal and eb', () => {
  assert.equal(resolveProfile('normal'), 'normal')
  assert.equal(resolveProfile('eb'), 'eb')
})

test('older spellings still land on the right product', () => {
  assert.equal(resolveProfile('ladder'), 'normal')
  assert.equal(resolveProfile('brain'), 'eb')
  assert.equal(resolveProfile('Brains'), 'eb')
})

test('anything unknown is the normal mode, never an accidental brain mode', () => {
  assert.equal(resolveProfile(undefined), 'normal')
  assert.equal(resolveProfile(''), 'normal')
  assert.equal(resolveProfile('brainy'), 'normal')
  assert.equal(resolveProfile(42), 'normal')
})

#!/usr/bin/env node
// Append the version in package.json to market/index.json, so the plugin's own
// market index never falls behind a publish. Run it after `npm publish`.
import { readFileSync, writeFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
const file = 'market/index.json'
const index = JSON.parse(readFileSync(file, 'utf8'))
const plugin = index.plugins.find((entry) => entry.name === pkg.name)
if (!plugin) {
  console.error(`${file} has no entry for ${pkg.name}`)
  process.exit(1)
}

const parse = (version) => String(version).split('.').map((part) => Number.parseInt(part, 10) || 0)
const newer = (left, right) => {
  const a = parse(left)
  const b = parse(right)
  for (let i = 0; i < 3; i += 1) {
    if (a[i] !== b[i]) return b[i] - a[i]
  }
  return 0
}

if (plugin.versions.some((entry) => entry.version === pkg.version)) {
  console.log(`${pkg.name}@${pkg.version} is already listed`)
} else {
  plugin.versions.push({
    version: pkg.version,
    publishTimestamp: Math.floor(Date.now() / 1000),
    source: { type: 'npm' },
  })
  plugin.versions.sort((left, right) => newer(left.version, right.version))
  writeFileSync(file, `${JSON.stringify(index, null, 2)}\n`)
  console.log(`added ${pkg.name}@${pkg.version} to ${file}`)
}

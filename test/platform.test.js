/**
 * The platform layer: executable discovery, the PATH a CLI sees, and the
 * launcher's process handling. The cases run a fixture CLI instead of a real
 * one, so they cover macOS and Linux without an account and still exercise the
 * Windows branch when the suite runs there.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'

import {
  cliEnv, findCodex, looksLong, pathDirs, pollsInLoop, probeCliTier, quoteForShell, resolveOnPath,
  runCodexCli, sleepSecondsOf, wellKnownBinDirs,
} from '../index.js'

const isWindows = process.platform === 'win32'
const isPosix = !isWindows
const posixOnly = { skip: isWindows ? 'POSIX executable and process-group semantics' : false }
const windowsOnly = { skip: isWindows ? false : 'Windows .cmd shim semantics' }

function sandbox(t) {
  const dir = mkdtempSync(join(tmpdir(), 'supa-platform-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  return dir
}

/** A POSIX fixture CLI: a shell script that is executable. */
function shFixture(dir, name, body) {
  const file = join(dir, name)
  writeFileSync(file, `#!/bin/sh\n${body}\n`)
  chmodSync(file, 0o755)
  return file
}

/** A Windows fixture CLI: a .cmd shim, which only runs through the shell. */
function cmdFixture(dir, name, body) {
  const file = join(dir, name)
  writeFileSync(file, `@echo off\r\n${body}\r\n`)
  return file
}

function alive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return error?.code !== 'ESRCH'
  }
}

async function waitUntil(predicate, timeoutMs = 4000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (predicate()) return true
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  return predicate()
}

test('resolveOnPath finds an executable and skips a file without the bit', posixOnly, (t) => {
  const dir = sandbox(t)
  const file = join(dir, 'fake-cli')
  writeFileSync(file, '#!/bin/sh\necho ok\n')
  // The default mode is 0o666: a shell would not run this.
  assert.equal(resolveOnPath('fake-cli', [dir]), null)
  chmodSync(file, 0o755)
  assert.equal(resolveOnPath('fake-cli', [dir]), file)
})

test('resolveOnPath takes the first directory that has the tool', posixOnly, (t) => {
  const first = sandbox(t)
  const second = sandbox(t)
  const firstBin = shFixture(first, 'fake-cli', 'echo first')
  shFixture(second, 'fake-cli', 'echo second')
  assert.equal(resolveOnPath('fake-cli', [first, second]), firstBin)
  // A directory with the right name is not an executable.
  const third = sandbox(t)
  mkdirSync(join(third, 'fake-cli'))
  assert.equal(resolveOnPath('fake-cli', [third]), null)
})

test('resolveOnPath takes an explicit path as given and expands ~', (t) => {
  assert.equal(resolveOnPath(process.execPath), process.execPath)
  const dir = sandbox(t)
  assert.equal(resolveOnPath(join(dir, 'missing-cli')), null)
  // `~` is the Home directory, not a directory named `~` in the working tree.
  if (isPosix) {
    const home = sandbox(t)
    const fakeHome = join(home, 'bin')
    mkdirSync(fakeHome)
    const file = shFixture(fakeHome, 'tool')
    const saved = process.env.HOME
    process.env.HOME = home
    try {
      assert.equal(resolveOnPath('~/bin/tool'), file)
    } finally {
      process.env.HOME = saved
    }
  }
})

test('resolveOnPath walks Windows extensions', windowsOnly, (t) => {
  const dir = sandbox(t)
  const file = cmdFixture(dir, 'fake-cli.cmd', 'exit /b 0')
  assert.equal(resolveOnPath('fake-cli', [dir]), file)
})

test('pathDirs keeps the inherited PATH first, deduplicated, and adds the install roots', () => {
  const dirs = pathDirs()
  const inherited = [...new Set(String(process.env.PATH ?? '').split(delimiter).filter(Boolean))]
  assert.deepEqual(dirs.slice(0, inherited.length), inherited)
  const keys = dirs.map((dir) => (isWindows ? dir.toLowerCase() : dir))
  assert.equal(new Set(keys).size, dirs.length, 'no directory may appear twice')
  if (process.platform === 'darwin') {
    for (const dir of ['/opt/homebrew/bin', '/usr/local/bin']) {
      if (existsSync(dir)) assert.ok(dirs.includes(dir), `${dir} should be on the augmented PATH`)
    }
  }
})

test('wellKnownBinDirs covers the per-user installers and the newest node manager', (t) => {
  const home = sandbox(t)
  mkdirSync(join(home, '.local', 'bin'), { recursive: true })
  mkdirSync(join(home, '.nvm', 'versions', 'node', 'v22.0.0', 'bin'), { recursive: true })
  mkdirSync(join(home, '.nvm', 'versions', 'node', 'v24.0.0', 'bin'), { recursive: true })
  utimesSync(join(home, '.nvm', 'versions', 'node', 'v22.0.0', 'bin'), new Date(1000), new Date(1000))
  utimesSync(join(home, '.nvm', 'versions', 'node', 'v24.0.0', 'bin'), new Date(2000), new Date(2000))

  const dirs = wellKnownBinDirs(home)
  if (isPosix) {
    assert.ok(dirs.includes(join(home, '.local', 'bin')))
    assert.ok(dirs.includes(join(home, '.nvm', 'versions', 'node', 'v24.0.0', 'bin')), 'the newest node version wins')
    assert.ok(!dirs.includes(join(home, '.nvm', 'versions', 'node', 'v22.0.0', 'bin')))
  }
  if (process.platform === 'darwin') {
    assert.ok(dirs.includes('/opt/homebrew/bin'))
    assert.ok(dirs.includes(join(home, 'Library', 'pnpm')))
  }
  if (isWindows) {
    assert.ok(dirs.some((dir) => dir.toLowerCase().endsWith('npm')), 'npm\'s Windows shim directory')
  }
})

test('cliEnv hands the child the augmented PATH and a UTF-8 locale', () => {
  const saved = {
    LANG: process.env.LANG,
    LC_ALL: process.env.LC_ALL,
    LC_CTYPE: process.env.LC_CTYPE,
  }
  process.env.DSH_SUPA_TEST_MARK = 'kept'
  try {
    for (const key of Object.keys(saved)) delete process.env[key]
    const env = cliEnv()
    assert.equal(env.PATH, pathDirs().join(delimiter))
    assert.equal(env.DSH_SUPA_TEST_MARK, 'kept', 'unrelated variables survive')
    if (isPosix) {
      assert.equal(env.LANG, process.platform === 'darwin' ? 'en_US.UTF-8' : 'C.UTF-8')
      // A locale the Host already has is never overridden.
      process.env.LANG = 'de_DE.UTF-8'
      assert.equal(cliEnv().LANG, 'de_DE.UTF-8')
    }
  } finally {
    delete process.env.DSH_SUPA_TEST_MARK
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
})

test('findCodex prefers codexCommand, then PATH, then the per-user roots', (t) => {
  const home = sandbox(t)
  const bin = sandbox(t)
  const empty = sandbox(t)

  // An explicit command always wins, with `~` expanded.
  assert.equal(findCodex({ codexCommand: '~/my-codex' }, { home, pathDirs: [empty] }), join(home, 'my-codex'))

  // Nothing installed: the bare name is handed to the launcher, which reports it.
  assert.equal(findCodex({ codexCommand: '' }, { home, pathDirs: [empty] }), 'codex')

  if (isPosix) {
    // A per-user install is found when PATH has nothing.
    mkdirSync(join(home, '.local', 'bin'), { recursive: true })
    const local = shFixture(join(home, '.local', 'bin'), 'codex', 'echo local')
    assert.equal(findCodex({ codexCommand: '' }, { home, pathDirs: [empty] }), local)

    // PATH wins over the per-user install, exactly like a shell.
    const onPath = shFixture(bin, 'codex', 'echo path')
    assert.equal(findCodex({ codexCommand: '' }, { home, pathDirs: [bin] }), onPath)
  }
})

test('findCodex reads the Windows Codex app install root, newest build first', windowsOnly, (t) => {
  const home = sandbox(t)
  const binRoot = join(home, 'AppData', 'Local', 'OpenAI', 'Codex', 'bin')
  mkdirSync(join(binRoot, '2025.01.01'), { recursive: true })
  mkdirSync(join(binRoot, '2025.02.02'), { recursive: true })
  writeFileSync(join(binRoot, '2025.01.01', 'codex.exe'), 'old')
  writeFileSync(join(binRoot, '2025.02.02', 'codex.exe'), 'new')
  utimesSync(join(binRoot, '2025.02.02', 'codex.exe'), new Date(2000), new Date(2000))
  utimesSync(join(binRoot, '2025.01.01', 'codex.exe'), new Date(1000), new Date(1000))
  assert.equal(
    findCodex({ codexCommand: '' }, { home, pathDirs: [] }),
    join(binRoot, '2025.02.02', 'codex.exe'),
  )
})

test('quoteForShell quotes for the shell each platform actually uses', () => {
  const value = `it's a & b`
  if (isWindows) {
    assert.equal(quoteForShell(value), `"it's a & b"`)
    assert.equal(quoteForShell('plain'), 'plain')
  } else {
    assert.equal(quoteForShell(value), `'it'\\''s a & b'`)
  }
})

test('runCodexCli sends stdin and returns the answer, UTF-8 intact', { skip: isWindows ? 'sh fixture' : false }, async (t) => {
  const dir = sandbox(t)
  const cli = shFixture(dir, 'echo-cli', 'cat')
  const run = await runCodexCli(cli, [], { input: '你好，macOS\n', timeoutMs: 10000 })
  assert.equal(run.code, 0)
  assert.equal(run.stdout, '你好，macOS\n')
})

test('runCodexCli passes argument prompts through without a shell', { skip: isWindows ? 'sh fixture' : false }, async (t) => {
  const dir = sandbox(t)
  const cli = shFixture(dir, 'args-cli', 'printf \'%s\\n\' "$@"')
  const run = await runCodexCli(cli, ['a b', "it's", '--flag=1'], { timeoutMs: 10000 })
  assert.equal(run.code, 0)
  assert.deepEqual(run.stdout.trim().split('\n'), ['a b', "it's", '--flag=1'])
})

test('runCodexCli reports a missing executable instead of hanging', async (t) => {
  const dir = sandbox(t)
  const missing = join(dir, isWindows ? 'missing-cli.exe' : 'missing-cli')
  await assert.rejects(runCodexCli(missing, [], { timeoutMs: 5000 }), /ENOENT/)
})

test('runCodexCli gives the child the augmented PATH and locale', { skip: isWindows ? 'sh fixture' : false }, async (t) => {
  const dir = sandbox(t)
  const cli = shFixture(dir, 'env-cli', 'printf \'%s\\n\' "$PATH"; printf \'%s\\n\' "$LANG"')
  const saved = { LANG: process.env.LANG, LC_ALL: process.env.LC_ALL, LC_CTYPE: process.env.LC_CTYPE }
  try {
    for (const key of Object.keys(saved)) delete process.env[key]
    const run = await runCodexCli(cli, [], { timeoutMs: 10000 })
    const [path, lang] = run.stdout.trim().split('\n')
    assert.equal(path, pathDirs().join(delimiter))
    assert.equal(lang, process.platform === 'darwin' ? 'en_US.UTF-8' : 'C.UTF-8')
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
})

test('a timeout kills the CLI and the processes it started', posixOnly, async (t) => {
  const dir = sandbox(t)
  const pidFile = join(dir, 'pids')
  const cli = join(dir, 'slow-cli')
  // The script records its own pid and its helper's, then waits: the launcher
  // has to kill the whole group, not just the first process.
  writeFileSync(cli, [
    '#!/bin/sh',
    `echo $$ >> '${pidFile}'`,
    '/bin/sleep 60 &',
    `echo $! >> '${pidFile}'`,
    'wait',
    '',
  ].join('\n'))
  chmodSync(cli, 0o755)

  const started = Date.now()
  await assert.rejects(runCodexCli(cli, [], { timeoutMs: 500 }), /timed out after 500ms/)
  assert.ok(Date.now() - started < 5000, 'the timeout is honoured')

  const pids = readFileSync(pidFile, 'utf8').trim().split('\n').map(Number)
  assert.equal(pids.length, 2, 'the fixture wrote its own pid and its helper\'s')
  for (const pid of pids) {
    assert.ok(await waitUntil(() => !alive(pid)), `pid ${pid} survived the timeout`)
  }
})

test('probeCliTier drives a fixture CLI end to end', { skip: isWindows ? 'sh fixture' : false }, async (t) => {
  const dir = sandbox(t)
  const cli = shFixture(dir, 'codex', 'echo ok')
  const verdict = await probeCliTier(
    { cliTimeoutMs: 10000 },
    { id: 't1', slot: 1, kind: 'cli', driver: 'codex', command: cli, model: '', reasoningEffort: '' },
    dir,
  )
  assert.deepEqual(verdict, { ok: true, answer: 'ok' })
})

test('probeCliTier reports the exit code when the CLI fails', { skip: isWindows ? 'sh fixture' : false }, async (t) => {
  const dir = sandbox(t)
  const cli = shFixture(dir, 'codex', 'echo "no account" >&2; exit 3')
  const verdict = await probeCliTier(
    { cliTimeoutMs: 10000 },
    { id: 't1', slot: 1, kind: 'cli', driver: 'codex', command: cli, model: '', reasoningEffort: '' },
    dir,
  )
  assert.equal(verdict.ok, false)
  assert.match(verdict.error, /exit 3/)
  assert.match(verdict.error, /no account/)
})

test('probeCliTier runs a Windows .cmd shim through the shell', windowsOnly, async (t) => {
  const dir = sandbox(t)
  const cli = cmdFixture(dir, 'codex.cmd', 'echo ok')
  const verdict = await probeCliTier(
    { cliTimeoutMs: 10000 },
    { id: 't1', slot: 1, kind: 'cli', driver: 'codex', command: cli, model: '', reasoningEffort: '' },
    dir,
  )
  assert.equal(verdict.ok, true)
  assert.equal(verdict.answer, 'ok')
})

// The Dock case: a GUI-launched Host inherits launchd's PATH, which has no
// node. An npm-installed CLI is a `#!/usr/bin/env node` shim, so the augmented
// PATH is what makes it runnable at all.
test('an npm shim with a node shebang runs with a Dock-sized PATH', { skip: isWindows ? 'sh fixture' : false }, async (t) => {
  const dir = sandbox(t)
  const cli = join(dir, 'node-cli')
  writeFileSync(cli, '#!/usr/bin/env node\nprocess.stdout.write(`node ${process.version}`)\n')
  chmodSync(cli, 0o755)
  const savedPath = process.env.PATH
  try {
    process.env.PATH = '/usr/bin:/bin:/usr/sbin:/sbin'
    const run = await runCodexCli(cli, [], { timeoutMs: 10000 })
    assert.equal(run.code, 0, run.stderr)
    assert.match(run.stdout, /^node v\d+/)
  } finally {
    process.env.PATH = savedPath
  }
})

// A long shell command is handed to a child instead of blocking the turn. The
// classifier knows the build and install tools of every platform, macOS
// included, and only trusts the start of a statement.
test('looksLong recognises the install and build tools of each platform', () => {
  for (const command of [
    'npm install', 'brew install jq', 'brew upgrade node', 'port install wget',
    'xcodebuild -scheme App build', 'pod install', 'swift build', 'pytest',
    'git clone https://example.invalid/repo', 'cd app && npm test',
  ]) {
    assert.ok(looksLong(command), `${command} should be a long command`)
  }
  for (const command of [
    'git status', 'ls -la', 'echo "brew install jq"', 'git commit -m "npm test"',
  ]) {
    assert.ok(!looksLong(command), `${command} should stay in the turn`)
  }
})

test('looksLong sees through the Windows shell wrappers', () => {
  assert.ok(looksLong('cmd /c npm install'))
  assert.ok(looksLong('pwsh -c npm test'))
  assert.ok(looksLong('Start-Process npm install'))
})

test('sleepSecondsOf sums the sleeps and pollsInLoop sees a loop', () => {
  assert.equal(sleepSecondsOf('sleep 5 && sleep 10'), 15)
  assert.equal(sleepSecondsOf('Start-Sleep -Seconds 7'), 7)
  assert.equal(sleepSecondsOf('timeout /t 30'), 30)
  assert.equal(sleepSecondsOf('echo wait'), 0)
  assert.equal(pollsInLoop('while true; do curl -s x; sleep 5; done'), true)
  assert.equal(pollsInLoop('sleep 5'), false)
})

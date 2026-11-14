# Roadmap

Ordered by what blocks a public release first. Items marked
`good first issue` need no knowledge of the Harness internals.

## Done

- **Make it work outside Windows** (0.3.1, macOS verified). Discovery on the
  augmented PATH (Homebrew, MacPorts, the per-user installer roots, nvm/fnm
  shims), executable-bit lookup, a UTF-8 locale for a Host opened from the Dock,
  `~` expansion in a tier's `command`, and a process-group kill when a run times
  out. `npm test` drives all of it through a fixture CLI on the running platform;
  Linux follows the same POSIX path, still unverified.

## 1. Tests for the routing decisions — started (`npm test`)

`npm test` already covers the pick and the chain (`test/routing.test.js`). The
rules worth locking down further:

- difficulty → slot (`11 - difficulty`, clamped)
- weakest tier that still covers the score
- same-tier retry, then the next weaker tier
- all-red → weakest slot replaced by the built-in fallback
- a corrupt `models.json` is quarantined, not obeyed

Suggested shape: extract the pure decision (tiers + failure map + difficulty →
chosen tier and chain) into a function, then one Node test file using
`node:test`. No framework needed.

## 2. Verify or label the nine unverified CLI drivers — see [docs/CLI-DRIVERS.md](docs/CLI-DRIVERS.md)

One issue per driver is open on the tracker (`Verify the <name> CLI driver`,
labelled `driver` / `needs-account` / `good first issue`), so a contributor can
claim a single CLI without reading the whole plugin. The checklist is the same
for all nine and lives in `docs/CLI-DRIVERS.md`.

Only `codex` has been run against a working install. kimi, claude, gemini, qwen,
cursor, opencode, aider, copilot and goose are implemented from each CLI's
documented invocation.

Do one of: verify a driver and add it to the README's verified list, or mark it
`experimental` in the catalog UI so nobody trusts an untested claim.

## 3. Hide the tools from sessions that never opted in

In `mode: 'session'` the twelve `supa_*` tools are still registered globally and
only rejected by a guard — every session pays their schema tokens. Registering
them through a scoped tool provider would remove that cost.

## 4. Check who calls `/supa/action`

The settings route rewrites the ladder and can rewrite the profile config via
`configEditor.edit`, and it never inspects the caller. Compare against the peer
the web server provides, or require the advertised URL's token.

## 5. Prune `sessions.json`

The opt-in list only grows, and it is read synchronously on the prompt path.
Record a last-seen timestamp, drop entries older than 30 days, and cache the list
by file mtime.

## 6. Screenshots

The README explains the ladder in prose. One screenshot of the ten slots and one
of the catalog (with a green, a yellow and a red row) would do more than the
paragraphs.

## 7. Publish and get listed

- `npm login && npm publish --access public` — the name `dsh-ladder-superagents`
  is free.
- The market is the experimental `plugin-market` bundle, which browses **plugin
  indexes**. The index format is not documented here yet; finding it is part of
  this item.

## Not planned

- A second agent loop, a workflow engine, or a scheduler. The Harness already
  has `subagent`, `workflow` and `schedule`; this plugin ranks models and picks
  one.
- Per-task effort overrides. Effort is part of a tier on purpose: a slot must
  mean one fixed strength.
- Auto-deleting tiers a user did not delete.


# Changelog

All notable changes to this plugin. Dates are ISO.

## 0.2.0 — 2026-11-10

Closes a hole in the ladder, makes a child a worker rather than a second SupA,
and adds usage statistics and a test suite.

### Added

- **A Chinese README** (`README.zh-CN.md`), a full translation with the same
  structure, and a language link at the top of both files.
- **Usage statistics.** `supa_stats` records every ladder call per tier and
  reports counts, durations and the recent tasks; a Stats view beside the
  conversation tabs plots a call timeline and duration bars over a selectable
  time window.
- **Token capture for codex tiers.** Token usage is read from the CLI's own
  JSONL events and stored with the call.
- **A test suite.** `npm test` runs `node --test`: ten cases cover the ladder
  ceiling, holes, clamping, the pick and the fallback chain; seven more cover the
  usage-window filter and the extreme ceiling clamps.
- **Fan-out cap.** One SupA may start only so many children; the limit is a
  policy setting and appears on the policy card beside the shell hand-off.
- **Authority inheritance.** A worker inherits its parent's authority instead
  of starting clamped to `workspace`.

### Fixed

- **A hole in the ladder is covered by the stronger tier above it** instead of
  silently sending the task to a tier too weak for it.
- **A hand-off is reported as spawned** — the note used to say a child started
  even when the spawn had failed.
- **The Stats view loads** — its client bundle had broken brackets.

### Changed

- **T1 must exist before SupA can start**; a ladder with an empty strongest
  slot is refused rather than run degraded.
- **A child is a worker, not a SupA.** It cannot spawn children, drain a queue
  or change the ladder; it does the work and reports.

## 0.1.2 — 2026-11-09

### Added

- **A SupA on/off pill in the session header** — toggles `mode: session` for
  this session without opening settings.
- **Foreground discipline.** A foreground sleep or a polling loop is refused
  with the route to use instead, and a blocking command is handed off to a
  child rather than stalled on.
- **Soft stop.** Switching SupA off refuses new spawns without killing work in
  flight; running children keep going and report into the queue.

### Fixed

- The pill is quiet by default and turns green only when SupA is on here.
- Hand-offs keep the working directory, are not started twice for one command,
  and name the whole command in the note; only long-blocking matches count.
- The session list is bounded, so a long run cannot grow it without limit.
- Docs: warn about the disabled flag a reload leaves behind, and add per-driver
  verification and roadmap material.

### Changed

- **The charter says repair before asking** — diagnose and try a fix first, and
  if help is needed, say what was tried. It also asks for a one-line statement
  of intent, short turns, execution delegated to children, and every child
  reporting into the queue.

## 0.1.1 — 2026-11-09

### Added

- **Our own plugin-market index** in format 1, with an icon and a community
  catalog entry, so the plugin can be installed from the market.
- **`claude` tiers pass the tier effort** through `--effort`.

### Fixed

- A `claude` tier no longer waits for a permission prompt nobody can answer,
  and errors printed on stdout are surfaced instead of a bare timeout.
- The settings section gets a unique id, so it no longer collides with another
  section.

### Changed

- The package is renamed `dsh-ladder-superagents`; repository URLs point at
  that repo and the version is 0.1.1.
- Contributor guide, roadmap, changelog, issue templates and docs noting that
  `claude` and `kimi` need their own paid accounts.

## 0.1.0 — 2026-11-09

First published version. Windows only.

### Added

- **Ten-slot model ladder.** A slot *is* a tier: T1 is the strongest and covers a
  10-point task, T10 the weakest. Tiers can be llm routes or any of ten CLI
  drivers (codex verified, the rest implemented but unverified).
- **Difficulty routing.** `supa_spawn` takes a 1-10 difficulty; the router picks
  the weakest tier that still covers it and walks down when it fails.
- **Real-call verification.** `Scan` reads `codex debug models` for free;
  `Pin` sends one real call per model+effort and colours the row green, yellow
  or red. Pinning is confirmed in a dialog first because it spends tokens.
- **Failure handling.** A failed attempt retries the same tier once, then marks
  the route and disables the tier — it stays in the ladder and the user decides
  whether to delete it. `Retry` probes the tier once and re-enables it only if it
  answers. When every route is marked, the weakest slot is replaced by
  `deepseek-official/deepseek-flash@high`.
- **Per-session opt-in.** `mode: 'session'` keeps the plugin inert until a
  session enables it (`supa_session enable`). Children inherit their parent's
  state.
- **Context ledger and child queues** under `<workspace>/.dsh-supa/`, plus
  `supa_context`, `supa_report`, `supa_inbox`, `supa_spawn`,
  `supa_context_request`, `supa_context_supply`, `supa_authority`,
  `supa_status`, `supa_models` and `supa_session`.
- **Settings page** with drag-and-drop slots, a codex catalog, a policy card
  (session scope, approvals, authority ceiling, failure cooldown, questions) and
  a reset to the built-in default ladder.

### Fixed before the first release

- A corrupt ladder file used to be replaced by the default ladder; it is now
  quarantined as `models.json.corrupt-<ts>` first.
- State files are written atomically and concurrent failure marks are serialized,
  so two children failing at once no longer lose one mark.
- CLI arguments are quoted for Windows shells; an unquoted `&` in a prompt used
  to start a second command.
- An explicit `route:` no longer runs a tier the user switched off.
- Approvals are inherited by default; `autoApprove: true` is an explicit opt-in.

### Known limits

- Windows only.
- Nine of ten CLI drivers are unverified. `claude` needs a paid Claude
  subscription and `kimi` needs a Kimi account; neither was run here.
- No automated tests.
- The settings routes do not authenticate their caller.

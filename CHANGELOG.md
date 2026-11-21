# Changelog

All notable changes to this plugin. Dates are ISO.

## 0.3.1 — 2026-11-21

The CLI tiers run on macOS, a CLI conversation can be resumed, and routing can
match a capability instead of only a difficulty.

### Added

- **Two products, one plugin.** `profile: normal` is the ladder: difficulty
  routing, harness workers, the dependency and shell guards. `profile: eb` is
  external brains: native DSH keeps and manages its own subagents, and the
  plugin only lends read-only advisors plus the ledger and the queue.
  `supa_spawn` does not exist in EB mode — there it is `supa_brain`, and it
  refuses anything that is not an external CLI tier. `ladder` and `brain` are
  still accepted as the older spellings.
- **`supa_stop`** lists the workers of this session and interrupts one, a
  unique prefix, or all of them. Interruption stops the current execution; the
  parked queue and the Session survive, so a later message resumes it.
- **Capability tags.** A tier carries `tags` (`review`, `second-brain`,
  `long-context`, …) and `supa_spawn` takes `needs`; tiers missing a tag are
  skipped, and when nothing matches the brief says which capability was
  missing instead of silently routing by difficulty alone.
- **Claude Code conversations resume.** The driver asks for
  `--output-format json`, remembers `session_id` per driver+folder in
  `~/.dsh/supa/cli-sessions.json`, and passes `--resume` next time, so a
  reviewer accumulates context. `fresh: true` starts a new conversation;
  two runs of one conversation are serialised.
- **Brain tiers (`readonly`).** A tier can be declared a brain: it reads, thinks
  and reviews, and must not change the workspace. Claude enforces it with
  `--permission-mode plan` plus a denial of `Write`/`Edit`/`MultiEdit`/
  `NotebookEdit`/`Bash` — enforcement, not a prompt. Other tiers get the rule
  stated in the brief. `supa_models add` takes `readonly: true` and the ladder
  list marks such a tier `brain (read-only)`.

- **The team board carries status.** `supa_spawn` takes `task`; the worker
  reads it, claims it with its revision, does the work and completes it, and
  the charter tells a SupA to read progress from `team_task_list`. The id is
  only passed when `agentTeams.isEnabled` is true for the session.
- **Worker count on the pill** (`SupA · N`), refreshed from a cached state read.
- **A usage guide** (`docs/USAGE.md`) and a **BRAIN template**
  (`docs/BRAIN.template.md`) for collaboration that has to survive a model
  change.

### Changed

- **`handOffMode` (`job` by default).** A command that would block the turn is
  answered with a pointer at `run_in_background` instead of spawning an agent
  to run it: a job costs no tokens and leaves no session. `child` restores the
  old behaviour. The measured debt was 144 hand-offs at ~95k tokens each, with
  a median command length of 13.6s.
- A CLI child is no longer told to call `supa_report` — it has no such tool;
  its stdout is the result.
- Claude's model list is shown as **declared** aliases, because
  `claude models` is a chat prompt, not a listing.

### Fixed

- Toggling SupA is one file write; it used to rebuild the whole settings state
  inside the HTTP handler, which blocked the host and stalled the UI.
- `/supa/state` is cached for ten seconds and polled once a minute.
- A hand-off closes its usage row when the worker reports, and only a final
  report does that: a progress update used to write a second `done`.
- Routes register when the web server appears instead of never when the plugin
  mounted first.
- The SupA pill stays visible and retries while the host half answers, instead
  of disappearing.
- **macOS and Linux install again**: the `os: win32` guard is gone. The code
  already branches on `process.platform` for `.cmd` shims, PATH lookup and
  quoting, so llm tiers work everywhere; CLI tiers outside Windows stay
  experimental until someone verifies one.

### Fixed (CLI on POSIX)

- **CLI discovery outside Windows.** `findCodex` no longer looks only at
  `%LOCALAPPDATA%` and `.exe` paths: on macOS and Linux PATH decides (Homebrew,
  npm, nvm, pipx and the vendor installers all put the binary there), then
  `~/.codex/bin`, `~/.local/bin` and `~/.cargo/bin`. Windows still checks the
  Codex app install root first, then PATH.
- **A Host opened from the Dock finds the CLI it was told to run.** A child now
  gets PATH plus the install roots launchd does not pass down — `/opt/homebrew/bin`,
  `/usr/local/bin`, `/opt/local/bin`, `~/.local/bin`, `~/.opencode/bin`,
  `~/.cargo/bin`, `~/.bun/bin`, `~/.volta/bin`, the asdf shims, the newest
  nvm/fnm node bin and `~/Library/pnpm` — so an npm shim's
  `#!/usr/bin/env node` shebang resolves and a Dock-launched DSH behaves like a
  terminal one.
- **PATH lookup checks the executable bit on POSIX**, the way a shell does, and
  a name that resolves nowhere is reported as `… CLI not found` instead of
  failing later with `EACCES`. A directory that happens to share the name is not
  an executable either.
- **A timeout kills the whole CLI process tree on POSIX.** The CLI leads its own
  process group, gets SIGTERM, then SIGKILL two seconds later, so a helper that
  `codex exec` or `claude -p` started is not left running after the tier was
  marked failed.
- **A CLI started with no locale** (`LANG`/`LC_ALL`/`LC_CTYPE` unset, the normal
  case for an app opened from the Dock) gets a UTF-8 one, so non-ASCII output is
  not mangled.
- **A tier's `command` accepts `~`**, expanded against the Home directory.
- **The shell hand-off knows the macOS tools**: `brew install`, `port install`,
  `xcodebuild`, `pod install` and `swift build` are treated like `npm install` —
  run by a child instead of holding the turn open. The classifier now lives
  outside `apply()` and is exported, so `npm test` covers it.
- `supa_models list` prints the resolved codex path, or says it was not found,
  instead of echoing a name that may not exist.

### Added

- **`test/platform.test.js`**: executable discovery, PATH augmentation, the
  executable bit, `~` expansion, stdin and argument prompts, the child's
  environment, the timeout's process-group kill, and an npm shim finding its
  node shebang when PATH is only launchd's, all driven through a fixture CLI;
  plus the shell hand-off classifier, macOS tools included. The Windows `.cmd`
  shim case runs on Windows and is skipped elsewhere.

### Docs

- The READMEs, `docs/CLI-DRIVERS.md`, the roadmap and the contributing guide now
  describe the platform layer instead of calling everything outside Windows
  experimental. What is verified where is stated exactly: the launcher on macOS,
  and codex on Windows only.

## 0.3.0 — 2026-11-13

Targets the harness that flattened `subagents.startActivation` and shipped the
agent-team task board. **Breaking for older hosts:** below DSH 0.2.2 every spawn
is rejected, so `engines.dsh` now blocks the install there and 0.2.1 stays the
version for that host.

### Added

- **Team board integration.** `supa_spawn` takes `task`, and the worker reads the
  task, claims it with its revision, does the work, completes it and then
  reports; the charter tells a SupA to create tasks first and read progress from
  `team_task_list` instead of collecting status messages. The id is only passed
  when `agentTeams.isEnabled` is true for this session.
- **Session-scoped statistics**, a `scope` switch in the Stats view, and reuse
  attribution: a continued worker's call counts on the tier that did the work.
- **Hand-off and platform-subagent accounting**: `handoff` and `external` rows,
  so a session that delegated looks different from one that did nothing.

### Fixed

- The activation spec is spread into the call instead of nested under `request`,
  which is what the new harness expects.
- A hand-off closes its usage row when the worker reports, and only a final
  report does that: a progress update used to write a second `done` and halve
  the average.
- Routes register when the web server appears instead of never when the plugin
  mounted first.
- The SupA pill stays visible and retries while the host half answers, instead
  of disappearing.
- **macOS and Linux install again**: the `os: win32` guard is gone. The code
  already branches on `process.platform` for `.cmd` shims, PATH lookup and
  quoting, so llm tiers work everywhere; CLI tiers outside Windows stay
  experimental until someone verifies one.

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



# Changelog

All notable changes to this plugin. Dates are ISO.

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

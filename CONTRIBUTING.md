# Contributing

Thanks for looking. This is a small plugin; the fastest useful contribution is a
**reproduction of a bug** or a **fix for one item in [ROADMAP.md](ROADMAP.md)**.

## What it is

A DeepSeek Harness plugin (a "bundle") with two halves:

| File | Runs where | Job |
| --- | --- | --- |
| `index.js` | Host (Node) | Tools (`supa_*`), the model ladder, difficulty routing, failure marks, HTTP routes for the settings page |
| `client.js` | Browser | The settings page: ten drag-and-drop slots, the pinned model catalog, the policy card |
| `cordis.patch.yml` | Profile | Inserts the plugin row and its default config |
| `locale/*.json` | Both | Page title |

The browser half is plain JavaScript loaded through `window.__ModuleLoader__`;
its `id` **must equal the package name**. No build step.

## Run it locally

1. Clone the repo somewhere stable.
2. Point your DSH profile at the folder. The installed row in your profile's
   `cordis.patch.yml` looks like this:

   ```yaml
   - id: supa
     name: 'dsh-ladder-superagents'
     config:
       enabled: true
       autoApprove: false
   ```

   The name must equal `package.json`'s `name`, and the package must be
   resolvable by the profile (a `link:` source works).
3. Reload the plugin after a host change:

   ```
   plugin_manager set_plugin include:supa  enabled=false
   plugin_manager set_plugin include:supa  enabled=true
   ```

   **Check what that wrote.** If the disable reports `overridden` ("a
   higher-priority layer overrides it"), the command still saved
   `disabled: true` into your profile's `cordis.patch.yml` — and the next DSH
   restart will honour it and leave the plugin unmounted, which looks exactly
   like "my changes broke it". Open the file and delete that line, or replace it
   with `enabled: true`, before restarting.
4. A **client** change (`client.js`) needs a page refresh on top of that.

State lives outside the repo:

- `~/.dsh/supa/models.json` — the ladder
- `~/.dsh/supa/failures.json` — failed routes
- `~/.dsh/supa/codex-models.json` — last scan + pin results
- `~/.dsh/supa/sessions.json` — opt-in SupA sessions
- `<workspace>/.dsh-supa/` — the context ledger and child inboxes

## Rules this codebase learned the hard way

Follow these or the bug comes back:

1. **Every plugin-authored message goes through `userMessage()`.** A hand-built
   message without `role: 'user'` is rejected by the session log (HTTP 422).
2. **State writes are atomic and serialized.** Use `writeTextAtomic`, and queue
   concurrent writers through `failureWriteChain`. A plain `writeFile` on
   `models.json` has already caused data loss.
3. **Never reseed a ladder you cannot parse.** `readLadder` seeds only on
   `ENOENT`; a corrupt file is copied to `models.json.corrupt-<ts>` first.
4. **Do not delete a tier on the user's behalf.** A failed tier stays in the
   ladder, disabled and red; the user deletes it. The only automatic change is
   replacing the weakest slot with the built-in fallback when *every* route is
   marked failed.
5. **No silent automatic approval.** `autoApprove` defaults to `false`; anything
   else is an explicit opt-in.
6. **Shell arguments go through `quoteForShell`.** On Windows the CLI drivers run
   as `.cmd`/`.bat` through a shell; an unquoted `&` in a prompt starts a second
   command.
7. **New `supa_*` tools are gated for free.** In `mode: 'session'` the guard
   rejects every `supa_`-prefixed tool when the session is not enabled. If you
   add a tool that must work in a disabled session, add it to the exemption next
   to `supa_session`.
8. **Show costs in a dialog, not in a hover title.** Pinning spends tokens; the
   user must confirm it.

## Test it by hand

There is no test runner yet (see ROADMAP item 2). What to do instead:

- **Normal path**: open Settings → `dsh-ladder-superagents`, add a tier, drag it,
  disable it, remove it.
- **Cost-free catalog**: `Scan` only reads `codex debug models`. `Pin` spends one
  real call per effort — do not press it while testing layout changes.
- **Failure path**: back up `models.json`, then either add a tier with a model
  that cannot exist, or write a fake route mark into `failures.json`, and spawn
  against it. Restore the backup afterwards.
- **All-red fallback**: mark every route failed, spawn once, and check that the
  weakest slot was replaced by `deepseek-official/deepseek-flash@high`.

Always back up `~/.dsh/supa/*.json` before a destructive check.

Verifying one CLI driver is a self-contained task: the exact command line, the account it needs, and the acceptance test are in [docs/CLI-DRIVERS.md](docs/CLI-DRIVERS.md). Nine are open and each one is a good first pull request.

## Scope

Keep it small. This plugin routes work and verifies models; it does not become a
workflow engine, a second agent loop, or a UI framework. If a change adds a new
concept, explain in the pull request why the existing pieces cannot carry it.


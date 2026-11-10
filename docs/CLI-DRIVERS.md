# CLI drivers

A tier can be an external CLI instead of a Harness route. Each driver below has
one non-interactive mode: give it a prompt, get text back. That is all a SupA
child from an external tier needs.

**Only `codex` is verified.** The other nine are written from each CLI's
documented invocation and have never been run against a working account. This
file is the checklist for fixing that.

## What "verified" means

A driver is verified when all three hold, on a real account:

1. **Probe is green.** Settings → `dsh-ladder-superagents` → add a tier with that
   driver → press **Retry** on the row. It sends one real call
   (`Reply with the single word: ok`) and re-enables the tier only if text comes
   back.
2. **A spawn returns text.** `supa_spawn` with `route: <that tier id>` and a
   one-line brief produces a child whose result is the CLI's answer, not an
   error.
3. **The README table says so.** Move the driver from the unverified paragraph to
   the verified list.

## Verify one driver

```text
1. install the CLI and sign in to it (see the account column)
2. Settings → dsh-ladder-superagents → "Add a model manually" → kind: cli, driver: <name>
3. Retry on the new row
4. if green: spawn against it once with a trivial brief
5. update README.md and this file, then open a PR with the output you got
```

Do not paste tokens or full account names into the PR; the command line and the
first line of output are enough.

| Driver | Binary | Prompt | Status | Account needed |
| --- | --- | --- | --- | --- |
| `codex` | discovered (`codex.exe`, PATH) | stdin | **verified** | Codex / ChatGPT |
| `claude` | `claude` | stdin | unverified | paid Claude subscription |
| `kimi` | `kimi` | argument | unverified | Kimi account |
| `gemini` | `gemini` | argument | unverified | Google account or API key |
| `qwen` | `qwen` | argument | unverified | Qwen account |
| `cursor` | `cursor-agent` | argument | unverified | Cursor subscription |
| `opencode` | `opencode` | argument | unverified | a provider key in its config |
| `aider` | `aider` | argument | unverified | an API key |
| `copilot` | `copilot` | argument | unverified | GitHub Copilot subscription |
| `goose` | `goose` | argument | unverified | a provider in its config |

Every driver also accepts a per-tier `command` field, so a binary that is not on
`PATH` can be named by absolute path.

## Driver by driver

### codex — verified

```text
codex exec [--ephemeral] --skip-git-repo-check -C <cwd> --color never -o <file> \
  [-m <model>] [-c model_reasoning_effort=<effort>] -s workspace-write -
```

Prompt on stdin. `-s workspace-write` is the sandbox for `authority: workspace`;
`full` maps to `danger-full-access`. Two Codex builds can exist on one machine;
the plugin prefers the newest under `%LOCALAPPDATA%\OpenAI\Codex\bin`.

### claude

```text
claude -p --output-format text [--model <m>] [--effort <e>] \
  (--permission-prompts none | --dangerously-skip-permissions)
```

Prompt on stdin. `--effort` passes through only for
`low|medium|high|xhigh|max`. Without a login it exits 1 and prints
`Not logged in · Please run /login` **on stdout** (the plugin now reads both
streams). Sign in with `claude auth login`, confirm with `claude auth status`.

Open question worth answering in the PR: does `--permission-prompts none` make
tool-using answers fail, or only deny the prompting tools?

### kimi

```text
kimi [-m <model>] -p <prompt>
```

Prompt as an argument. Seen on this machine:
`failed to run prompt: provider managed:kimi-code has no credential configured` —
needs `kimi login`.

### gemini

```text
gemini [-m <model>] [--yolo] -p <prompt>
```

### qwen

```text
qwen [-m <model>] [--yolo] -p <prompt>
```

### cursor

```text
cursor-agent -p <prompt> --output-format text [--model <m>] [--force]
```

`--force` is used for `authority: full`.

### opencode

```text
opencode run <prompt> [-m <model>]
```

### aider

```text
aider --message <prompt> --yes --no-stream
```

Two things to check: aider wants a **git repository** as its working directory,
and `--yes` lets it edit files without asking. Use a scratch repo to verify.

### copilot

```text
copilot -p <prompt>
```

Check whether the current release needs an extra flag to skip its interactive
confirmation.

### goose

```text
goose run -t <prompt>
```

## Shared gotchas

- **Argument prompts are length-limited** on Windows (about 8k characters) and go
  through `quoteForShell`. Long briefs are fine for `codex` and `claude`
  (stdin), risky for the rest.
- **A CLI tier is a child process, not a Harness session**: neither the approval
  system nor the authority bookkeeping governs it. The authority ceiling maps
  onto each CLI's own bypass flag, and that is the whole control.
- **Verification costs money**: one probe is one real call. Do not press `Pin` or
  `Retry` in a loop.

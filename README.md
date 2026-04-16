# ralph-kit

[![CI](https://github.com/develo-pera/ralph-kit/actions/workflows/ci.yml/badge.svg)](https://github.com/develo-pera/ralph-kit/actions/workflows/ci.yml)
[![Tests](https://img.shields.io/badge/tests-66%20passing-brightgreen)](https://github.com/develo-pera/ralph-kit/actions/workflows/ci.yml)
[![Coverage](https://img.shields.io/badge/coverage-57%25-yellow)](https://github.com/develo-pera/ralph-kit/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@develo-pera/ralph-kit)](https://www.npmjs.com/package/@develo-pera/ralph-kit)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Agent: Claude Code](https://img.shields.io/badge/agent-Claude%20Code-blueviolet)](https://claude.ai/claude-code)

Conversational questionnaire + local Kanban dashboard + loop runner for [Ralph Loop](https://ghuntley.com/ralph/) projects.

Works with any Ralph Loop implementation — [frankbria/ralph-claude-code](https://github.com/frankbria/ralph-claude-code), [snarktank/ralph](https://github.com/snarktank/ralph), or a custom setup. ralph-kit scans your entire project, detects the layout, and drives the board and loop runner automatically.

## Quick start

### 1. Install

```bash
npm install -g @develo-pera/ralph-kit
ralph-kit install-commands   # drops slash commands into ~/.claude/commands/ralph-kit/
```

Or use without installing: `npx @develo-pera/ralph-kit <command>`

### 2. Initialize a project

```bash
cd your-project
ralph-kit init --flavor ralph-kit    # built-in loop, no dependencies
```

Available flavors:

| Flavor | What it installs |
|--------|-----------------|
| `ralph-kit` | Built-in loop runner, `.ralph/` layout — no external dependencies |
| `frankbria` | Clones from [frankbria/ralph-claude-code](https://github.com/frankbria/ralph-claude-code) — `.ralph/` + `.ralphrc` |
| `snarktank` | Clones from [snarktank/ralph](https://github.com/snarktank/ralph) — `scripts/ralph/ralph.sh` |

```bash
ralph-kit init --list    # see all available flavors
```

### 3. Define your project

In Claude Code chat:

```
/ralph-kit:define
```

This runs an interactive interview that generates `PROMPT.md`, `AGENT.md`, `specs/*.md`, and `fix_plan.md`. The board stays gated until this step is done.

### 4. Start the dashboard

```bash
ralph-kit board    # → http://localhost:4777
```

### 5. Run the loop

```bash
ralph-kit run              # 10 iterations (default)
ralph-kit run -n 25        # 25 iterations
```

Always use `ralph-kit run` — it works with any flavor:
- Detects your loop runner (e.g. `scripts/ralph/ralph.sh`) and delegates to it
- Falls back to the built-in loop when no external runner exists
- Writes `status.json` and `live.log` so the board updates in real-time
- Shows a spinner with elapsed time while Claude works
- Handles ctrl+C cleanly (writes "interrupted" status, no stale state)

### 6. Add more work

```
/ralph-kit:add-task         # quick task into fix_plan.md
/ralph-kit:add-feature      # feature spec + derived tasks
/ralph-kit:promote          # move backlog items → fix_plan.md
/ralph-kit:revise           # dialog-edit any control file
```

## How the board works

### Columns

| Column | What goes here |
|--------|---------------|
| **Backlog** | `backlog.md` items — a parking lot for ideas. Ralph never reads this file. |
| **To Do** | All unchecked tasks from `fix_plan.md` (High, Medium, Low priority). |
| **In Progress** | The top To Do item, automatically when the loop is running. |
| **Blocked** | `fix_plan.md ## Blocked` tasks + circuit breaker banners. |
| **Done** | Checked `[x]` tasks + resolved blockers (with timestamps). |

### Key behaviors

- **Drag and drop** — move cards between columns. Dragging from Backlog to To Do promotes the item into `fix_plan.md`.
- **Resolved blockers** — when a circuit breaker clears, the resolved event persists in `.ralph-kit/history.json` and shows in Done with a timestamp.
- **Live log** — collapsed panel at the bottom. Click to expand. Shows `live.log` output from the running loop.
- **Gated UI** — if the project isn't defined yet, columns are greyed out with a blocking card asking you to run `/ralph-kit:define`.

## CLI commands

| Command | What it does |
|---------|-------------|
| `ralph-kit init [--flavor name]` | Set up a Ralph Loop project with a chosen flavor. Clones runner files from GitHub and scaffolds control files. |
| `ralph-kit run [-n max]` | Run the Ralph loop. Delegates to detected runner or uses built-in loop. |
| `ralph-kit board` | Start the local Kanban dashboard on `:4777`. |
| `ralph-kit map [--dry-run] [--force]` | Scan the project, detect layout, and write `.ralph-kit/profile.json`. |
| `ralph-kit doctor` | Validate the Ralph directory layout. |
| `ralph-kit profile show` | Print the active profile. |
| `ralph-kit install-commands` | Copy slash commands into `~/.claude/commands/ralph-kit/`. |

## Slash commands

| Command | What it does |
|---------|-------------|
| `/ralph-kit:define` | Interactive questionnaire → generates PROMPT.md, AGENT.md, specs, and fix_plan.md. |
| `/ralph-kit:add-task` | Append one task to fix_plan.md. |
| `/ralph-kit:add-feature` | Feature spec + derived tasks. |
| `/ralph-kit:promote` | Move backlog items into fix_plan.md. |
| `/ralph-kit:revise` | Dialog-edit an existing control file. |

## How detection works

`ralph-kit map` scans your entire project (up to 4 levels deep) looking for Ralph-related files by signature. It detects:

- **Loop runner** — `ralph.sh`, `loop.sh`
- **Task list** — `fix_plan.md`, `prd.json`
- **Loop status** — `status.json`, `progress.json`
- **Circuit breaker** — dedicated breaker files or `status.json` with halted state
- **Live log** — `live.log`
- **Prompt / Agent** — `PROMPT.md`, `AGENT.md`, `CLAUDE.md`

Detection happens in three tiers:
1. **Declaration** — `.ralph-kit.json` at project root (implementation authors can ship this)
2. **Fingerprint** — matches known implementation patterns (frankbria, snarktank)
3. **Heuristic** — file signature matching as fallback

Conflicts (e.g. both `fix_plan.md` and `prd.json`) are reported. `CLAUDE.md` next to `ralph.sh` is recognized as a runner prompt, not a competing project prompt.

## Adding a new flavor

Add a new entry to `src/lib/flavors.ts` and submit a PR:

```typescript
const MY_FLAVOR: Flavor = {
  name: 'my-flavor',
  displayName: 'my-org/my-ralph',
  description: 'My custom Ralph Loop implementation',
  repo: 'my-org/my-ralph',
  branch: 'main',
  filesToClone: [
    { from: 'ralph.sh', to: 'scripts/ralph/ralph.sh' },
  ],
  scaffoldFiles: [
    { path: '.ralph/PROMPT.md', skipIfCloned: true },
    { path: '.ralph/fix_plan.md', skipIfCloned: true },
  ],
  root: '.ralph',
  taskFile: { file: 'fix_plan.md', format: 'markdown' },
};
```

Or drop a `.ralph-kit.json` in your project to declare the layout without a PR:

```json
{
  "root": "my-ralph",
  "taskFile": { "file": "tasks.json", "format": "json" }
}
```

## License

MIT

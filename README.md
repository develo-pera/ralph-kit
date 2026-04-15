# ralph-kit

Conversational questionnaire + local Kanban dashboard for [Ralph Loop](https://ghuntley.com/ralph/) projects.

Stop hand-writing markdown. Run an interview in Claude Code chat, get your `PROMPT.md`, `AGENT.md`, `specs/*.md`, `fix_plan.md`, and `backlog.md` generated for you. Then watch Ralph work in a live Kanban board.

## Install

```bash
npm install -g github:develo-pera/ralph-kit
ralph-kit install-commands   # one-time: drops slash commands into ~/.claude/commands/ralph-kit/
```

Ephemeral, no global install:

```bash
npx github:develo-pera/ralph-kit board
```

## Usage

```bash
# 1. If you don't already have a .ralph/ — scaffold a neutral layout
ralph-kit init

# 2. Start the Kanban dashboard
ralph-kit board      # → http://localhost:4777

# 3. In Claude Code chat, define the project (the UI stays gated until this runs)
/ralph-kit:define

# 4. Add new work without editing files
/ralph-kit:add-task         # default: into Backlog
/ralph-kit:promote          # move Backlog → To Do
/ralph-kit:add-feature      # feature spec + derived tasks
/ralph-kit:revise           # dialog-edit any control file
```

Ralph-kit is implementation-agnostic. It works with any Ralph Loop variant that uses the `.ralph/` + `PROMPT.md` + `fix_plan.md` convention ([frankbria/ralph-claude-code](https://github.com/frankbria/ralph-claude-code), [snarktank/ralph](https://github.com/snarktank/ralph), etc.). `ralph-kit init` scaffolds the layout without depending on any specific Ralph CLI being installed.

## Commands

| Slash command | What it does |
|---|---|
| `/ralph-kit:define` | Interactive questionnaire. Detects existing `.ralph/` and offers **create / update / supplement** modes. Writes `PROMPT.md`, `AGENT.md`, `specs/*.md`, and initial `fix_plan.md` after diff review. |
| `/ralph-kit:add-task` | Append one task. `--to backlog\|todo\|blocked` (default: `backlog`). |
| `/ralph-kit:add-feature` | One-feature mini-spec → adds `specs/<slug>.md` + derived tasks to `fix_plan.md`. |
| `/ralph-kit:promote` | Move selected items from `backlog.md` into `fix_plan.md ## High Priority`. |
| `/ralph-kit:revise` | Dialog-edit an existing `PROMPT.md`, `AGENT.md`, or one spec file. |

All slash commands are namespaced under `ralph-kit:` so it's always clear which package owns them.

| CLI command | What it does |
|---|---|
| `ralph-kit init` | Scaffold a neutral `.ralph/` layout (implementation-agnostic). |
| `ralph-kit board` | Local web Kanban on `:4777`. Reads `./​.ralph/` in cwd. Auto-creates `backlog.md` if missing. |
| `ralph-kit doctor` | Validate `.ralph/` layout; returns `missing` / `uninitialized` / `initialized`. |
| `ralph-kit install-commands` | Copies slash commands into `~/.claude/commands/ralph-kit/`. |

## Board columns

Flow: **Backlog → To Do → In Progress → Blocked → Done**

| Column | Source | Drag behavior |
|---|---|---|
| **Backlog** | `.ralph/backlog.md` — your capture inbox. Ralph doesn't read this file. | Drag right → promoted into `fix_plan.md ## High Priority` |
| **To Do** | `.ralph/fix_plan.md ## High Priority` | Drag left → back to backlog. Drag right → Blocked. |
| **In Progress** | Only populated when `progress.json.status === "running"` — the top High Priority task. | Not user-movable; Ralph decides. |
| **Blocked** | `.ralph/fix_plan.md ## Blocked` + a banner when project `Status: BLOCKED` or circuit breaker OPEN | Drag out to unblock. |
| **Done** | `- [x]` anywhere (backlog or fix_plan). | — |

### Gated UI

If the project hasn't been defined yet (`.ralph/` scaffold but `fix_plan.md` still says `Status: BLOCKED` or no specs), the board greys out all columns, hides `+ Add task`, and shows a blocking card asking you to run `/ralph-kit:define`. The gate auto-lifts the instant the questionnaire writes the files — no page reload needed.

### Live log panel

Collapsed by default at the bottom of the board. Click the bar (or press `` ` ``) to expand into a VS Code–style terminal with pause-scroll and clear controls. Expanded/collapsed state persists in `localStorage`.

## Roadmap

- Phase 1 (v0.1): questionnaire, board, slash commands, file-watch updates ✓
- Phase 2 (v0.2): backlog inbox, column redesign, gated UX, neutral bootstrap ✓
- Phase 3 (deferred): `ralph-kit sync-github` — mirror `fix_plan.md` ↔ GitHub Issues + Projects v2 board.

## License

MIT

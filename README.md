# ralph-kit

Conversational questionnaire + local Kanban dashboard for [Ralph Loop](https://ghuntley.com/ralph/) projects.

Stop hand-writing markdown. Run an interview in Claude Code chat, get your `PROMPT.md`, `AGENT.md`, `specs/*.md`, `fix_plan.md`, and `backlog.md` generated for you. Then watch Ralph work in a live Kanban board.

## Install

**Try it with no install (recommended):**

```bash
npx @develo-pera/ralph-kit board
```

Nothing is added to your project. On first run, npm caches the package; subsequent `npx` invocations are instant.

**Install globally** (if you use ralph-kit across many projects):

```bash
npm install -g @develo-pera/ralph-kit
ralph-kit install-commands   # one-time: drops slash commands into ~/.claude/commands/ralph-kit/
```

**Install per-project** (pins the version in `package.json`):

```bash
npm install --save-dev @develo-pera/ralph-kit
npx ralph-kit board
```

> The CLI binary is `ralph-kit` regardless of install method. The scope only affects the package name.

## Usage

```bash
# 1. Point ralph-kit at your existing Ralph Loop project (first step for most users)
ralph-kit map        # scans the project, writes .ralph-kit/profile.json

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

Starting fresh (no Ralph Loop implementation installed yet)? Use `ralph-kit init` to scaffold a minimal neutral layout instead of `ralph-kit map`.

Ralph-kit is **implementation-agnostic**. It works with any Ralph Loop variant — e.g. [frankbria/ralph-claude-code](https://github.com/frankbria/ralph-claude-code) (uses `.ralph/`), [snarktank/ralph](https://github.com/snarktank/ralph) (uses `ralph/`), or a custom setup. `ralph-kit map` detects the directory name, loop state files, circuit-breaker location, and section naming on its own and writes a `.ralph-kit/profile.json` that drives everything else. Edit it by hand if anything was misdetected.

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
| `ralph-kit map` | Introspect the project, detect which Ralph Loop flavor it uses, and write `.ralph-kit/profile.json`. Recommended first command in any existing Ralph project. Pass `--dry-run` to preview, `--force` to overwrite. |
| `ralph-kit profile show` | Print the active profile (persisted or auto-detected). |
| `ralph-kit init` | Scaffold a neutral `.ralph/` layout (for projects that don't yet have a Ralph Loop set up). |
| `ralph-kit board` | Local web Kanban on `:4777`. Reads the Ralph directory named in the profile (default `.ralph/`). Auto-creates `backlog.md` if missing. |
| `ralph-kit doctor` | Validate the Ralph directory layout; returns `missing` / `uninitialized` / `initialized`. |
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

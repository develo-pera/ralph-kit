# ralph-kit

Conversational questionnaire + local Kanban dashboard for [Ralph Loop](https://github.com/frankbria/ralph-claude-code) projects.

Stop hand-writing markdown. Run an interview in Claude Code chat, get your `PROMPT.md`, `AGENT.md`, `specs/*.md`, and `fix_plan.md` generated for you. Then watch Ralph work in a live Kanban board.

## Install

```bash
npm install -g github:develo-pera/ralph-kit
ralph-kit install-commands   # one-time: drops slash commands into ~/.claude/commands/
```

Ephemeral, no global install:

```bash
npx github:develo-pera/ralph-kit board
```

## Usage

In any Ralph project directory:

```bash
# 1. Start the Kanban dashboard (cwd must contain a .ralph/ dir)
ralph-kit board
# → http://localhost:4777

# 2. In Claude Code chat, define or update the project (never write markdown again)
/ralph-kit:define

# 3. Add new work without editing files
/ralph-kit:add-feature
/ralph-kit:add-task
/ralph-kit:revise
```

The board live-updates while `ralph --monitor` runs in another pane.

## Commands

| Slash command | What it does |
|---|---|
| `/ralph-kit:define` | Interactive questionnaire. Detects existing `.ralph/` and offers **create / update / supplement** modes. Writes `PROMPT.md`, `AGENT.md`, `specs/*.md`, and initial `fix_plan.md` after diff review. |
| `/ralph-kit:add-feature` | One-feature mini-spec → adds `specs/<slug>.md` + derived tasks to `fix_plan.md`. |
| `/ralph-kit:add-task` | Single checkbox line appended under the priority you pick. |
| `/ralph-kit:revise` | Dialog-edit an existing `PROMPT.md`, `AGENT.md`, or one spec file. |

All slash commands are namespaced under `ralph-kit:` so it's always clear which package owns them.

| CLI command | What it does |
|---|---|
| `ralph-kit board` | Local web Kanban on `:4777`. Reads `./​.ralph/` in cwd. |
| `ralph-kit doctor` | Validates `.ralph/` layout; reports missing or malformed files. |
| `ralph-kit install-commands` | Copies slash commands into `~/.claude/commands/ralph-kit/` (idempotent; removes legacy un-namespaced copies). |

## Board columns

Derived live from `.ralph/fix_plan.md` + `.ralph/status.json` + `.ralph/.circuit_breaker_state`:

- **Up Next** — unchecked under `## High Priority`
- **In Progress** — top unchecked task at start of current Ralph loop
- **Backlog** — unchecked under `## Medium Priority` / `## Low Priority`
- **Done** — `- [x]` anywhere
- **Blocked** (banner) — when circuit breaker is OPEN or `fix_plan.md` begins with `Status: BLOCKED`

## Roadmap

- Phase 1–5 (this release): questionnaire, board, slash commands, file-watch updates.
- Phase 6 (deferred): `ralph-kit sync-github` — mirror `fix_plan.md` ↔ GitHub Issues + Projects v2 board, auto-toggle `.ralphrc` `TASK_SOURCES`.

## License

MIT

---
description: Interview the user, then generate or update all Ralph Loop control files (PROMPT.md, AGENT.md, specs/*.md, fix_plan.md) with diff-preview before writing. Never makes the user hand-write markdown.
argument-hint: (no args — fully interactive)
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, AskUserQuestion
---

# /ralph-define

You are running the Ralph-Kit project-definition interview. The target project is the user's current working directory; all writes go to `./​.ralph/`.

## Step 1 — Detect state

Read these files if present:

- `.ralph/PROMPT.md`
- `.ralph/fix_plan.md`
- `.ralph/AGENT.md`
- `.ralph/specs/` (list files)
- `package.json`, `pyproject.toml`, `Cargo.toml`, `go.mod` (for stack autodetection)

Classify the project state:

| Signal | Classification |
|---|---|
| `fix_plan.md` begins with `Status: BLOCKED` or is empty | **EMPTY** |
| `PROMPT.md` is default-looking + `specs/` empty | **LIGHT** |
| Rich `PROMPT.md` + ≥1 spec file | **RICH** |

State the classification in one sentence, then use `AskUserQuestion` to offer modes:

- EMPTY → only **Create** (no other choice needed — proceed).
- LIGHT → **Update full**, **Supplement missing**, **Cancel**.
- RICH → **Supplement missing**, **Add feature**, **Revise single file**, **Cancel**.

## Step 2 — Interview (create / update)

Use `AskUserQuestion` for branching answers and plain chat messages for free-text. Ask one stage at a time.

**Stage A — Identity**
1. Project name (confirm against `.ralphrc` `PROJECT_NAME` if present).
2. One-sentence purpose.
3. Target user (who will use this thing?).
4. Success criteria — free text, "we'll know this is done when…".

**Stage B — Scope & stack**
1. Language / framework — offer detected stack as recommended option.
2. Deployment target (local CLI, web app, Docker, serverless, library, other).
3. Must-have features — free text, one per line, ≥1.
4. Nice-to-have features — free text, optional.

**Stage C — Features (loop per must-have)**
For each must-have feature ask (as one `AskUserQuestion` with free-text options, OR as three chat questions):
1. What does it do? (1–2 sentences.)
2. Inputs / outputs — what goes in, what comes out.
3. Acceptance — how will we know it works? (testable bullet list.)

**Stage D — Build commands**
Offer detected install / run / test commands as the recommended answer. User confirms or edits.

**Stage E — Initial backlog**
Draft a first-pass `fix_plan.md` by expanding each must-have into 2–4 tasks sized for a single Ralph loop (10–20 min each). Show the user the draft. Use `AskUserQuestion` for "Priorities look right?" with options **Accept**, **Reorder**, **Edit tasks**. Iterate until accepted.

## Step 3 — Generate files (in memory first)

Generate the full text for each file you will write:

- `.ralph/PROMPT.md` — **preserve the existing `---RALPH_STATUS---` contract block verbatim** (read current file and keep the Status Reporting section). Replace only the Context, Current Objectives, and Current Task sections with content derived from the interview.
- `.ralph/AGENT.md` — fill build/test/run from Stage D.
- `.ralph/specs/<slug>.md` — one file per must-have feature, slug = kebab-case of feature name, content = Stage C answers formatted as markdown (Purpose, I/O, Acceptance Criteria).
- `.ralph/fix_plan.md` — accepted backlog from Stage E, with sections `## Status: READY`, `## High Priority`, `## Medium Priority`, `## Low Priority`, `## Completed`, `## Notes`. Carry forward any existing `- [x]` items into Completed.

## Step 4 — Diff review before write

For each file you will modify:

1. Read the current file contents (if it exists).
2. Show a unified diff in chat (use ```diff fenced block; keep under 60 lines, summarize if longer).
3. Ask with `AskUserQuestion`: **Apply**, **Edit further**, **Skip this file**.

Only after the user picks **Apply** for a file, use the `Write` tool to commit it. Never write without explicit approval. Never touch `.ralphrc` or anything outside `.ralph/`.

## Step 5 — Final report

After all writes, print:

```
✓ PROMPT.md       (N lines)
✓ AGENT.md        (N lines)
✓ specs/feat-a.md (new)
✓ specs/feat-b.md (new)
✓ fix_plan.md     (Status: READY, X tasks in High, Y in Medium)
```

Then tell the user exactly how to see it live:

> Run `ralph-kit board` in another terminal → http://localhost:4777

## Guardrails

- Never write any file outside `.ralph/`.
- Never modify `.ralphrc`.
- Never overwrite an existing `- [x]` completed task — carry them forward into Completed.
- If the user abandons mid-interview, write nothing.
- Keep each task in `fix_plan.md` sized for one 10–20 minute loop. If a feature is larger, split it into multiple tasks.

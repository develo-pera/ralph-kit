---
description: Promote one or more items from .ralph/backlog.md into Ralph's execution queue (.ralph/fix_plan.md ## High Priority). Backlog = your inbox; fix_plan = what Ralph actually works on.
argument-hint: (no args — interactive multiselect)
allowed-tools: Read, Write, Edit, AskUserQuestion, Bash
---

# /ralph-kit:promote

Move unchecked items from `.ralph/backlog.md` into `.ralph/fix_plan.md` under `## High Priority`, atomically.

## Flow

1. Read `.ralph/backlog.md`. If it doesn't exist or has no unchecked items, tell the user "Backlog is empty — nothing to promote" and stop.
2. Read `.ralph/fix_plan.md`. If it's missing or starts with `Status: BLOCKED`, stop and recommend `/ralph-kit:define` first.
3. Build a list of all unchecked backlog items (across groups). Present them via `AskUserQuestion` with `multiSelect: true` so the user can pick any combination.
4. For each picked item, run the equivalent of `ralph-kit`'s `promoteToTodo(cwd, text)` — which moves the item from backlog to `fix_plan.md ## High Priority` in an atomic paired write. You can either call the helper via a short Node one-liner:

   ```bash
   node -e "require('ralph-kit/lib/promote').promoteToTodo(process.cwd(), process.argv[1])" "<task text>"
   ```

   …or perform the edit yourself: remove the line from `backlog.md` and append `- [ ] <text>` under `## High Priority` in `fix_plan.md`, then write both files.

5. Confirm: `✓ Promoted N item(s) to fix_plan.md ## High Priority`.

## Guardrails

- Never promote a task that's already `- [x]` — it's done.
- Never modify any other section of either file.
- If a task with identical text already exists in `fix_plan.md`, warn the user and ask whether to skip or duplicate.
- If the user cancels mid-selection, write nothing.

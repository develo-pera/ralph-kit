---
description: Append a single task checkbox to fix_plan.md under a chosen priority. Fastest path from "idea in head" to "task in backlog" without touching markdown.
argument-hint: [task text]
allowed-tools: Read, Write, Edit, AskUserQuestion
---

# /ralph-kit:add-task

Append one `- [ ] <text>` line to `.ralph/fix_plan.md`.

## Flow

1. If `$ARGUMENTS` is non-empty, use it as the task text. Otherwise ask the user for the text.
2. Ask priority with `AskUserQuestion`: **High Priority** (recommended), **Medium Priority**, **Low Priority**.
3. Read `.ralph/fix_plan.md`. If missing or `Status: BLOCKED`, stop and recommend `/ralph-kit:define`.
4. Append the new line to the chosen section. If the section doesn't exist, create it in canonical order (High → Medium → Low → Completed).
5. Write the file. Confirm in one line: `✓ Added "<text>" to <priority>`.

No diff prompt — this is a fast-path command. Keep the edit minimal and atomic.

## Guardrails

- Do not modify any task other than the one being added.
- Do not rewrite unrelated sections.
- If the task is clearly too big for one Ralph loop (>1 sentence describing multiple actions), warn and suggest `/ralph-kit:add-feature` instead, but still honor the user's choice if they proceed.

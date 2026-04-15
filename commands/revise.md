---
description: Dialog-edit an existing Ralph control file (PROMPT.md, AGENT.md, or one spec). User describes the change in plain language; Claude applies it with diff preview.
argument-hint: [file — PROMPT | AGENT | spec/<name> | fix_plan]
allowed-tools: Read, Write, Edit, Glob, AskUserQuestion
---

# /ralph-kit:revise

Make a conversational edit to one Ralph control file, without the user writing markdown.

## Flow

1. If `$ARGUMENTS` names a file, resolve it:
   - `PROMPT` → `.ralph/PROMPT.md`
   - `AGENT` → `.ralph/AGENT.md`
   - `fix_plan` → `.ralph/fix_plan.md`
   - `spec/<name>` → `.ralph/specs/<name>.md`
   Otherwise list available files and ask with `AskUserQuestion` which to revise.

2. Read the file. Show a short summary (first ~20 lines or structure).

3. Ask the user in chat: "What should change?" — free-text.

4. Draft the edit. Show a unified diff (```diff fenced).

5. Ask with `AskUserQuestion`: **Apply**, **Edit further**, **Cancel**.

6. On Apply, write the file.

## Guardrails

- For `PROMPT.md`, never remove the `---RALPH_STATUS---` contract block or the Protected Files section — warn and preserve them.
- For `fix_plan.md`, never silently drop existing `- [x]` completed tasks; they must be preserved.
- Never touch `.ralphrc` or anything outside `.ralph/`.

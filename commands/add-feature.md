---
description: Add one feature to an existing Ralph project — generates specs/<slug>.md and appends derived tasks to fix_plan.md under the priority the user chooses.
argument-hint: [optional feature name]
allowed-tools: Read, Write, Edit, AskUserQuestion
---

# /ralph-kit:add-feature

Add a single feature to the current Ralph project (`./​.ralph/`).

## Step 1 — Prerequisites

Read `.ralph/fix_plan.md` and `.ralph/PROMPT.md`. If either is missing or `fix_plan.md` starts with `Status: BLOCKED`, stop and tell the user to run `/ralph-kit:define` first.

## Step 2 — Feature intake

If the user passed a feature name as argument, use it as the default. Otherwise ask for the name. Then ask the three mini-spec questions:

1. What does it do? (1–2 sentences.)
2. Inputs / outputs.
3. Acceptance criteria (testable bullets).

Then ask the priority with `AskUserQuestion`: **High**, **Medium**, **Low**.

## Step 3 — Draft tasks

Expand the feature into 2–4 tasks sized for one Ralph loop each. Show the draft in chat.

## Step 4 — Diff preview + write

1. Show the new `.ralph/specs/<slug>.md` content.
2. Show the appended-to `fix_plan.md` section as a diff.
3. Ask with `AskUserQuestion`: **Apply**, **Edit**, **Cancel**.
4. On Apply, write the spec file and rewrite `fix_plan.md` with the appended tasks.

## Guardrails

- Slug = kebab-case of feature name; if `specs/<slug>.md` exists, append suffix `-2`, `-3`, etc.
- Never modify existing tasks; only append.
- Never write outside `.ralph/`.

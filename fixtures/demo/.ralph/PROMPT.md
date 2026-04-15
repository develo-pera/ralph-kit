# Ralph Loop — Demo Project

This is a fixture project used by `npm run dev` to exercise the Ralph Kit UI
against realistic data. The Ralph Loop would normally drive an agent against
this, but in the fixture it is frozen at a representative moment in time.

## Goal

Build a tiny CLI that summarizes git activity per author over the last N days.

## Constraints

- Node 18+, zero runtime dependencies beyond the stdlib.
- All output must be stable (no timestamps in stdout).
- Tests run under `vitest` and must pass on every loop.

## Working agreements

- Keep changes small enough to review in a single screen.
- If a spec is ambiguous, halt and record the question in `fix_plan.md`.

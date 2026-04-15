# git-summary — fix plan

## Status: RUNNING — loop 12

## High Priority
- [ ] Implement `--author` filter end-to-end (specs/cli.md)
- [ ] Sort output by commit count descending (specs/cli.md)
- [ ] Handle `--days 0` gracefully (print nothing, exit 0)

## Medium Priority
- [ ] Cache `git log` output across loops when args are unchanged
- [ ] Add `--json` output mode

## Low Priority
- [ ] Colourize terminal output when `stdout.isTTY`
- [ ] Publish to npm under `@demo/git-summary`

## Blocked
- [ ] Windows path handling — waiting on test runner fix upstream

## Completed
- [x] Scaffold `bin/git-summary.js` with commander
- [x] Parse `--days` option with a 14-day default
- [x] Exit 1 when not inside a git repo
- [x] Wire vitest and add first smoke test

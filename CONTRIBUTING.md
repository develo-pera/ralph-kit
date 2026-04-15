# Contributing to ralph-kit

Thanks for your interest in ralph-kit. This guide covers how to get set up, how to structure changes, and what we expect from a PR.

**Every contribution matters** — fixing a typo, tightening a type, or shipping a whole new command. Small, focused changes are easier to review and ship than big ones.

## Table of Contents

1. [Getting Started](#getting-started)
2. [Development Workflow](#development-workflow)
3. [Code Style](#code-style)
4. [Testing](#testing)
5. [Pull Request Process](#pull-request-process)
6. [Commit Messages](#commit-messages)
7. [Releases](#releases)
8. [Code of Conduct](#code-of-conduct)

---

## Getting Started

### Prerequisites

- **Node.js 18+** — required runtime.
- **npm** — ships with Node.
- **git** — version control.

Optional, but helpful:
- A project with a `.ralph/` directory to point the dashboard at, or use the built-in `fixtures/demo` fixture.

### Clone and Install

```bash
# Fork on GitHub, then clone your fork
git clone https://github.com/YOUR_USERNAME/ralph-kit.git
cd ralph-kit
npm install
```

### Verify Your Setup

```bash
# Type-check, tests, production build — all three should be clean
npm run typecheck
npm test
npm run build
```

You should see 17/17 tests passing and a successful build.

### Run It Locally

```bash
# One-shot: Express API + Vite dev server with HMR
# (Express defaults to fixtures/demo; override with RALPH_KIT_DEV_DIR=/path)
npm run dev
```

Open http://localhost:5173. Edit any `.tsx` / `.css` in `web/src/` and the browser updates instantly.

To test the production path (Express serving the built bundle):

```bash
npm run build
npm run board   # runs tsx against fixtures/demo by default
```

### Project Structure

```
ralph-kit/
├── src/                    # Backend TypeScript sources
│   ├── bin/ralph-kit.ts    # CLI entry
│   ├── lib/                # Parsers, state, doctor, promote, writers
│   │   └── *.test.ts       # Vitest suite (runs against TS directly)
│   └── server/             # Express + routes
├── web/                    # Frontend (Vite + React + TypeScript)
│   ├── src/
│   │   ├── components/
│   │   ├── hooks/
│   │   └── ...
│   └── vite.config.ts
├── commands/               # Slash-command markdown for Claude Code
├── fixtures/demo/          # Dev fixture for npm run dev
├── dist/                   # Compiled backend (gitignored, shipped via files[])
└── web/dist/               # Built frontend bundle (gitignored, shipped)
```

---

## Development Workflow

We use **GitHub Flow**: short-lived feature branches, every change lands on `main` via pull request. Nothing is committed directly to `main`.

### Branch Naming

| Kind | Format | Example |
|---|---|---|
| Feature | `feat/<slug>` | `feat/dark-mode-toggle` |
| Bug fix | `fix/<slug>` | `fix/port-conflict-message` |
| Refactor | `refactor/<slug>` | `refactor/promote-atomics` |
| Docs | `docs/<slug>` | `docs/contributing-guide` |
| Tests | `test/<slug>` | `test/backlog-parser-edges` |
| Chore | `chore/<slug>` | `chore/bump-vite` |

```bash
git switch -c feat/my-change
```

### Workflow

```
┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐
│ 1. Fork  │──▶│ 2. Clone │──▶│ 3. Branch│──▶│ 4. Code  │
└──────────┘   └──────────┘   └──────────┘   └──────────┘
                                                   │
                                                   ▼
┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐
│ 8. Merge │◀──│ 7. PR    │◀──│ 6. Push  │◀──│ 5. Verify│
│ (squash) │   │ approved │   │ branch   │   │ locally  │
└──────────┘   └──────────┘   └──────────┘   └──────────┘
                    ▲
                    │
               ┌──────────┐
               │ CI green │
               └──────────┘
```

---

## Code Style

### TypeScript

- **Strict mode is on.** No `any` unless there's a genuine reason; prefer `unknown` + narrowing.
- **CommonJS output** (`module: node16`). Source uses ES-style `import`; tsc emits `require`.
- **No comments unless the *why* is non-obvious.** Don't restate what the code does; explain hidden constraints, workarounds, or behavior that would surprise a reader. Identifiers should carry the meaning.
- **No dead abstractions.** Don't introduce helpers, layers, or feature flags for hypothetical future requirements.
- **Validate at boundaries, not internally.** Trust your own code; validate request bodies, filesystem input, user input.

### React

- Function components + hooks. No class components.
- Local state in `useState`; side effects in `useEffect`. Lift state only when needed.
- Accessibility over cleverness — use native `<button>`, `<dialog>`, `<label>`, etc. before rolling custom.
- Styling: CSS variables against the shadcn token scheme (`--background`, `--foreground`, `--card`, etc.). Don't hardcode hex values in new components.

### Naming

- Files: `snake_case.ts` for lib modules (matches the pre-existing convention — `fix_plan_parser`, `backlog_parser`), `PascalCase.tsx` for React components, `camelCase.ts` for hooks.
- Exports: `camelCase` for values, `PascalCase` for types and React components.

### Imports

- Node built-ins use the `node:` prefix: `import fs from 'node:fs'`.
- Prefer named imports over default where the module offers them.
- Relative imports stay within `src/` or `web/src/`; no reaching across the two.

---

## Testing

Tests live next to the code they cover (`src/lib/*.test.ts`). We use [Vitest](https://vitest.dev/).

```bash
npm test                # run once
npx vitest              # watch mode
npx vitest <pattern>    # run a single file or test
```

**What to test:**
- Parsers: round-trip (`parse(serialize(x)) === x`), edge cases (empty input, malformed lines).
- State transitions: `promote`, `demoteToBacklog`, etc. — use `fs.mkdtempSync` for isolated fixtures.
- Doctor: missing / uninitialized / initialized states.
- Bug fixes: add a regression test in the same PR.

**What not to test:**
- Static React rendering — visual regressions are better caught manually.
- Framework behavior (Express routing, Vite bundling) — that's their problem, not ours.

**CI enforces:** `npm run typecheck`, `npm test`, `npm run build` must all be green before a PR can merge.

---

## Pull Request Process

1. **One concern per PR.** If you find yourself writing "and also" in the description, it's probably two PRs.
2. **Keep PRs small.** ≤300 lines changed is reviewable in one sitting; bigger ones tend to stall.
3. **PR description** should explain:
   - What this PR does (one or two sentences).
   - Why — the problem or motivation.
   - How you verified it (manual steps, tests added, screenshots for UI).
4. **Link issues** with `Fixes #123` / `Closes #123` / `Refs #123`.
5. **CI must be green** before merge. If it's red and you think it's flaky, say so in the PR.
6. **Squash-merge** is the default. The PR title becomes the commit message — write it accordingly (conventional commits, imperative mood).

### Draft PRs

Open as a draft while work is in progress. Mark it ready when you want review.

### Self-review first

Before requesting review, open your own PR on GitHub and read the diff top-to-bottom. Half the feedback you'd get from someone else is feedback you'd catch yourself with fresh eyes.

---

## Commit Messages

We use [Conventional Commits](https://www.conventionalcommits.org/).

```
<type>(<scope>): <subject>

<body — optional, wrap at 72>

<footer — optional: Closes #123, BREAKING CHANGE:, Co-Authored-By:>
```

### Types

| Type | Use for |
|---|---|
| `feat` | New user-visible functionality |
| `fix` | Bug fix |
| `refactor` | Change that neither adds nor fixes behavior |
| `docs` | Docs only |
| `test` | Test-only changes |
| `chore` | Tooling, config, deps — nothing end-user-visible |
| `perf` | Performance improvement |
| `style` | Whitespace / formatting only |

### Scope

Usually the area of the codebase: `web`, `server`, `lib`, `bin`, `readme`, `deps`. Omit if the change is cross-cutting.

### Writing good messages

- Imperative mood: "add", not "added" or "adds".
- Subject ≤72 chars. If you can't fit it, the PR is probably doing too much.
- Body explains **why**, not what — the diff already shows what.
- Reference issues in the footer.

### Examples

```
feat(web): add light/dark theme switching

fix(server): auto-increment port when default is in use

refactor: migrate bin, lib, server to TypeScript

docs(readme): link Ralph Loop reference to ghuntley.com/ralph
```

---

## Releases

Ralph-kit is published to npm. Release cadence is driven by meaningful changes, not a calendar.

### Versioning

We follow [semver](https://semver.org/):
- **patch** (`0.1.0` → `0.1.1`) — bug fixes, docs, internal refactors.
- **minor** (`0.1.0` → `0.2.0`) — new features, non-breaking additions.
- **major** (`0.1.0` → `1.0.0`) — breaking changes to the CLI, slash commands, or exported API.

### Cutting a release

From a clean `main`:

```bash
npm test && npm run build        # sanity
npm version minor                # bumps package.json, creates a git tag
git push --follow-tags           # pushes the tag
npm publish                      # or let a GitHub Action publish on tag
```

`prepublishOnly` runs `npm test && npm run build` automatically, so `npm publish` can't ship a broken build.

---

## Code of Conduct

Be kind, be specific, be direct. Disagree with ideas, not with people. If you catch yourself writing something you wouldn't say to a colleague's face, rewrite it. That's it.

---

Questions? Open an issue or start a discussion on the repo.

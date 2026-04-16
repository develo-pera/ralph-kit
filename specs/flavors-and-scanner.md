# Spec: Flavors System + Full-Project Scanner

## Problem

ralph-kit currently assumes a single ralph root directory contains everything.
In practice, users install different Ralph Loop implementations that scatter files
across the project:

- `.ralph/` — control files (PROMPT.md, AGENT.md, fix_plan.md)
- `scripts/ralph/` — loop runner (ralph.sh, CLAUDE.md, prd.json)
- `.ralphrc` — loop configuration (project root)
- `.ralph-kit/` — ralph-kit's own state (profile.json, history.json)

The probe only scans one directory and misses files outside it. Users who run
`ralph-kit init` and then install a separate loop implementation end up with a
split layout that nothing understands. There's no guided installation path.

## Solution

Three interconnected features:

1. **Full-project scanner** — replaces the current single-directory probe
2. **Flavors registry** — declares known Ralph Loop implementations
3. **Interactive init** — installs a chosen flavor and scaffolds a consistent layout

---

## 1. Full-Project Scanner

### What it does

Walks the entire project directory (respecting .gitignore) looking for
ralph-related files by signature. Builds a **file map** organized by role,
not by directory.

### File roles

| Role | Signature files | Examples |
|------|----------------|----------|
| `prompt` | PROMPT.md, prompt.md | `.ralph/PROMPT.md` |
| `agent` | AGENT.md, agent.md | `.ralph/AGENT.md` |
| `taskList` | fix_plan.md, prd.json, tasks.json | `.ralph/fix_plan.md`, `scripts/ralph/prd.json` |
| `loopRunner` | ralph.sh, loop.sh | `scripts/ralph/ralph.sh` |
| `loopConfig` | .ralphrc, ralph.config.json | `.ralphrc` |
| `loopStatus` | status.json, progress.json | `.ralph/status.json` |
| `breaker` | *circuit_breaker*, status with halted | `.ralph/.circuit_breaker_state` |
| `liveLog` | live.log, *.log in ralph dirs | `.ralph/live.log` |
| `specs` | specs/ directory with .md files | `.ralph/specs/` |
| `backlog` | backlog.md | `.ralph/backlog.md` |

### Output: ScanResult

```typescript
interface FoundFile {
  role: FileRole;
  path: string;        // relative to cwd
  format: 'markdown' | 'json' | 'shell' | 'text';
  metadata?: Record<string, unknown>;  // parsed JSON shape, section names, etc.
}

interface ScanResult {
  cwd: string;
  files: FoundFile[];
  conflicts: Conflict[];  // e.g. two task lists found
  flavor?: string;        // inferred from file patterns
}
```

### Conflict detection

When the scanner finds two files claiming the same role (e.g. `fix_plan.md`
AND `prd.json`), it reports a conflict. The profile generator picks the
primary based on flavor, or asks the user.

### Scan boundaries

- Skip: `node_modules/`, `.git/`, `dist/`, `build/`, `vendor/`
- Max depth: 4 levels (ralph files are never deeply nested)
- Respect `.gitignore` if present

---

## 2. Flavors Registry

### What it is

A static registry shipped with ralph-kit. Each entry describes one Ralph Loop
implementation: where to get it, what files it installs, and what the expected
layout looks like.

### Flavor definition

```typescript
interface Flavor {
  name: string;
  displayName: string;
  description: string;
  repo: string;                    // GitHub repo (owner/repo)
  branch?: string;                 // default: main
  filesToClone: CloneMapping[];    // what to pull from the repo
  expectedLayout: ExpectedFile[];  // what the project should look like after install
  profileTemplate: Partial<Profile>;
}

interface CloneMapping {
  /** Path in the source repo */
  from: string;
  /** Path in the user's project (relative to cwd) */
  to: string;
}

interface ExpectedFile {
  role: FileRole;
  path: string;
  required: boolean;
}
```

### Built-in flavors

#### frankbria

```
name: frankbria
repo: frankbria/ralph-claude-code
filesToClone:
  - from: scripts/         → scripts/ralph/
  - from: .ralphrc.example → .ralphrc
expectedLayout:
  - .ralph/PROMPT.md        (prompt, required)
  - .ralph/AGENT.md         (agent, required)
  - .ralph/fix_plan.md      (taskList, required)
  - .ralph/backlog.md       (backlog, optional)
  - .ralph/specs/           (specs, optional)
  - .ralph/status.json      (loopStatus, runtime)
  - .ralph/live.log         (liveLog, runtime)
  - .ralph/.circuit_breaker_state (breaker, runtime)
  - .ralphrc                (loopConfig, required)
```

#### snarktank

```
name: snarktank
repo: snarktank/ralph
filesToClone:
  - from: ralph.sh          → scripts/ralph/ralph.sh
  - from: CLAUDE.md         → scripts/ralph/CLAUDE.md
expectedLayout:
  - scripts/ralph/ralph.sh  (loopRunner, required)
  - scripts/ralph/CLAUDE.md (prompt, required)
  - scripts/ralph/prd.json  (taskList, required)
```

#### ralph-kit (native)

```
name: ralph-kit
repo: (built-in, no clone)
expectedLayout:
  - .ralph/PROMPT.md        (prompt, required)
  - .ralph/AGENT.md         (agent, required)
  - .ralph/fix_plan.md      (taskList, required)
  - .ralph/backlog.md       (backlog, optional)
  - .ralph/specs/           (specs, optional)
  - .ralph/status.json      (loopStatus, runtime)
  - .ralph/live.log         (liveLog, runtime)
```

The native flavor uses `ralph-kit run` as the loop runner (see section 4).

### Adding community flavors

Contributors add a new file to `src/flavors/<name>.ts` exporting a `Flavor`
object. A PR adds it to the registry. ralph-kit init picks it up automatically.

---

## 3. Interactive Init

### Current behavior

`ralph-kit init` scaffolds a bare `.ralph/` directory with template files.
No loop runner is installed. User has to figure out the rest.

### New behavior

```
$ ralph-kit init

  Which Ralph Loop flavor do you want?

  ❯ ralph-kit (native)    — built-in loop runner, .ralph/ layout
    frankbria              — .ralph/ + .ralphrc, scripts/ralph/
    snarktank              — scripts/ralph/ + prd.json
    custom                 — point to any GitHub repo

  Cloning frankbria/ralph-claude-code...
  ✓ scripts/ralph/ralph.sh
  ✓ .ralphrc

  Scaffolding control files...
  ✓ .ralph/PROMPT.md
  ✓ .ralph/AGENT.md
  ✓ .ralph/fix_plan.md
  ✓ .ralph/backlog.md
  ✓ .ralph/specs/

  Writing profile...
  ✓ .ralph-kit/profile.json  (flavor: frankbria)

  Done! Run ralph-kit board to see the dashboard.
  Run /ralph-kit:define in Claude Code to define your project.
```

### Init steps

1. **Select flavor** — interactive picker (or `--flavor frankbria` flag)
2. **Clone files** — sparse checkout or download from the flavor's repo
3. **Scaffold control files** — PROMPT.md, AGENT.md, fix_plan.md templates
   (skip if flavor's clone already provides them, e.g. snarktank's CLAUDE.md)
4. **Write profile** — `.ralph-kit/profile.json` with flavor field
5. **Run full scan** — verify everything landed correctly, report any issues
6. **Print next steps** — how to start the loop, how to define the project

### Custom flavor

```
$ ralph-kit init --flavor custom

  GitHub repo (owner/repo): myorg/my-ralph-loop
  Ralph root directory: .ralph
  Task file: fix_plan.md
  Task format: markdown

  Cloning myorg/my-ralph-loop...
```

---

## 4. ralph-kit Native Loop Runner (future)

A built-in `ralph-kit run` command that acts as the loop runner.
This eliminates the need to install a separate implementation entirely.

**Out of scope for this spec** — implement after flavors and scanner are solid.
Placeholder: the native flavor in the registry points to a TODO.

---

## Implementation Order

### Phase 1: Full-project scanner
- New `src/lib/scanner.ts` replacing the guts of `probe.ts`
- Walks project, discovers files by signature, builds ScanResult
- Conflict detection
- Profile generation from ScanResult
- Update `map` command to use scanner
- Update `loadProfile` to use scanner as fallback
- Tests with fixtures for each known layout

### Phase 2: Flavors registry
- `src/flavors/` directory with one file per flavor
- `src/lib/registry.ts` — loads and validates flavors
- Each flavor exports: metadata, clone mappings, expected layout, profile template
- Tests validating registry consistency

### Phase 3: Interactive init
- Rewrite `ralph-kit init` with flavor selection
- Clone/download logic (GitHub API or sparse git checkout)
- Scaffold control files (skip duplicates from clone)
- Run scanner to verify installation
- Print summary and next steps

### Phase 4: Native loop runner (future)
- `ralph-kit run` command
- Built-in loop logic (spawn Claude Code, manage iterations, circuit breaker)
- Fully integrated with the dashboard

---

## Migration

Existing users with `.ralph-kit/profile.json` are unaffected — the persisted
profile is always loaded first. The scanner only runs when no profile exists.

Existing `ralph-kit init` projects (bare `.ralph/` scaffold) continue to work.
The scanner detects them via heuristic and generates a profile as before.

---

## Open Questions

1. **Should the scanner run on every board load, or only on `map`?**
   Full scan on every SSE poll is too expensive. Proposal: scan once on
   `map` or first `board` launch, persist to profile. Re-scan on
   `ralph-kit map --force`.

2. **How to handle clone auth for private repos?**
   Could use `gh` CLI if available, fall back to HTTPS with token prompt.

3. **Should ralph-kit own `.ralphrc` generation?**
   frankbria's loop reads `.ralphrc` for ALLOWED_TOOLS etc. If ralph-kit
   generates it during init, it could set sane defaults (broad Bash
   permission for non-interactive use).

4. **Version pinning for cloned flavors?**
   Clone from `main` by default, but allow `--ref v1.2.3` for reproducibility.
   Store the ref in profile.json for upgrade detection.

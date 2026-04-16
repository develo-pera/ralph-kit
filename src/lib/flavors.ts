/**
 * Flavors registry — declares known Ralph Loop implementations.
 *
 * Each flavor describes:
 * - Where to get the loop runner (GitHub repo + files to clone)
 * - What the expected project layout looks like after installation
 * - A profile template for ralph-kit
 *
 * Community contributions: add a new entry to FLAVORS and submit a PR.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CloneMapping {
  /** Path in the source repo. */
  from: string;
  /** Destination path in the user's project (relative to cwd). */
  to: string;
}

export interface Flavor {
  name: string;
  displayName: string;
  description: string;
  /** GitHub repo (owner/repo). Null for built-in flavors. */
  repo: string | null;
  /** Branch to clone from (default: main). */
  branch: string;
  /** Files to pull from the repo during init. */
  filesToClone: CloneMapping[];
  /** Control files to scaffold (ralph-kit creates these). */
  scaffoldFiles: ScaffoldFile[];
  /** Ralph root directory where control files live. */
  root: string;
  /** Task file configuration. */
  taskFile: { file: string; format: 'markdown' | 'json' };
}

export interface ScaffoldFile {
  /** Destination path relative to cwd. */
  path: string;
  /** Only create if this file wasn't already provided by the clone step. */
  skipIfCloned: boolean;
}

// ---------------------------------------------------------------------------
// Built-in flavors
// ---------------------------------------------------------------------------

const RALPH_KIT_NATIVE: Flavor = {
  name: 'ralph-kit',
  displayName: 'ralph-kit (native)',
  description: 'Built-in loop runner, .ralph/ layout — no external dependencies',
  repo: null,
  branch: 'main',
  filesToClone: [],
  scaffoldFiles: [
    { path: '.ralph/PROMPT.md', skipIfCloned: false },
    { path: '.ralph/AGENT.md', skipIfCloned: false },
    { path: '.ralph/fix_plan.md', skipIfCloned: false },
    { path: '.ralph/backlog.md', skipIfCloned: false },
    { path: '.ralph/specs/.gitkeep', skipIfCloned: false },
  ],
  root: '.ralph',
  taskFile: { file: 'fix_plan.md', format: 'markdown' },
};

const FRANKBRIA: Flavor = {
  name: 'frankbria',
  displayName: 'frankbria/ralph-claude-code',
  description: '.ralph/ + .ralphrc, circuit breaker, live log — most popular implementation',
  repo: 'frankbria/ralph-claude-code',
  branch: 'main',
  filesToClone: [
    { from: 'ralph.sh', to: 'scripts/ralph/ralph.sh' },
    { from: '.ralphrc', to: '.ralphrc' },
  ],
  scaffoldFiles: [
    { path: '.ralph/PROMPT.md', skipIfCloned: true },
    { path: '.ralph/AGENT.md', skipIfCloned: true },
    { path: '.ralph/fix_plan.md', skipIfCloned: true },
    { path: '.ralph/backlog.md', skipIfCloned: true },
    { path: '.ralph/specs/.gitkeep', skipIfCloned: false },
  ],
  root: '.ralph',
  taskFile: { file: 'fix_plan.md', format: 'markdown' },
};

const SNARKTANK: Flavor = {
  name: 'snarktank',
  displayName: 'snarktank/ralph',
  description: 'scripts/ralph/ layout with prd.json — minimal, shell-based',
  repo: 'snarktank/ralph',
  branch: 'main',
  filesToClone: [
    { from: 'ralph.sh', to: 'scripts/ralph/ralph.sh' },
    { from: 'CLAUDE.md', to: 'scripts/ralph/CLAUDE.md' },
  ],
  scaffoldFiles: [
    { path: '.ralph/PROMPT.md', skipIfCloned: true },
    { path: '.ralph/AGENT.md', skipIfCloned: true },
    { path: '.ralph/fix_plan.md', skipIfCloned: true },
    { path: '.ralph/backlog.md', skipIfCloned: true },
    { path: '.ralph/specs/.gitkeep', skipIfCloned: false },
  ],
  root: '.ralph',
  taskFile: { file: 'fix_plan.md', format: 'markdown' },
};

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export const FLAVORS: readonly Flavor[] = [
  RALPH_KIT_NATIVE,
  FRANKBRIA,
  SNARKTANK,
];

export function getFlavor(name: string): Flavor | undefined {
  return FLAVORS.find((f) => f.name === name);
}

export function listFlavors(): readonly Flavor[] {
  return FLAVORS;
}

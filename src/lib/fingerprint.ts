import fs from 'node:fs';
import path from 'node:path';

import type { Profile } from './profile';
import { PROFILE_VERSION } from './profile';

/**
 * A known Ralph Loop implementation signature.
 * If all `required` files exist relative to `cwd`, this implementation is matched.
 */
export interface ImplementationSignature {
  name: string;
  /** Files that must exist (relative to cwd) for this signature to match. */
  required: string[];
  /** The ralph root directory (relative to cwd). */
  root: string;
  /** Task file format. */
  taskFile: { file: string; format: 'markdown' | 'json' };
  /** Build a partial Profile from the detected layout. */
  buildProfile: (cwd: string) => Profile;
}

/** Declaration file that implementation authors can ship. */
export interface Declaration {
  root: string;
  taskFile?: { file: string; format: 'markdown' | 'json' };
  prompt?: string;
  loop?: { file: string };
  breaker?: { file: string };
  liveLog?: { file: string };
}

const DECLARATION_FILE = '.ralph-kit.json';

// ---------------------------------------------------------------------------
// Known implementation registry
// ---------------------------------------------------------------------------

const KNOWN_IMPLEMENTATIONS: ImplementationSignature[] = [
  {
    name: 'frankbria',
    required: ['.ralphrc', '.ralph/fix_plan.md'],
    root: '.ralph',
    taskFile: { file: 'fix_plan.md', format: 'markdown' },
    buildProfile: () => ({
      version: PROFILE_VERSION,
      root: '.ralph',
      loop: {
        file: 'status.json',
        countField: 'loop_count',
        statusField: 'status',
        fallback: { file: 'progress.json', countField: 'loop_count', statusField: 'status' },
      },
      breaker: { file: '.circuit_breaker_state', reasonField: 'reason' },
      liveLog: { file: 'live.log' },
      fixPlan: {
        blockedSections: ['Blocked'],
        highSections: ['High Priority'],
        completedSections: ['Completed'],
      },
    }),
  },
  {
    name: 'snarktank',
    required: ['scripts/ralph/ralph.sh', 'scripts/ralph/prd.json'],
    root: 'scripts/ralph',
    taskFile: { file: 'prd.json', format: 'json' },
    buildProfile: () => ({
      version: PROFILE_VERSION,
      root: 'scripts/ralph',
      taskFile: { file: 'prd.json', format: 'json' },
    }),
  },
  {
    name: 'snarktank-dotralph',
    required: ['.ralph/PROMPT.md', 'scripts/ralph/ralph.sh'],
    root: '.ralph',
    taskFile: { file: 'fix_plan.md', format: 'markdown' },
    buildProfile: () => ({
      version: PROFILE_VERSION,
      root: '.ralph',
      fixPlan: {
        highSections: ['High Priority'],
        completedSections: ['Completed'],
      },
    }),
  },
  {
    name: 'ghuntley-style',
    required: ['ralph/PROMPT.md', 'ralph/fix_plan.md'],
    root: 'ralph',
    taskFile: { file: 'fix_plan.md', format: 'markdown' },
    buildProfile: () => ({
      version: PROFILE_VERSION,
      root: 'ralph',
    }),
  },
];

// ---------------------------------------------------------------------------
// Detection functions
// ---------------------------------------------------------------------------

export interface DetectionResult {
  tier: 'declaration' | 'fingerprint' | 'heuristic';
  implementation?: string;
  profile: Profile;
}

/**
 * Read a `.ralph-kit.json` declaration file if present.
 */
export function readDeclaration(cwd: string): Declaration | null {
  const p = path.join(cwd, DECLARATION_FILE);
  if (!fs.existsSync(p)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(p, 'utf8')) as Declaration;
    if (raw && typeof raw.root === 'string') return raw;
  } catch {
    /* invalid JSON — ignore */
  }
  return null;
}

/**
 * Build a Profile from a declaration file.
 */
export function profileFromDeclaration(decl: Declaration): Profile {
  const profile: Profile = {
    version: PROFILE_VERSION,
    root: decl.root,
  };

  if (decl.taskFile) {
    profile.taskFile = decl.taskFile;
  }

  if (decl.loop) {
    profile.loop = { file: decl.loop.file };
  }

  if (decl.breaker) {
    profile.breaker = { file: decl.breaker.file };
  }

  if (decl.liveLog) {
    profile.liveLog = { file: decl.liveLog.file };
  }

  return profile;
}

/**
 * Try to match the project against known implementation fingerprints.
 * Returns the first match or null.
 */
export function fingerprint(cwd: string): ImplementationSignature | null {
  for (const sig of KNOWN_IMPLEMENTATIONS) {
    const allExist = sig.required.every((rel) => fs.existsSync(path.join(cwd, rel)));
    if (allExist) return sig;
  }
  return null;
}

/**
 * Three-tier detection: declaration → fingerprint → null (caller falls back to heuristic).
 */
export function detect(cwd: string): DetectionResult | null {
  // Tier 1: explicit declaration
  const decl = readDeclaration(cwd);
  if (decl) {
    return {
      tier: 'declaration',
      profile: profileFromDeclaration(decl),
    };
  }

  // Tier 2: known implementation fingerprint
  const sig = fingerprint(cwd);
  if (sig) {
    return {
      tier: 'fingerprint',
      implementation: sig.name,
      profile: sig.buildProfile(cwd),
    };
  }

  // Tier 3: caller uses heuristic probe
  return null;
}

/**
 * Return the root directory discovered by fingerprinting (if any).
 * Used by probe to find non-standard root locations.
 */
export function fingerprintRoot(cwd: string): string | null {
  const sig = fingerprint(cwd);
  return sig?.root ?? null;
}

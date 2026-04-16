import fs from 'node:fs';
import path from 'node:path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FileRole =
  | 'prompt'
  | 'agent'
  | 'taskList'
  | 'loopRunner'
  | 'loopConfig'
  | 'loopStatus'
  | 'breaker'
  | 'liveLog'
  | 'specs'
  | 'backlog'
  | 'runnerPrompt';

export type FileFormat = 'markdown' | 'json' | 'shell' | 'text';

export interface FoundFile {
  role: FileRole;
  /** Relative to cwd (forward slashes). */
  path: string;
  format: FileFormat;
  /** Extra data pulled from file contents (JSON shape, section names, etc.). */
  metadata?: Record<string, unknown>;
}

export interface Conflict {
  role: FileRole;
  files: string[];
  message: string;
}

export interface ScanResult {
  cwd: string;
  files: FoundFile[];
  conflicts: Conflict[];
  /** Inferred flavor name (if file patterns match a known implementation). */
  flavor?: string;
}

// ---------------------------------------------------------------------------
// Signature rules — how we recognise files by name/content
// ---------------------------------------------------------------------------

interface SignatureRule {
  role: FileRole;
  /** Match against the file name (basename). */
  namePattern: RegExp;
  /** Optional: also require a parent directory name to match. */
  parentPattern?: RegExp;
  format: FileFormat;
  /** If set, only match when the file is inside a directory matching this path segment. */
  insideDir?: RegExp;
  /** Extract metadata from file contents if matched. */
  extractMeta?: (contents: string) => Record<string, unknown> | undefined;
}

function extractJsonShape(contents: string): Record<string, unknown> | undefined {
  try {
    const obj = JSON.parse(contents);
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return undefined;
    const shape: Record<string, string> = {};
    const values: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      shape[k] = v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v;
      if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' || v === null) {
        values[k] = v;
      }
    }
    return { jsonShape: shape, jsonValues: values };
  } catch {
    return undefined;
  }
}

function extractMarkdownSections(contents: string): Record<string, unknown> | undefined {
  const sections: string[] = [];
  for (const line of contents.split('\n')) {
    const m = line.match(/^##\s+(.+?)\s*$/);
    if (m && !/^Status:/i.test(m[1])) sections.push(m[1]);
  }
  if (sections.length === 0) return undefined;
  return { sections };
}

const SIGNATURE_RULES: SignatureRule[] = [
  // Prompt files
  { role: 'prompt', namePattern: /^PROMPT\.md$/i, format: 'markdown' },
  { role: 'prompt', namePattern: /^CLAUDE\.md$/i, parentPattern: /ralph/i, format: 'markdown' },

  // Agent config
  { role: 'agent', namePattern: /^AGENT\.md$/i, format: 'markdown' },

  // Task lists
  { role: 'taskList', namePattern: /^fix_plan\.md$/i, format: 'markdown', extractMeta: extractMarkdownSections },
  { role: 'taskList', namePattern: /^prd\.json$/i, format: 'json', extractMeta: extractJsonShape },
  { role: 'taskList', namePattern: /^tasks\.json$/i, format: 'json', extractMeta: extractJsonShape },

  // Loop runner
  { role: 'loopRunner', namePattern: /^ralph\.sh$/i, format: 'shell' },
  { role: 'loopRunner', namePattern: /^loop\.sh$/i, format: 'shell' },

  // Loop config
  { role: 'loopConfig', namePattern: /^\.ralphrc$/i, format: 'text' },
  { role: 'loopConfig', namePattern: /^ralph\.config\.json$/i, format: 'json', extractMeta: extractJsonShape },

  // Loop status
  { role: 'loopStatus', namePattern: /^status\.json$/i, insideDir: /ralph/i, format: 'json', extractMeta: extractJsonShape },
  { role: 'loopStatus', namePattern: /^progress\.json$/i, insideDir: /ralph/i, format: 'json', extractMeta: extractJsonShape },

  // Circuit breaker
  { role: 'breaker', namePattern: /circuit.?breaker.?state/i, format: 'text' },
  { role: 'breaker', namePattern: /circuit.?breaker.?history/i, format: 'json' },

  // Live log
  { role: 'liveLog', namePattern: /^live\.log$/i, insideDir: /ralph/i, format: 'text' },

  // Backlog
  { role: 'backlog', namePattern: /^backlog\.md$/i, insideDir: /ralph/i, format: 'markdown' },
];

// ---------------------------------------------------------------------------
// Skip list — directories we never descend into
// ---------------------------------------------------------------------------

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'vendor', '.next',
  '__pycache__', '.venv', 'venv', '.tox', 'coverage',
]);

const MAX_DEPTH = 4;

// ---------------------------------------------------------------------------
// Scanner
// ---------------------------------------------------------------------------

function classifyFormat(name: string): FileFormat {
  if (name.endsWith('.md')) return 'markdown';
  if (name.endsWith('.json')) return 'json';
  if (name.endsWith('.sh')) return 'shell';
  return 'text';
}

function readSafe(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

function relPath(cwd: string, full: string): string {
  return path.relative(cwd, full).split(path.sep).join('/');
}

export function scan(cwd: string): ScanResult {
  const files: FoundFile[] = [];
  const specsDirs: string[] = [];

  function walk(dir: string, depth: number): void {
    if (depth > MAX_DEPTH) return;

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const full = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;

        // Detect specs/ directories inside ralph-related dirs
        if (entry.name === 'specs') {
          const parentRel = relPath(cwd, dir);
          if (/ralph/i.test(parentRel) || parentRel === '.ralph' || parentRel === 'ralph') {
            specsDirs.push(relPath(cwd, full));
          }
        }

        walk(full, depth + 1);
        continue;
      }

      if (!entry.isFile()) continue;

      const name = entry.name;
      const parentDir = path.basename(dir);
      const relDir = relPath(cwd, dir);

      for (const rule of SIGNATURE_RULES) {
        if (!rule.namePattern.test(name)) continue;
        if (rule.parentPattern && !rule.parentPattern.test(parentDir)) continue;
        if (rule.insideDir && !rule.insideDir.test(relDir)) continue;

        const found: FoundFile = {
          role: rule.role,
          path: relPath(cwd, full),
          format: rule.format || classifyFormat(name),
        };

        if (rule.extractMeta) {
          const contents = readSafe(full);
          if (contents) {
            found.metadata = rule.extractMeta(contents);
          }
        }

        files.push(found);
        break; // first matching rule wins for this file
      }
    }
  }

  walk(cwd, 0);

  // Add specs directories as found files
  for (const specsPath of specsDirs) {
    files.push({ role: 'specs', path: specsPath, format: 'markdown' });
  }

  // Reclassify: a prompt file (e.g. CLAUDE.md) that lives in the same directory
  // as a loop runner (ralph.sh) is part of the runner, not a competing project prompt.
  const runnerDirs = new Set(
    files.filter((f) => f.role === 'loopRunner').map((f) => f.path.replace(/\/[^/]+$/, '')),
  );
  for (const f of files) {
    if (f.role === 'prompt' && runnerDirs.has(f.path.replace(/\/[^/]+$/, ''))) {
      f.role = 'runnerPrompt';
    }
  }

  // Detect conflicts — multiple files claiming the same role
  const conflicts = detectConflicts(files);

  // Infer flavor from file patterns
  const flavor = inferFlavor(files);

  return { cwd, files, conflicts, flavor };
}

// ---------------------------------------------------------------------------
// Conflict detection
// ---------------------------------------------------------------------------

/** Roles where having multiple files is a conflict (not expected). */
const UNIQUE_ROLES: FileRole[] = ['prompt', 'agent', 'loopRunner', 'loopConfig'];

function detectConflicts(files: FoundFile[]): Conflict[] {
  const conflicts: Conflict[] = [];

  // Task list conflicts — if we have both fix_plan.md and prd.json
  const taskFiles = files.filter((f) => f.role === 'taskList');
  if (taskFiles.length > 1) {
    conflicts.push({
      role: 'taskList',
      files: taskFiles.map((f) => f.path),
      message: `Multiple task files found: ${taskFiles.map((f) => f.path).join(', ')}. Profile will use the first one; set taskFile in .ralph-kit.json to override.`,
    });
  }

  for (const role of UNIQUE_ROLES) {
    const matched = files.filter((f) => f.role === role);
    if (matched.length > 1) {
      conflicts.push({
        role,
        files: matched.map((f) => f.path),
        message: `Multiple ${role} files: ${matched.map((f) => f.path).join(', ')}`,
      });
    }
  }

  return conflicts;
}

// ---------------------------------------------------------------------------
// Flavor inference
// ---------------------------------------------------------------------------

interface FlavorSignature {
  name: string;
  /** All of these paths (as regex against found file paths) must be present. */
  required: Array<{ role: FileRole; pathPattern: RegExp }>;
}

const FLAVOR_SIGNATURES: FlavorSignature[] = [
  {
    name: 'frankbria',
    required: [
      { role: 'loopConfig', pathPattern: /^\.ralphrc$/ },
      { role: 'taskList', pathPattern: /^\.ralph\/fix_plan\.md$/ },
    ],
  },
  {
    name: 'snarktank',
    required: [
      { role: 'loopRunner', pathPattern: /scripts\/ralph\/ralph\.sh$/ },
      { role: 'taskList', pathPattern: /prd\.json$/ },
    ],
  },
  {
    name: 'snarktank-hybrid',
    required: [
      { role: 'loopRunner', pathPattern: /scripts\/ralph\/ralph\.sh$/ },
      { role: 'taskList', pathPattern: /fix_plan\.md$/ },
    ],
  },
];

function inferFlavor(files: FoundFile[]): string | undefined {
  for (const sig of FLAVOR_SIGNATURES) {
    const allMatch = sig.required.every((req) =>
      files.some((f) => f.role === req.role && req.pathPattern.test(f.path)),
    );
    if (allMatch) return sig.name;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Profile generation from scan
// ---------------------------------------------------------------------------

import type { Profile } from './profile';
import { PROFILE_VERSION } from './profile';

/**
 * Pick the best file for a role. Prefers files inside .ralph/ or ralph/ dirs.
 */
/** File name priority for roles where multiple candidates exist. */
const NAME_PRIORITY: Partial<Record<FileRole, string[]>> = {
  loopStatus: ['status.json', 'state.json', 'progress.json'],
  taskList: ['fix_plan.md', 'prd.json', 'tasks.json'],
};

function pickFile(files: FoundFile[], role: FileRole): FoundFile | undefined {
  const candidates = files.filter((f) => f.role === role);
  if (candidates.length === 0) return undefined;
  if (candidates.length === 1) return candidates[0];

  const priority = NAME_PRIORITY[role];
  if (priority) {
    for (const preferred of priority) {
      const match = candidates.find((f) => f.path.endsWith(preferred));
      if (match) return match;
    }
  }

  // Prefer files in ralph-named directories
  return (
    candidates.find((f) => /^\.ralph\//.test(f.path)) ??
    candidates.find((f) => /ralph/i.test(f.path)) ??
    candidates[0]
  );
}

/**
 * Determine the ralph root directory from discovered files.
 * Picks the directory that contains the most ralph-related files.
 */
function inferRoot(files: FoundFile[]): string {
  const dirCounts = new Map<string, number>();
  for (const f of files) {
    const dir = f.path.includes('/') ? f.path.split('/').slice(0, -1).join('/') : '.';
    dirCounts.set(dir, (dirCounts.get(dir) ?? 0) + 1);
  }
  // Prefer .ralph or ralph directories
  const ranked = [...dirCounts.entries()].sort((a, b) => {
    const aRalph = /^\.?ralph$/i.test(a[0]) ? 1 : 0;
    const bRalph = /^\.?ralph$/i.test(b[0]) ? 1 : 0;
    if (aRalph !== bRalph) return bRalph - aRalph;
    return b[1] - a[1];
  });
  return ranked[0]?.[0] ?? '.ralph';
}

const HALTED_RE = /^(halted|stopped|error|failed|exited)$/i;

export function profileFromScan(result: ScanResult): Profile {
  const root = inferRoot(result.files);

  const profile: Profile = {
    version: PROFILE_VERSION,
    root,
  };

  if (result.flavor) profile.implementation = result.flavor;

  // Task file
  const taskFile = pickFile(result.files, 'taskList');
  if (taskFile && (taskFile.format === 'json' || taskFile.path !== path.join(root, 'fix_plan.md').split(path.sep).join('/'))) {
    const fmt = taskFile.format === 'json' ? 'json' as const : 'markdown' as const;
    profile.taskFile = { file: taskFile.path, format: fmt };
  }

  // Loop status
  const statusFile = pickFile(result.files, 'loopStatus');
  if (statusFile) {
    const shape = statusFile.metadata?.jsonShape as Record<string, string> | undefined;
    const loopCountFields = ['loop_count', 'loopCount', 'count', 'iteration'];
    const loopStatusFields = ['status', 'state', 'phase'];

    const countField = loopCountFields.find((k) => shape?.[k] === 'number');
    const statusField = loopStatusFields.find((k) => shape?.[k] === 'string');

    const relFile = path.relative(root, statusFile.path).split(path.sep).join('/');
    profile.loop = {
      file: relFile.startsWith('..') ? statusFile.path : relFile,
      ...(countField ? { countField } : {}),
      ...(statusField ? { statusField } : {}),
    };

    // Check for fallback (progress.json)
    const allStatus = result.files.filter((f) => f.role === 'loopStatus');
    const fallback = allStatus.find((f) => f.path !== statusFile.path);
    if (fallback) {
      const fbShape = fallback.metadata?.jsonShape as Record<string, string> | undefined;
      const fbRelFile = path.relative(root, fallback.path).split(path.sep).join('/');
      profile.loop.fallback = {
        file: fbRelFile.startsWith('..') ? fallback.path : fbRelFile,
        ...(loopCountFields.find((k) => fbShape?.[k] === 'number')
          ? { countField: loopCountFields.find((k) => fbShape?.[k] === 'number') }
          : {}),
        ...(loopStatusFields.find((k) => fbShape?.[k] === 'string')
          ? { statusField: loopStatusFields.find((k) => fbShape?.[k] === 'string') }
          : {}),
      };
    }
  }

  // Breaker
  const breakerFile = pickFile(result.files, 'breaker');
  if (breakerFile) {
    const relFile = path.relative(root, breakerFile.path).split(path.sep).join('/');
    profile.breaker = {
      file: relFile.startsWith('..') ? breakerFile.path : relFile,
      reasonField: 'reason',
    };
  } else if (statusFile) {
    // Check if status.json has halted pattern (fromStatus breaker)
    const shape = statusFile.metadata?.jsonShape as Record<string, string> | undefined;
    const values = statusFile.metadata?.jsonValues as Record<string, unknown> | undefined;
    const statusVal = values?.status;
    const hasReason = shape?.exit_reason === 'string' || shape?.reason === 'string' || shape?.error === 'string';
    if (hasReason && typeof statusVal === 'string' && HALTED_RE.test(statusVal)) {
      const relFile = path.relative(root, statusFile.path).split(path.sep).join('/');
      const reasonField = shape?.exit_reason === 'string' ? 'exit_reason'
        : shape?.reason === 'string' ? 'reason'
        : 'error';
      profile.breaker = {
        file: relFile.startsWith('..') ? statusFile.path : relFile,
        fromStatus: true,
        statusField: 'status',
        haltedPattern: 'halted|stopped|error|failed|exited',
        statusReasonField: reasonField,
      };
    }
  }

  // Live log
  const logFile = pickFile(result.files, 'liveLog');
  if (logFile) {
    const relFile = path.relative(root, logFile.path).split(path.sep).join('/');
    profile.liveLog = {
      file: relFile.startsWith('..') ? logFile.path : relFile,
    };
  }

  // Fix plan sections (from markdown task list metadata)
  if (taskFile?.format === 'markdown' && taskFile.metadata?.sections) {
    const sections = taskFile.metadata.sections as string[];
    const fp: Profile['fixPlan'] = {};
    for (const name of sections) {
      if (/blocked/i.test(name)) (fp.blockedSections ??= []).push(name);
      else if (/complete|done|shipped/i.test(name)) (fp.completedSections ??= []).push(name);
      else if (/high|now|next|doing/i.test(name)) (fp.highSections ??= []).push(name);
    }
    if (fp.blockedSections || fp.highSections || fp.completedSections) {
      profile.fixPlan = fp;
    }
  }

  return profile;
}

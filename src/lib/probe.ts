import fs from 'node:fs';
import path from 'node:path';

export type JsonShape = Record<string, 'string' | 'number' | 'boolean' | 'object' | 'array' | 'null'>;

export interface ProbedFile {
  name: string;
  isDir: boolean;
  size: number;
  type: 'json' | 'markdown' | 'log' | 'text' | 'binary' | 'dir';
  jsonShape?: JsonShape;
  jsonValues?: Record<string, unknown>;
}

export interface ProbeResult {
  cwd: string;
  rootCandidates: string[];
  rootDir: string | null;
  rootName: string | null;
  files: ProbedFile[];
  hasMarkdownTrio: boolean;
  fixPlanSections: string[];
}

const ROOT_DIR_RE = /^\.?ralph(-?loop)?$/i;
const MARKDOWN_MEMBERS = ['PROMPT.md', 'AGENT.md', 'fix_plan.md', 'backlog.md'];

function classifyType(fileName: string, contents: string | null): ProbedFile['type'] {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.json')) return 'json';
  if (lower.endsWith('.md')) return 'markdown';
  if (lower.endsWith('.log') || lower === 'live.log') return 'log';
  if (contents === null) return 'binary';
  // Treat any text file whose body is a JSON object as JSON — catches extensionless
  // state files like `.circuit_breaker_state` that Ralph implementations use.
  const trimmed = contents.trimStart();
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(contents);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return 'json';
    } catch {
      /* not json — fall through */
    }
  }
  return 'text';
}

function shapeOf(value: unknown): JsonShape[string] {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value as JsonShape[string];
}

function summarizeJson(raw: string): { shape?: JsonShape; values?: Record<string, unknown> } {
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const obj = parsed as Record<string, unknown>;
    const shape: JsonShape = {};
    const values: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      shape[k] = shapeOf(v);
      if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' || v === null) {
        values[k] = v;
      }
    }
    return { shape, values };
  } catch {
    return {};
  }
}

function extractFixPlanSections(dir: string): string[] {
  const fp = path.join(dir, 'fix_plan.md');
  if (!fs.existsSync(fp)) return [];
  const text = fs.readFileSync(fp, 'utf8');
  const sections: string[] = [];
  for (const line of text.split('\n')) {
    const m = line.match(/^##\s+(.+?)\s*$/);
    if (m) {
      const name = m[1];
      if (!/^Status:/i.test(name)) sections.push(name);
    }
  }
  return sections;
}

function readContents(p: string): string | null {
  try {
    return fs.readFileSync(p, 'utf8');
  } catch {
    return null;
  }
}

function looksLikeRalphRoot(dir: string): boolean {
  try {
    const entries = fs.readdirSync(dir);
    return MARKDOWN_MEMBERS.some((m) => entries.includes(m)) || entries.includes('specs');
  } catch {
    return false;
  }
}

/** Find directories in `cwd` whose name looks like a Ralph root. */
export function findRootCandidates(cwd: string): string[] {
  let entries: string[] = [];
  try {
    entries = fs.readdirSync(cwd);
  } catch {
    return [];
  }
  const candidates: string[] = [];
  for (const name of entries) {
    if (!ROOT_DIR_RE.test(name)) continue;
    const full = path.join(cwd, name);
    try {
      if (!fs.statSync(full).isDirectory()) continue;
    } catch {
      continue;
    }
    if (looksLikeRalphRoot(full)) candidates.push(name);
  }
  // prefer .ralph > ralph > others; stable secondary by name
  candidates.sort((a, b) => {
    const rank = (n: string) =>
      n === '.ralph' ? 0 : n === 'ralph' ? 1 : n.startsWith('.') ? 2 : 3;
    return rank(a) - rank(b) || a.localeCompare(b);
  });
  return candidates;
}

export function probe(cwd: string): ProbeResult {
  const rootCandidates = findRootCandidates(cwd);
  const rootName = rootCandidates[0] ?? null;
  const rootDir = rootName ? path.join(cwd, rootName) : null;

  const files: ProbedFile[] = [];
  let hasMarkdownTrio = false;
  let fixPlanSections: string[] = [];

  if (rootDir && fs.existsSync(rootDir)) {
    const entries = fs.readdirSync(rootDir);
    for (const name of entries) {
      const full = path.join(rootDir, name);
      let stat: fs.Stats;
      try {
        stat = fs.statSync(full);
      } catch {
        continue;
      }
      if (stat.isDirectory()) {
        files.push({ name, isDir: true, size: 0, type: 'dir' });
        continue;
      }
      const contents = readContents(full);
      const type = classifyType(name, contents);
      const file: ProbedFile = {
        name,
        isDir: false,
        size: stat.size,
        type,
      };
      if (type === 'json' && contents) {
        const { shape, values } = summarizeJson(contents);
        if (shape) file.jsonShape = shape;
        if (values) file.jsonValues = values;
      }
      files.push(file);
    }

    hasMarkdownTrio = MARKDOWN_MEMBERS.every((m) => entries.includes(m));
    fixPlanSections = extractFixPlanSections(rootDir);
  }

  return {
    cwd,
    rootCandidates,
    rootDir,
    rootName,
    files,
    hasMarkdownTrio,
    fixPlanSections,
  };
}

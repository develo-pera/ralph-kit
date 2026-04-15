export const DEFAULT_GROUP = 'Ideas';

export interface BacklogTask {
  indent: string;
  done: boolean;
  text: string;
}

export interface BacklogDoc {
  title: string | null;
  groups: Record<string, BacklogTask[]>;
  groupOrder: string[];
  preamble: string[];
}

export interface FlatTask extends BacklogTask {
  group: string;
}

export function parse(markdown: string | null | undefined): BacklogDoc {
  const lines = (markdown || '').split('\n');
  const doc: BacklogDoc = {
    title: null,
    groups: {},
    groupOrder: [],
    preamble: [],
  };

  let current: string | null = null;
  let sawTitle = false;

  for (const raw of lines) {
    const trimmed = raw.trim();

    if (!sawTitle && /^#\s+/.test(trimmed)) {
      doc.title = trimmed.replace(/^#\s+/, '');
      sawTitle = true;
      continue;
    }

    const h2 = trimmed.match(/^##\s+(.+?)\s*$/);
    if (h2) {
      current = h2[1];
      if (!doc.groups[current]) {
        doc.groups[current] = [];
        doc.groupOrder.push(current);
      }
      continue;
    }

    const task = parseTaskLine(raw);
    if (task) {
      if (!current) {
        current = DEFAULT_GROUP;
        if (!doc.groups[current]) {
          doc.groups[current] = [];
          doc.groupOrder.push(current);
        }
      }
      doc.groups[current].push(task);
    } else if (!sawTitle && trimmed !== '') {
      doc.preamble.push(raw);
    }
  }

  return doc;
}

function parseTaskLine(line: string): BacklogTask | null {
  const m = line.match(/^(\s*)- \[( |x|X)\]\s+(.*\S)\s*$/);
  if (!m) return null;
  return { indent: m[1], done: m[2].toLowerCase() === 'x', text: m[3] };
}

export function serialize(doc: BacklogDoc): string {
  const out: string[] = [];
  if (doc.title) out.push(`# ${doc.title}`, '');
  for (const name of doc.groupOrder) {
    out.push(`## ${name}`);
    for (const t of doc.groups[name] || []) {
      out.push(`${t.indent || ''}- [${t.done ? 'x' : ' '}] ${t.text}`);
    }
    out.push('');
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').replace(/\s+$/, '') + '\n';
}

export function ensureGroup(doc: BacklogDoc, group: string): BacklogTask[] {
  if (!doc.groups[group]) {
    doc.groups[group] = [];
    doc.groupOrder.push(group);
  }
  return doc.groups[group];
}

export function addTask(doc: BacklogDoc, text: string, group: string = DEFAULT_GROUP): BacklogDoc {
  ensureGroup(doc, group).push({ indent: '', done: false, text });
  return doc;
}

export function toggleTask(doc: BacklogDoc, text: string): boolean {
  for (const name of doc.groupOrder) {
    for (const t of doc.groups[name]) {
      if (t.text === text) {
        t.done = !t.done;
        return true;
      }
    }
  }
  return false;
}

export function removeTask(doc: BacklogDoc, text: string): { task: BacklogTask; group: string } | null {
  for (const name of doc.groupOrder) {
    const idx = doc.groups[name].findIndex((t) => t.text === text);
    if (idx >= 0) {
      const [task] = doc.groups[name].splice(idx, 1);
      return { task, group: name };
    }
  }
  return null;
}

export function allTasks(doc: BacklogDoc): FlatTask[] {
  const out: FlatTask[] = [];
  for (const name of doc.groupOrder) {
    for (const t of doc.groups[name]) out.push({ ...t, group: name });
  }
  return out;
}

export function defaultContent(): string {
  return `# Backlog

Your capture inbox. Ralph does not read this file — use \`/ralph-kit:promote\` or drag to **To Do** when an item is ready for Ralph to work on.

## Features

## Ideas
- [ ] (delete this placeholder once you've added real items)

## Bugs
`;
}

export const PRIORITY_ORDER = ['High Priority', 'Medium Priority', 'Low Priority', 'Completed'] as const;

export interface Task {
  indent: string;
  done: boolean;
  text: string;
}

export interface FixPlanDoc {
  title: string | null;
  statusLine: string | null;
  sections: Record<string, Task[]>;
  sectionOrder: string[];
  preamble: string[];
  notes: string[];
}

export interface BoardCard {
  text: string;
  priority: string;
  done: boolean;
}

export interface BoardView {
  upNext: BoardCard[];
  inProgress: BoardCard[];
  backlog: BoardCard[];
  done: BoardCard[];
  blocked: BoardCard[];
}

export function parse(markdown: string): FixPlanDoc {
  const lines = markdown.split('\n');
  const doc: FixPlanDoc = {
    title: null,
    statusLine: null,
    sections: {},
    sectionOrder: [],
    preamble: [],
    notes: [],
  };

  let current: string | null = null;
  let inNotes = false;
  let sawTitle = false;

  for (const raw of lines) {
    const line = raw;
    const trimmed = line.trim();

    if (!sawTitle && /^#\s+/.test(trimmed)) {
      doc.title = trimmed.replace(/^#\s+/, '');
      sawTitle = true;
      continue;
    }

    if (/^##\s+Status:/i.test(trimmed)) {
      doc.statusLine = trimmed.replace(/^##\s+/, '');
      continue;
    }

    const h2 = trimmed.match(/^##\s+(.+?)\s*$/);
    if (h2) {
      const name = h2[1];
      if (/^notes$/i.test(name)) {
        inNotes = true;
        current = null;
        continue;
      }
      inNotes = false;
      current = name;
      if (!doc.sections[current]) {
        doc.sections[current] = [];
        doc.sectionOrder.push(current);
      }
      continue;
    }

    if (inNotes) {
      doc.notes.push(line);
      continue;
    }

    if (current) {
      const task = parseTaskLine(line);
      if (task) {
        doc.sections[current].push(task);
      }
    } else if (!sawTitle || trimmed === '') {
      doc.preamble.push(line);
    }
  }

  trimTrailingEmpty(doc.notes);
  return doc;
}

function parseTaskLine(line: string): Task | null {
  const m = line.match(/^(\s*)- \[( |x|X)\]\s+(.*\S)\s*$/);
  if (!m) return null;
  return {
    indent: m[1],
    done: m[2].toLowerCase() === 'x',
    text: m[3],
  };
}

export function serialize(doc: FixPlanDoc): string {
  const out: string[] = [];
  if (doc.title) out.push(`# ${doc.title}`, '');
  if (doc.statusLine) out.push(`## ${doc.statusLine}`, '');

  for (const name of doc.sectionOrder) {
    const tasks = doc.sections[name] || [];
    out.push(`## ${name}`);
    for (const t of tasks) {
      out.push(`${t.indent || ''}- [${t.done ? 'x' : ' '}] ${t.text}`);
    }
    out.push('');
  }

  if (doc.notes.length > 0) {
    out.push('## Notes');
    for (const n of doc.notes) out.push(n);
  }

  return out.join('\n').replace(/\n{3,}/g, '\n\n').replace(/\s+$/, '') + '\n';
}

export function ensureSection(doc: FixPlanDoc, name: string): Task[] {
  if (!doc.sections[name]) {
    doc.sections[name] = [];
    doc.sectionOrder.push(name);
  }
  return doc.sections[name];
}

export function addTask(doc: FixPlanDoc, priority: string, text: string): FixPlanDoc {
  const list = ensureSection(doc, priority);
  list.push({ indent: '', done: false, text });
  return doc;
}

export function toggleTask(doc: FixPlanDoc, text: string): boolean {
  for (const name of doc.sectionOrder) {
    for (const t of doc.sections[name]) {
      if (t.text === text) {
        t.done = !t.done;
        return true;
      }
    }
  }
  return false;
}

export function moveTask(doc: FixPlanDoc, text: string, toPriority: string): boolean {
  for (const name of doc.sectionOrder) {
    const idx = doc.sections[name].findIndex((t) => t.text === text);
    if (idx >= 0) {
      const [task] = doc.sections[name].splice(idx, 1);
      ensureSection(doc, toPriority).push(task);
      return true;
    }
  }
  return false;
}

export function toBoard(doc: FixPlanDoc): BoardView {
  const cols: BoardView = { upNext: [], inProgress: [], backlog: [], done: [], blocked: [] };
  const isBlocked = !!doc.statusLine && /blocked/i.test(doc.statusLine);

  for (const name of doc.sectionOrder) {
    for (const t of doc.sections[name]) {
      const card: BoardCard = { text: t.text, priority: name, done: t.done };
      if (t.done || /completed/i.test(name)) {
        cols.done.push(card);
      } else if (/high/i.test(name)) {
        cols.upNext.push(card);
      } else {
        cols.backlog.push(card);
      }
    }
  }

  if (cols.upNext.length > 0) {
    cols.inProgress.push(cols.upNext.shift()!);
  }

  if (isBlocked && doc.statusLine) {
    cols.blocked.push({ text: doc.statusLine, priority: 'Status', done: false });
  }

  return cols;
}

function trimTrailingEmpty(arr: string[]): void {
  while (arr.length > 0 && arr[arr.length - 1].trim() === '') arr.pop();
}

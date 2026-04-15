'use strict';

const PRIORITY_ORDER = ['High Priority', 'Medium Priority', 'Low Priority', 'Completed'];

function parse(markdown) {
  const lines = markdown.split('\n');
  const doc = {
    title: null,
    statusLine: null,
    sections: {},
    sectionOrder: [],
    preamble: [],
    notes: [],
  };

  let current = null;
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

function parseTaskLine(line) {
  const m = line.match(/^(\s*)- \[( |x|X)\]\s+(.*\S)\s*$/);
  if (!m) return null;
  return {
    indent: m[1],
    done: m[2].toLowerCase() === 'x',
    text: m[3],
  };
}

function serialize(doc) {
  const out = [];
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

function ensureSection(doc, name) {
  if (!doc.sections[name]) {
    doc.sections[name] = [];
    doc.sectionOrder.push(name);
  }
  return doc.sections[name];
}

function addTask(doc, priority, text) {
  const list = ensureSection(doc, priority);
  list.push({ indent: '', done: false, text });
  return doc;
}

function toggleTask(doc, text) {
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

function moveTask(doc, text, toPriority) {
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

function toBoard(doc) {
  const cols = { upNext: [], inProgress: [], backlog: [], done: [], blocked: [] };
  const isBlocked = !!doc.statusLine && /blocked/i.test(doc.statusLine);

  for (const name of doc.sectionOrder) {
    for (const t of doc.sections[name]) {
      const card = { text: t.text, priority: name, done: t.done };
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
    cols.inProgress.push(cols.upNext.shift());
  }

  if (isBlocked) {
    cols.blocked.push({ text: doc.statusLine, priority: 'Status', done: false });
  }

  return cols;
}

function trimTrailingEmpty(arr) {
  while (arr.length > 0 && arr[arr.length - 1].trim() === '') arr.pop();
}

module.exports = {
  PRIORITY_ORDER,
  parse,
  serialize,
  addTask,
  toggleTask,
  moveTask,
  toBoard,
  ensureSection,
};

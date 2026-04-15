'use strict';

const DEFAULT_GROUP = 'Ideas';

function parse(markdown) {
  const lines = (markdown || '').split('\n');
  const doc = {
    title: null,
    groups: {},
    groupOrder: [],
    preamble: [],
  };

  let current = null;
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

function parseTaskLine(line) {
  const m = line.match(/^(\s*)- \[( |x|X)\]\s+(.*\S)\s*$/);
  if (!m) return null;
  return { indent: m[1], done: m[2].toLowerCase() === 'x', text: m[3] };
}

function serialize(doc) {
  const out = [];
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

function ensureGroup(doc, group) {
  if (!doc.groups[group]) {
    doc.groups[group] = [];
    doc.groupOrder.push(group);
  }
  return doc.groups[group];
}

function addTask(doc, text, group = DEFAULT_GROUP) {
  ensureGroup(doc, group).push({ indent: '', done: false, text });
  return doc;
}

function toggleTask(doc, text) {
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

function removeTask(doc, text) {
  for (const name of doc.groupOrder) {
    const idx = doc.groups[name].findIndex((t) => t.text === text);
    if (idx >= 0) {
      const [task] = doc.groups[name].splice(idx, 1);
      return { task, group: name };
    }
  }
  return null;
}

function allTasks(doc) {
  const out = [];
  for (const name of doc.groupOrder) {
    for (const t of doc.groups[name]) out.push({ ...t, group: name });
  }
  return out;
}

function defaultContent() {
  return `# Backlog

Your capture inbox. Ralph does not read this file — use \`/ralph-kit:promote\` or drag to **To Do** when an item is ready for Ralph to work on.

## Features

## Ideas
- [ ] (delete this placeholder once you've added real items)

## Bugs
`;
}

module.exports = {
  DEFAULT_GROUP,
  parse,
  serialize,
  addTask,
  toggleTask,
  removeTask,
  ensureGroup,
  allTasks,
  defaultContent,
};

import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { parse, serialize, addTask, toggleTask, removeTask, allTasks } = require('./backlog_parser');

const SAMPLE = `# Backlog

## Features
- [ ] RSS ingestion
- [x] Twitter thread generator

## Ideas
- [ ] Daily digest
`;

describe('backlog_parser', () => {
  it('parses groups and tasks', () => {
    const doc = parse(SAMPLE);
    expect(doc.title).toBe('Backlog');
    expect(doc.groupOrder).toEqual(['Features', 'Ideas']);
    expect(doc.groups.Features).toHaveLength(2);
    expect(doc.groups.Features[1].done).toBe(true);
  });

  it('round-trips stable', () => {
    const a = parse(SAMPLE);
    const b = parse(serialize(a));
    expect(b.groupOrder).toEqual(a.groupOrder);
    for (const g of a.groupOrder) {
      expect(b.groups[g].map((t) => ({ text: t.text, done: t.done })))
        .toEqual(a.groups[g].map((t) => ({ text: t.text, done: t.done })));
    }
  });

  it('adds, toggles, and removes', () => {
    const doc = parse(SAMPLE);
    addTask(doc, 'New idea', 'Ideas');
    expect(doc.groups.Ideas.some((t) => t.text === 'New idea')).toBe(true);

    expect(toggleTask(doc, 'Daily digest')).toBe(true);
    expect(doc.groups.Ideas.find((t) => t.text === 'Daily digest').done).toBe(true);

    const removed = removeTask(doc, 'RSS ingestion');
    expect(removed.task.text).toBe('RSS ingestion');
    expect(removed.group).toBe('Features');
    expect(doc.groups.Features.some((t) => t.text === 'RSS ingestion')).toBe(false);
  });

  it('flattens across groups', () => {
    const doc = parse(SAMPLE);
    const all = allTasks(doc);
    expect(all).toHaveLength(3);
    expect(all.map((t) => t.group)).toEqual(['Features', 'Features', 'Ideas']);
  });
});

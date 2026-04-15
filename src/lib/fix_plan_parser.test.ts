import { describe, it, expect } from 'vitest';
import { parse, serialize, addTask, toggleTask, moveTask, toBoard } from './fix_plan_parser';

const SAMPLE = `# Ralph Fix Plan

## Status: BLOCKED - Needs Project Definition

## Before Any Development Can Begin
- [ ] Define what "content-machine" is (project purpose, scope, target users)
- [ ] Choose a tech stack (language, framework, dependencies)

## High Priority
- [x] Review codebase and understand architecture — **RESULT: No codebase exists yet**
- [ ] Scaffold project structure based on chosen tech stack

## Medium Priority
- [ ] Add test coverage

## Notes
- The project directory only contains Ralph infrastructure files
`;

describe('fix_plan_parser', () => {
  it('parses title, status, sections, and tasks', () => {
    const doc = parse(SAMPLE);
    expect(doc.title).toBe('Ralph Fix Plan');
    expect(doc.statusLine).toMatch(/^Status:/);
    expect(doc.sections['High Priority']).toHaveLength(2);
    expect(doc.sections['High Priority'][0].done).toBe(true);
    expect(doc.sections['High Priority'][1].done).toBe(false);
    expect(doc.notes.length).toBeGreaterThan(0);
  });

  it('round-trips stable (parse → serialize → parse)', () => {
    const doc1 = parse(SAMPLE);
    const text = serialize(doc1);
    const doc2 = parse(text);
    expect(doc2.title).toBe(doc1.title);
    expect(doc2.statusLine).toBe(doc1.statusLine);
    expect(doc2.sectionOrder).toEqual(doc1.sectionOrder);
    for (const name of doc1.sectionOrder) {
      expect(doc2.sections[name].map((t) => ({ text: t.text, done: t.done })))
        .toEqual(doc1.sections[name].map((t) => ({ text: t.text, done: t.done })));
    }
  });

  it('adds a task under a priority', () => {
    const doc = parse(SAMPLE);
    addTask(doc, 'High Priority', 'New task');
    expect(doc.sections['High Priority'].slice(-1)[0].text).toBe('New task');
    const re = parse(serialize(doc));
    expect(re.sections['High Priority'].some((t) => t.text === 'New task')).toBe(true);
  });

  it('toggles a task', () => {
    const doc = parse(SAMPLE);
    const ok = toggleTask(doc, 'Scaffold project structure based on chosen tech stack');
    expect(ok).toBe(true);
    expect(doc.sections['High Priority'][1].done).toBe(true);
  });

  it('moves a task between priorities', () => {
    const doc = parse(SAMPLE);
    const ok = moveTask(doc, 'Add test coverage', 'High Priority');
    expect(ok).toBe(true);
    expect(doc.sections['Medium Priority'].some((t) => t.text === 'Add test coverage')).toBe(false);
    expect(doc.sections['High Priority'].some((t) => t.text === 'Add test coverage')).toBe(true);
  });

  it('builds a board view with blocked banner and in-progress pick', () => {
    const doc = parse(SAMPLE);
    const board = toBoard(doc);
    expect(board.blocked.length).toBe(1);
    expect(board.inProgress.length).toBe(1);
    expect(board.inProgress[0].text).toBe('Scaffold project structure based on chosen tech stack');
    expect(board.done.some((c) => /Review codebase/.test(c.text))).toBe(true);
  });

  it('creates new section when adding task to missing priority', () => {
    const doc = parse(SAMPLE);
    addTask(doc, 'Low Priority', 'Polish');
    const re = parse(serialize(doc));
    expect(re.sections['Low Priority'][0].text).toBe('Polish');
  });
});

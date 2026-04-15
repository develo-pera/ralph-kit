import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { inspect, scaffold } from './doctor';

let tmp: string;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ralph-kit-doc-'));
});
afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('doctor', () => {
  it('reports missing when .ralph/ does not exist', () => {
    const r = inspect(tmp);
    expect(r.state).toBe('missing');
  });

  it('reports uninitialized after scaffold but before define', () => {
    scaffold(tmp);
    const r = inspect(tmp);
    expect(r.state).toBe('uninitialized');
    expect(r.reasons.length).toBeGreaterThan(0);
    expect(r.files!.backlog).toBe(true);
  });

  it('reports initialized when PROMPT is customized, fix_plan is unblocked, and specs exist', () => {
    scaffold(tmp);
    fs.writeFileSync(path.join(tmp, '.ralph', 'PROMPT.md'), '# Custom prompt for my real project\n\nDo the thing.');
    fs.writeFileSync(
      path.join(tmp, '.ralph', 'fix_plan.md'),
      `# Ralph Fix Plan\n\n## Status: READY\n\n## High Priority\n- [ ] Build it\n`,
    );
    fs.writeFileSync(path.join(tmp, '.ralph', 'specs', 'feature-a.md'), '# Feature A\n');
    const r = inspect(tmp);
    expect(r.state).toBe('initialized');
    expect(r.reasons).toEqual([]);
  });

  it('treats a customized PROMPT that mentions "Follow tasks in fix_plan.md" as initialized', () => {
    scaffold(tmp);
    fs.writeFileSync(
      path.join(tmp, '.ralph', 'PROMPT.md'),
      `# Ralph Development Instructions

## Context
You are Ralph, working on the **content-machine** project.
**Project Type:** Next.js 15 + TypeScript

## Current Objectives
- Follow tasks in fix_plan.md — one task per loop
- Ship vertical slices through the end-to-end flow
`,
    );
    fs.writeFileSync(
      path.join(tmp, '.ralph', 'fix_plan.md'),
      `# Ralph Fix Plan\n\n## Status: READY\n\n## High Priority\n- [ ] Build it\n`,
    );
    fs.writeFileSync(path.join(tmp, '.ralph', 'specs', 'feature-a.md'), '# Feature A\n');
    const r = inspect(tmp);
    expect(r.state).toBe('initialized');
    expect(r.reasons).toEqual([]);
  });

  it('reports "PROMPT still matches default template" when only the prompt check fails', () => {
    scaffold(tmp);
    fs.writeFileSync(
      path.join(tmp, '.ralph', 'fix_plan.md'),
      `# Ralph Fix Plan\n\n## Status: READY\n\n## High Priority\n- [ ] Build it\n`,
    );
    fs.writeFileSync(path.join(tmp, '.ralph', 'specs', 'feature-a.md'), '# Feature A\n');
    const r = inspect(tmp);
    expect(r.state).toBe('uninitialized');
    expect(r.reasons).toContain('PROMPT.md still matches the default template');
  });
});

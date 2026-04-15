import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import os from 'os';
const require = createRequire(import.meta.url);
const { inspect, scaffold } = require('./doctor');
const { promptTemplate } = require('./templates');

let tmp;
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
    expect(r.files.backlog).toBe(true);
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
});

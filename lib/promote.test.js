import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import os from 'os';
const require = createRequire(import.meta.url);
const { promoteToTodo, demoteToBacklog } = require('./promote');
const backlogParser = require('./backlog_parser');
const fixPlanParser = require('./fix_plan_parser');

let tmp;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ralph-kit-test-'));
  fs.mkdirSync(path.join(tmp, '.ralph'));
  fs.writeFileSync(
    path.join(tmp, '.ralph', 'fix_plan.md'),
    `# Ralph Fix Plan\n\n## Status: READY\n\n## High Priority\n- [ ] Existing high\n\n## Medium Priority\n`,
  );
  fs.writeFileSync(
    path.join(tmp, '.ralph', 'backlog.md'),
    `# Backlog\n\n## Features\n- [ ] Feature A\n- [ ] Feature B\n\n## Ideas\n- [ ] Idea X\n`,
  );
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('promote', () => {
  it('moves a backlog item to fix_plan High Priority atomically', () => {
    promoteToTodo(tmp, 'Feature A');
    const fp = fixPlanParser.parse(fs.readFileSync(path.join(tmp, '.ralph', 'fix_plan.md'), 'utf8'));
    const bk = backlogParser.parse(fs.readFileSync(path.join(tmp, '.ralph', 'backlog.md'), 'utf8'));
    expect(fp.sections['High Priority'].some((t) => t.text === 'Feature A')).toBe(true);
    expect(bk.groups.Features.some((t) => t.text === 'Feature A')).toBe(false);
  });

  it('demotes a fix_plan item back to backlog', () => {
    demoteToBacklog(tmp, 'Existing high');
    const fp = fixPlanParser.parse(fs.readFileSync(path.join(tmp, '.ralph', 'fix_plan.md'), 'utf8'));
    const bk = backlogParser.parse(fs.readFileSync(path.join(tmp, '.ralph', 'backlog.md'), 'utf8'));
    expect(fp.sections['High Priority'].some((t) => t.text === 'Existing high')).toBe(false);
    expect(bk.groups.Ideas.some((t) => t.text === 'Existing high')).toBe(true);
  });

  it('throws when task is missing and leaves files untouched', () => {
    const before = fs.readFileSync(path.join(tmp, '.ralph', 'fix_plan.md'), 'utf8');
    expect(() => promoteToTodo(tmp, 'Does not exist')).toThrow();
    const after = fs.readFileSync(path.join(tmp, '.ralph', 'fix_plan.md'), 'utf8');
    expect(after).toBe(before);
  });
});

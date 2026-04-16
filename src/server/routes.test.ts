import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { buildBoard } from './routes';
import { clearProfileCache, type Profile, PROFILE_VERSION } from '../lib/profile';

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ralph-kit-board-'));
}

function scaffold(base: string, files: Record<string, string>): void {
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(base, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
}

function profile(overrides?: Partial<Profile>): Profile {
  return {
    version: PROFILE_VERSION,
    root: '.ralph',
    fixPlan: {
      highSections: ['High Priority'],
      blockedSections: ['Blocked'],
      completedSections: ['Completed'],
    },
    ...overrides,
  };
}

describe('buildBoard', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = tmpDir();
    clearProfileCache();
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true });
  });

  it('returns empty board when .ralph/ is missing', () => {
    const board = buildBoard(tmp, profile());
    expect(board.meta.state).toBe('missing');
    expect(board.columns.todo).toHaveLength(0);
  });

  it('maps fix_plan tasks to correct columns', () => {
    scaffold(tmp, {
      '.ralph/PROMPT.md': '# Prompt\n\nCustom prompt.',
      '.ralph/AGENT.md': '# Agent',
      '.ralph/fix_plan.md': [
        '# Tasks',
        '## Status: READY',
        '## High Priority',
        '- [ ] Build the thing',
        '- [x] Done thing',
        '## Medium Priority',
        '- [ ] Medium task',
        '## Blocked',
        '- [ ] Waiting on API',
        '## Completed',
        '- [x] Old task',
      ].join('\n'),
      '.ralph/specs/a.md': '# Spec A',
    });

    const board = buildBoard(tmp, profile());
    expect(board.columns.todo.map((c) => c.text)).toContain('Build the thing');
    expect(board.columns.todo.map((c) => c.text)).toContain('Medium task');
    expect(board.columns.blocked.map((c) => c.text)).toContain('Waiting on API');
    expect(board.columns.done.map((c) => c.text)).toContain('Done thing');
    expect(board.columns.done.map((c) => c.text)).toContain('Old task');
  });

  it('moves first todo to in-progress when loop is running', () => {
    scaffold(tmp, {
      '.ralph/PROMPT.md': '# Prompt\n\nCustom prompt.',
      '.ralph/AGENT.md': '# Agent',
      '.ralph/fix_plan.md': [
        '# Tasks',
        '## Status: READY',
        '## High Priority',
        '- [ ] First task',
        '- [ ] Second task',
      ].join('\n'),
      '.ralph/specs/a.md': '# Spec',
      '.ralph/status.json': '{"loop_count":1,"status":"running"}',
    });

    const p = profile({
      loop: { file: 'status.json', countField: 'loop_count', statusField: 'status' },
    });
    const board = buildBoard(tmp, p);
    expect(board.columns.inProgress).toHaveLength(1);
    expect(board.columns.inProgress[0].text).toBe('First task');
    expect(board.columns.todo[0].text).toBe('Second task');
  });

  it('does not move to in-progress when loop is idle', () => {
    scaffold(tmp, {
      '.ralph/PROMPT.md': '# Prompt\n\nCustom prompt.',
      '.ralph/AGENT.md': '# Agent',
      '.ralph/fix_plan.md': [
        '# Tasks',
        '## Status: READY',
        '## High Priority',
        '- [ ] First task',
      ].join('\n'),
      '.ralph/specs/a.md': '# Spec',
      '.ralph/status.json': '{"loop_count":1,"status":"idle"}',
    });

    const p = profile({
      loop: { file: 'status.json', countField: 'loop_count', statusField: 'status' },
    });
    const board = buildBoard(tmp, p);
    expect(board.columns.inProgress).toHaveLength(0);
    expect(board.columns.todo).toHaveLength(1);
  });

  it('shows breaker banner when circuit breaker is open', () => {
    scaffold(tmp, {
      '.ralph/PROMPT.md': '# Prompt\n\nCustom prompt.',
      '.ralph/AGENT.md': '# Agent',
      '.ralph/fix_plan.md': '# Tasks\n## Status: READY\n## High Priority\n- [ ] task',
      '.ralph/specs/a.md': '# Spec',
      '.ralph/.circuit_breaker_state': '{"state":"OPEN","reason":"permission denied"}',
    });

    const p = profile({
      breaker: { file: '.circuit_breaker_state', reasonField: 'reason' },
    });
    const board = buildBoard(tmp, p);
    expect(board.meta.blocked).toBe(true);
    const banner = board.columns.blocked.find((c) => c.kind === 'banner');
    expect(banner).toBeDefined();
    expect(banner!.text).toContain('permission denied');
  });

  it('shows breaker banner from halted status.json (fromStatus)', () => {
    scaffold(tmp, {
      '.ralph/PROMPT.md': '# Prompt\n\nCustom prompt.',
      '.ralph/AGENT.md': '# Agent',
      '.ralph/fix_plan.md': '# Tasks\n## Status: READY\n## High Priority\n- [ ] task',
      '.ralph/specs/a.md': '# Spec',
      '.ralph/status.json': '{"loop_count":5,"status":"halted","exit_reason":"permission_denied"}',
    });

    const p = profile({
      loop: { file: 'status.json', countField: 'loop_count', statusField: 'status' },
      breaker: {
        file: 'status.json',
        fromStatus: true,
        statusField: 'status',
        haltedPattern: 'halted',
        statusReasonField: 'exit_reason',
      },
    });
    const board = buildBoard(tmp, p);
    expect(board.meta.blocked).toBe(true);
    const banner = board.columns.blocked.find((c) => c.kind === 'banner');
    expect(banner).toBeDefined();
    expect(banner!.text).toContain('permission_denied');
  });

  it('shows status blocked banner', () => {
    scaffold(tmp, {
      '.ralph/PROMPT.md': '# Prompt\n\nCustom prompt.',
      '.ralph/AGENT.md': '# Agent',
      '.ralph/fix_plan.md': '# Tasks\n## Status: BLOCKED - needs definition\n## High Priority\n- [ ] task',
      '.ralph/specs/a.md': '# Spec',
    });

    const board = buildBoard(tmp, profile());
    expect(board.meta.blocked).toBe(true);
    const banner = board.columns.blocked.find((c) => c.source === 'status');
    expect(banner).toBeDefined();
    expect(banner!.text).toContain('BLOCKED');
  });

  it('backlog.md items go to backlog column', () => {
    scaffold(tmp, {
      '.ralph/PROMPT.md': '# Prompt\n\nCustom prompt.',
      '.ralph/AGENT.md': '# Agent',
      '.ralph/fix_plan.md': '# Tasks\n## Status: READY\n## High Priority\n- [ ] planned task',
      '.ralph/backlog.md': '# Backlog\n## Ideas\n- [ ] cool idea\n- [x] done idea',
      '.ralph/specs/a.md': '# Spec',
    });

    const board = buildBoard(tmp, profile());
    expect(board.columns.backlog.map((c) => c.text)).toContain('cool idea');
    expect(board.columns.done.map((c) => c.text)).toContain('done idea');
    // Planned tasks should NOT be in backlog
    expect(board.columns.backlog.map((c) => c.text)).not.toContain('planned task');
  });

  it('reads live log tail', () => {
    scaffold(tmp, {
      '.ralph/PROMPT.md': '# Prompt\n\nCustom prompt.',
      '.ralph/AGENT.md': '# Agent',
      '.ralph/fix_plan.md': '# Tasks\n## Status: READY\n## High Priority',
      '.ralph/specs/a.md': '# Spec',
      '.ralph/live.log': 'line 1\nline 2\nline 3',
    });

    const p = profile({ liveLog: { file: 'live.log' } });
    const board = buildBoard(tmp, p);
    expect(board.meta.liveTail).toEqual(['line 1', 'line 2', 'line 3']);
    expect(board.meta.lastLiveLine).toBe('line 3');
  });

  it('populates loop count and status from status.json', () => {
    scaffold(tmp, {
      '.ralph/PROMPT.md': '# Prompt\n\nCustom prompt.',
      '.ralph/AGENT.md': '# Agent',
      '.ralph/fix_plan.md': '# Tasks\n## Status: READY\n## High Priority',
      '.ralph/specs/a.md': '# Spec',
      '.ralph/status.json': '{"loop_count":7,"status":"running"}',
    });

    const p = profile({
      loop: { file: 'status.json', countField: 'loop_count', statusField: 'status' },
    });
    const board = buildBoard(tmp, p);
    expect(board.meta.loopCount).toBe(7);
    expect(board.meta.loopStatus).toBe('running');
  });
});

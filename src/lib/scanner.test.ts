import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect } from 'vitest';

import { scan, profileFromScan } from './scanner';

function tmpDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `ralph-kit-scan-${prefix}-`));
}

function scaffold(base: string, files: Record<string, string>): void {
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(base, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
}

describe('scan', () => {
  it('finds files across the entire project', () => {
    const tmp = tmpDir('full');
    try {
      scaffold(tmp, {
        '.ralph/PROMPT.md': '# Prompt',
        '.ralph/AGENT.md': '# Agent',
        '.ralph/fix_plan.md': '# Fix Plan\n## High Priority\n- [ ] task\n## Completed\n- [x] done',
        '.ralph/backlog.md': '# Backlog',
        '.ralph/status.json': '{"loop_count":5,"status":"running"}',
        '.ralph/live.log': 'log line',
        '.ralphrc': 'ALLOWED_TOOLS="Write,Read"',
      });
      const result = scan(tmp);
      expect(result.files.length).toBeGreaterThanOrEqual(7);
      expect(result.files.find((f) => f.role === 'prompt')).toBeDefined();
      expect(result.files.find((f) => f.role === 'agent')).toBeDefined();
      expect(result.files.find((f) => f.role === 'taskList')).toBeDefined();
      expect(result.files.find((f) => f.role === 'loopStatus')).toBeDefined();
      expect(result.files.find((f) => f.role === 'liveLog')).toBeDefined();
      expect(result.files.find((f) => f.role === 'loopConfig')).toBeDefined();
      expect(result.files.find((f) => f.role === 'backlog')).toBeDefined();
    } finally {
      fs.rmSync(tmp, { recursive: true });
    }
  });

  it('detects snarktank layout in scripts/ralph/', () => {
    const tmp = tmpDir('snarktank');
    try {
      scaffold(tmp, {
        'scripts/ralph/ralph.sh': '#!/bin/bash',
        'scripts/ralph/prd.json': '{"tasks":[]}',
        'scripts/ralph/CLAUDE.md': '# Prompt',
      });
      const result = scan(tmp);
      expect(result.files.find((f) => f.role === 'loopRunner')).toBeDefined();
      expect(result.files.find((f) => f.role === 'taskList')?.format).toBe('json');
      expect(result.files.find((f) => f.role === 'runnerPrompt')).toBeDefined();
      expect(result.flavor).toBe('snarktank');
    } finally {
      fs.rmSync(tmp, { recursive: true });
    }
  });

  it('detects hybrid layout (.ralph + scripts/ralph)', () => {
    const tmp = tmpDir('hybrid');
    try {
      scaffold(tmp, {
        '.ralph/PROMPT.md': '# Prompt',
        '.ralph/fix_plan.md': '# Fix Plan\n## High Priority\n- [ ] task',
        'scripts/ralph/ralph.sh': '#!/bin/bash',
      });
      const result = scan(tmp);
      expect(result.flavor).toBe('snarktank-hybrid');
      expect(result.files.find((f) => f.role === 'loopRunner')).toBeDefined();
      expect(result.files.find((f) => f.role === 'taskList')).toBeDefined();
    } finally {
      fs.rmSync(tmp, { recursive: true });
    }
  });

  it('detects frankbria layout', () => {
    const tmp = tmpDir('frankbria');
    try {
      scaffold(tmp, {
        '.ralphrc': 'ALLOWED_TOOLS="Write,Read"',
        '.ralph/fix_plan.md': '# Fix Plan\n## High Priority\n- [ ] task',
        '.ralph/PROMPT.md': '# Prompt',
      });
      const result = scan(tmp);
      expect(result.flavor).toBe('frankbria');
    } finally {
      fs.rmSync(tmp, { recursive: true });
    }
  });

  it('flags conflict when multiple task files exist', () => {
    const tmp = tmpDir('conflict');
    try {
      scaffold(tmp, {
        '.ralph/fix_plan.md': '# Fix Plan\n## High Priority\n- [ ] task',
        'scripts/ralph/prd.json': '{"tasks":[]}',
      });
      const result = scan(tmp);
      expect(result.conflicts.length).toBeGreaterThan(0);
      expect(result.conflicts[0].role).toBe('taskList');
    } finally {
      fs.rmSync(tmp, { recursive: true });
    }
  });

  it('reclassifies CLAUDE.md next to ralph.sh as runnerPrompt (no conflict)', () => {
    const tmp = tmpDir('runner-prompt');
    try {
      scaffold(tmp, {
        '.ralph/PROMPT.md': '# Prompt',
        'scripts/ralph/CLAUDE.md': '# Claude Prompt',
        'scripts/ralph/ralph.sh': '#!/bin/bash',
      });
      const result = scan(tmp);
      const promptConflict = result.conflicts.find((c) => c.role === 'prompt');
      expect(promptConflict).toBeUndefined();
      expect(result.files.find((f) => f.role === 'runnerPrompt')?.path).toBe('scripts/ralph/CLAUDE.md');
      expect(result.files.find((f) => f.role === 'prompt')?.path).toBe('.ralph/PROMPT.md');
    } finally {
      fs.rmSync(tmp, { recursive: true });
    }
  });

  it('skips node_modules and .git', () => {
    const tmp = tmpDir('skip');
    try {
      scaffold(tmp, {
        'node_modules/ralph/PROMPT.md': '# Should be skipped',
        '.git/ralph/PROMPT.md': '# Should be skipped',
        '.ralph/PROMPT.md': '# Real prompt',
      });
      const result = scan(tmp);
      const prompts = result.files.filter((f) => f.role === 'prompt');
      expect(prompts.length).toBe(1);
      expect(prompts[0].path).toBe('.ralph/PROMPT.md');
    } finally {
      fs.rmSync(tmp, { recursive: true });
    }
  });

  it('returns empty when no ralph files found', () => {
    const tmp = tmpDir('empty');
    try {
      scaffold(tmp, { 'README.md': '# Hello' });
      const result = scan(tmp);
      expect(result.files.length).toBe(0);
      expect(result.conflicts.length).toBe(0);
    } finally {
      fs.rmSync(tmp, { recursive: true });
    }
  });
});

describe('profileFromScan', () => {
  it('generates profile with loop, breaker, and log from frankbria layout', () => {
    const tmp = tmpDir('profile-frankbria');
    try {
      scaffold(tmp, {
        '.ralphrc': 'ALLOWED_TOOLS="Write"',
        '.ralph/PROMPT.md': '# Prompt',
        '.ralph/fix_plan.md': '# Fix Plan\n## High Priority\n- [ ] task\n## Blocked\n- [ ] stuck\n## Completed\n- [x] done',
        '.ralph/status.json': '{"loop_count":5,"status":"running"}',
        '.ralph/progress.json': '{"loop_count":4,"status":"idle"}',
        '.ralph/live.log': 'log line',
        '.ralph/.circuit_breaker_state': '{"state":"CLOSED"}',
      });
      const result = scan(tmp);
      const profile = profileFromScan(result);

      expect(profile.root).toBe('.ralph');
      expect(profile.loop?.file).toBe('status.json');
      expect(profile.loop?.countField).toBe('loop_count');
      expect(profile.loop?.statusField).toBe('status');
      expect(profile.loop?.fallback?.file).toBe('progress.json');
      expect(profile.liveLog?.file).toBe('live.log');
      expect(profile.breaker?.file).toBe('.circuit_breaker_state');
      expect(profile.fixPlan?.highSections).toContain('High Priority');
      expect(profile.fixPlan?.blockedSections).toContain('Blocked');
      expect(profile.fixPlan?.completedSections).toContain('Completed');
    } finally {
      fs.rmSync(tmp, { recursive: true });
    }
  });

  it('detects fromStatus breaker when status is halted', () => {
    const tmp = tmpDir('profile-halted');
    try {
      scaffold(tmp, {
        '.ralph/PROMPT.md': '# Prompt',
        '.ralph/fix_plan.md': '# Fix Plan\n## High Priority\n- [ ] task',
        '.ralph/status.json': '{"loop_count":6,"status":"halted","exit_reason":"permission_denied"}',
      });
      const result = scan(tmp);
      const profile = profileFromScan(result);

      expect(profile.breaker?.fromStatus).toBe(true);
      expect(profile.breaker?.statusReasonField).toBe('exit_reason');
    } finally {
      fs.rmSync(tmp, { recursive: true });
    }
  });

  it('generates profile for snarktank layout', () => {
    const tmp = tmpDir('profile-snarktank');
    try {
      scaffold(tmp, {
        'scripts/ralph/ralph.sh': '#!/bin/bash',
        'scripts/ralph/prd.json': '{"tasks":["task1"]}',
        'scripts/ralph/CLAUDE.md': '# Prompt',
      });
      const result = scan(tmp);
      const profile = profileFromScan(result);

      expect(profile.implementation).toBe('snarktank');
      expect(profile.taskFile?.format).toBe('json');
    } finally {
      fs.rmSync(tmp, { recursive: true });
    }
  });
});

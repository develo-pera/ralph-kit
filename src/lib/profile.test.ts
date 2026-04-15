import { describe, it, expect, beforeEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

import {
  generateProfile,
  loadProfile,
  writeProfile,
  clearProfileCache,
  profileFilePaths,
  defaultProfile,
  PROFILE_VERSION,
} from './profile';
import { probe } from './probe';
import { watchedPaths } from './state';

const FIXTURES = path.join(__dirname, '..', '..', 'fixtures', 'profiles');
const HIDDEN_FULL = path.join(FIXTURES, 'hidden-ralph-full', 'ralph-project');
const VISIBLE_MD = path.join(FIXTURES, 'visible-ralph-markdown', 'ralph-project');
const PROGRESS_ONLY = path.join(FIXTURES, 'progress-only', 'ralph-project');
const EMPTY_MD = path.join(FIXTURES, 'empty-markdown', 'ralph-project');

beforeEach(() => {
  clearProfileCache();
});

describe('generateProfile', () => {
  it('picks status.json over progress.json and records a fallback', () => {
    const p = generateProfile(probe(HIDDEN_FULL));
    expect(p.root).toBe('.ralph');
    expect(p.loop?.file).toBe('status.json');
    expect(p.loop?.statusField).toBe('status');
    expect(p.loop?.countField).toBe('loop_count');
    expect(p.loop?.fallback?.file).toBe('progress.json');
  });

  it('detects breaker with state + reason fields', () => {
    const p = generateProfile(probe(HIDDEN_FULL));
    expect(p.breaker?.file).toBe('.circuit_breaker_state');
    expect(p.breaker?.reasonField).toBe('reason');
  });

  it('detects live log', () => {
    const p = generateProfile(probe(HIDDEN_FULL));
    expect(p.liveLog?.file).toBe('live.log');
  });

  it('classifies fix_plan sections correctly', () => {
    const p = generateProfile(probe(HIDDEN_FULL));
    expect(p.fixPlan?.blockedSections).toEqual(['Blocked']);
    expect(p.fixPlan?.highSections).toEqual(['High Priority']);
    expect(p.fixPlan?.completedSections).toEqual(['Completed']);
  });

  it('handles snarktank-style ralph/ with non-default section names', () => {
    const p = generateProfile(probe(VISIBLE_MD));
    expect(p.root).toBe('ralph');
    expect(p.loop).toBeUndefined();
    expect(p.breaker).toBeUndefined();
    expect(p.liveLog).toBeUndefined();
    expect(p.fixPlan?.highSections).toEqual(['Now']);
    expect(p.fixPlan?.completedSections).toEqual(['Shipped']);
  });

  it('handles progress-only (no status.json, no breaker)', () => {
    const p = generateProfile(probe(PROGRESS_ONLY));
    expect(p.root).toBe('.ralph');
    expect(p.loop?.file).toBe('progress.json');
    expect(p.loop?.fallback).toBeUndefined();
    expect(p.breaker).toBeUndefined();
  });

  it('handles empty-markdown (no JSON, no log)', () => {
    const p = generateProfile(probe(EMPTY_MD));
    expect(p.root).toBe('.ralph');
    expect(p.loop).toBeUndefined();
    expect(p.breaker).toBeUndefined();
    expect(p.liveLog).toBeUndefined();
    expect(p.fixPlan?.highSections).toEqual(['High Priority']);
  });

  it('defaults root to .ralph when nothing is detectable', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ralph-kit-empty-'));
    try {
      const p = generateProfile(probe(tmp));
      expect(p.root).toBe('.ralph');
      expect(p.loop).toBeUndefined();
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe('loadProfile / writeProfile', () => {
  it('round-trips a profile through .ralph-kit/profile.json', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ralph-kit-rt-'));
    try {
      const original = defaultProfile();
      writeProfile(tmp, original);
      clearProfileCache();
      const loaded = loadProfile(tmp);
      expect(loaded.version).toBe(PROFILE_VERSION);
      expect(loaded.root).toBe(original.root);
      expect(loaded.loop?.file).toBe(original.loop?.file);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('auto-generates when no persisted profile exists', () => {
    clearProfileCache();
    const p = loadProfile(HIDDEN_FULL);
    expect(p.loop?.file).toBe('status.json');
  });

  it('refuses to load a profile with a mismatched schema version', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ralph-kit-mv-'));
    try {
      fs.mkdirSync(path.join(tmp, '.ralph-kit'));
      fs.writeFileSync(
        path.join(tmp, '.ralph-kit', 'profile.json'),
        JSON.stringify({ version: 99, root: '.ralph' }),
      );
      expect(() => loadProfile(tmp)).toThrow(/schema version/);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe('profileFilePaths + watchedPaths integration', () => {
  it('watchedPaths includes every path a populated profile references (watch-drift canary)', () => {
    const p = generateProfile(probe(HIDDEN_FULL));
    const watched = watchedPaths(HIDDEN_FULL, p);
    for (const referenced of profileFilePaths(HIDDEN_FULL, p)) {
      expect(watched).toContain(referenced);
    }
  });

  it('watchedPaths always includes the markdown trio + specs', () => {
    const p = generateProfile(probe(HIDDEN_FULL));
    const watched = watchedPaths(HIDDEN_FULL, p);
    const root = path.join(HIDDEN_FULL, p.root);
    for (const md of ['PROMPT.md', 'AGENT.md', 'fix_plan.md', 'backlog.md']) {
      expect(watched).toContain(path.join(root, md));
    }
    expect(watched).toContain(path.join(root, 'specs'));
  });
});

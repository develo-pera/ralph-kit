import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { parseBreakerState, snapshot, extractLoopState } from './state';
import { type Profile, PROFILE_VERSION } from './profile';

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ralph-kit-state-'));
}

function scaffold(base: string, files: Record<string, string>): void {
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(base, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
}

function prof(overrides?: Partial<Profile>): Profile {
  return { version: PROFILE_VERSION, root: '.ralph', ...overrides };
}

describe('parseBreakerState', () => {
  it('returns closed for empty / missing input', () => {
    expect(parseBreakerState(null)).toEqual({ open: false, reason: null });
    expect(parseBreakerState(undefined)).toEqual({ open: false, reason: null });
    expect(parseBreakerState('')).toEqual({ open: false, reason: null });
  });

  it('parses frankbria-style JSON with OPEN state and reason', () => {
    const raw = JSON.stringify({
      state: 'OPEN',
      reason: 'Permission denied in 2 consecutive loops - update ALLOWED_TOOLS in .ralphrc',
      consecutive_permission_denials: 2,
    });
    expect(parseBreakerState(raw)).toEqual({
      open: true,
      reason: 'Permission denied in 2 consecutive loops - update ALLOWED_TOOLS in .ralphrc',
    });
  });

  it('parses JSON with CLOSED state as not open', () => {
    const raw = JSON.stringify({ state: 'CLOSED', reason: 'healthy' });
    expect(parseBreakerState(raw)).toEqual({ open: false, reason: 'healthy' });
  });

  it('falls back to regex for non-JSON OPEN marker', () => {
    expect(parseBreakerState('OPEN\nsome details')).toEqual({ open: true, reason: null });
  });

  it('falls back to regex for non-JSON CLOSED / unknown content', () => {
    expect(parseBreakerState('something else')).toEqual({ open: false, reason: null });
  });

  it('ignores blank/whitespace-only reason', () => {
    const raw = JSON.stringify({ state: 'OPEN', reason: '   ' });
    expect(parseBreakerState(raw)).toEqual({ open: true, reason: null });
  });
});

describe('snapshot', () => {
  it('reads status.json and progress.json', () => {
    const tmp = tmpDir();
    try {
      scaffold(tmp, {
        '.ralph/status.json': '{"loop_count":5,"status":"running"}',
        '.ralph/progress.json': '{"loop_count":4,"status":"idle"}',
      });
      const snap = snapshot(tmp, prof({
        loop: {
          file: 'status.json', countField: 'loop_count', statusField: 'status',
          fallback: { file: 'progress.json', countField: 'loop_count', statusField: 'status' },
        },
      }));
      expect(snap.status).toEqual({ loop_count: 5, status: 'running' });
      expect(snap.progress).toEqual({ loop_count: 4, status: 'idle' });
      expect(snap.exists).toBe(true);
    } finally {
      fs.rmSync(tmp, { recursive: true });
    }
  });

  it('detects dedicated breaker file', () => {
    const tmp = tmpDir();
    try {
      scaffold(tmp, {
        '.ralph/.circuit_breaker_state': '{"state":"OPEN","reason":"permission denied"}',
      });
      const snap = snapshot(tmp, prof({
        breaker: { file: '.circuit_breaker_state', reasonField: 'reason' },
      }));
      expect(snap.breakerOpen).toBe(true);
      expect(snap.breakerReason).toBe('permission denied');
    } finally {
      fs.rmSync(tmp, { recursive: true });
    }
  });

  it('detects fromStatus breaker from halted status.json', () => {
    const tmp = tmpDir();
    try {
      scaffold(tmp, {
        '.ralph/status.json': '{"loop_count":6,"status":"halted","exit_reason":"permission_denied"}',
      });
      const snap = snapshot(tmp, prof({
        loop: { file: 'status.json', countField: 'loop_count', statusField: 'status' },
        breaker: {
          file: 'status.json', fromStatus: true,
          statusField: 'status', haltedPattern: 'halted',
          statusReasonField: 'exit_reason',
        },
      }));
      expect(snap.breakerOpen).toBe(true);
      expect(snap.breakerReason).toBe('permission_denied');
    } finally {
      fs.rmSync(tmp, { recursive: true });
    }
  });

  it('fromStatus breaker is closed when status is running', () => {
    const tmp = tmpDir();
    try {
      scaffold(tmp, {
        '.ralph/status.json': '{"loop_count":6,"status":"running"}',
      });
      const snap = snapshot(tmp, prof({
        loop: { file: 'status.json', countField: 'loop_count', statusField: 'status' },
        breaker: {
          file: 'status.json', fromStatus: true,
          statusField: 'status', haltedPattern: 'halted',
          statusReasonField: 'exit_reason',
        },
      }));
      expect(snap.breakerOpen).toBe(false);
    } finally {
      fs.rmSync(tmp, { recursive: true });
    }
  });

  it('reads live log tail', () => {
    const tmp = tmpDir();
    try {
      scaffold(tmp, {
        '.ralph/live.log': 'a\nb\nc\nd\ne',
      });
      const snap = snapshot(tmp, prof({ liveLog: { file: 'live.log', tailLines: 3 } }));
      expect(snap.liveTail).toEqual(['c', 'd', 'e']);
    } finally {
      fs.rmSync(tmp, { recursive: true });
    }
  });

  it('returns empty snapshot when dir missing', () => {
    const tmp = tmpDir();
    try {
      const snap = snapshot(tmp, prof());
      expect(snap.exists).toBe(false);
      expect(snap.breakerOpen).toBe(false);
      expect(snap.liveTail).toEqual([]);
    } finally {
      fs.rmSync(tmp, { recursive: true });
    }
  });
});

describe('extractLoopState', () => {
  it('extracts count and status from status field', () => {
    const snap = { status: { loop_count: 7, status: 'running' }, progress: null, breakerOpen: false, breakerReason: null, liveTail: [], exists: true };
    const p = prof({ loop: { file: 'status.json', countField: 'loop_count', statusField: 'status' } });
    const { loopCount, loopStatus } = extractLoopState(snap, p);
    expect(loopCount).toBe(7);
    expect(loopStatus).toBe('running');
  });

  it('falls back to progress when status is null', () => {
    const snap = { status: null, progress: { loop_count: 3, status: 'idle' }, breakerOpen: false, breakerReason: null, liveTail: [], exists: true };
    const p = prof({
      loop: {
        file: 'status.json', countField: 'loop_count', statusField: 'status',
        fallback: { file: 'progress.json', countField: 'loop_count', statusField: 'status' },
      },
    });
    const { loopCount, loopStatus } = extractLoopState(snap, p);
    expect(loopCount).toBe(3);
    expect(loopStatus).toBe('idle');
  });

  it('returns nulls when no loop config', () => {
    const snap = { status: null, progress: null, breakerOpen: false, breakerReason: null, liveTail: [], exists: true };
    const { loopCount, loopStatus } = extractLoopState(snap, prof());
    expect(loopCount).toBeNull();
    expect(loopStatus).toBeNull();
  });
});

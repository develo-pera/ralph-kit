import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect } from 'vitest';

import { loadHistory, appendResolved, historyPath } from './history';
import { PROFILE_DIR } from './profile';

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ralph-kit-hist-'));
}

describe('loadHistory', () => {
  it('returns empty when no file exists', () => {
    const tmp = tmpDir();
    try {
      expect(loadHistory(tmp)).toEqual({ resolved: [] });
    } finally {
      fs.rmSync(tmp, { recursive: true });
    }
  });

  it('reads existing history', () => {
    const tmp = tmpDir();
    try {
      const dir = path.join(tmp, PROFILE_DIR);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        path.join(dir, 'history.json'),
        JSON.stringify({ resolved: [{ text: 'test', source: 'breaker', resolvedAt: '2026-01-01' }] }),
      );
      const h = loadHistory(tmp);
      expect(h.resolved).toHaveLength(1);
      expect(h.resolved[0].text).toBe('test');
    } finally {
      fs.rmSync(tmp, { recursive: true });
    }
  });

  it('handles corrupt JSON gracefully', () => {
    const tmp = tmpDir();
    try {
      const dir = path.join(tmp, PROFILE_DIR);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'history.json'), 'not json');
      expect(loadHistory(tmp)).toEqual({ resolved: [] });
    } finally {
      fs.rmSync(tmp, { recursive: true });
    }
  });

  it('handles missing resolved array', () => {
    const tmp = tmpDir();
    try {
      const dir = path.join(tmp, PROFILE_DIR);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'history.json'), '{}');
      expect(loadHistory(tmp)).toEqual({ resolved: [] });
    } finally {
      fs.rmSync(tmp, { recursive: true });
    }
  });
});

describe('appendResolved', () => {
  it('creates file and appends event', () => {
    const tmp = tmpDir();
    try {
      appendResolved(tmp, { text: 'breaker cleared', source: 'breaker' });
      const h = loadHistory(tmp);
      expect(h.resolved).toHaveLength(1);
      expect(h.resolved[0].text).toBe('breaker cleared');
      expect(h.resolved[0].source).toBe('breaker');
      expect(h.resolved[0].resolvedAt).toBeTruthy();
    } finally {
      fs.rmSync(tmp, { recursive: true });
    }
  });

  it('appends to existing history', () => {
    const tmp = tmpDir();
    try {
      appendResolved(tmp, { text: 'first', source: 'breaker' });
      appendResolved(tmp, { text: 'second', source: 'status' });
      const h = loadHistory(tmp);
      expect(h.resolved).toHaveLength(2);
      expect(h.resolved[0].text).toBe('first');
      expect(h.resolved[1].text).toBe('second');
    } finally {
      fs.rmSync(tmp, { recursive: true });
    }
  });
});

describe('historyPath', () => {
  it('returns path under .ralph-kit/', () => {
    expect(historyPath('/foo')).toBe(path.join('/foo', PROFILE_DIR, 'history.json'));
  });
});

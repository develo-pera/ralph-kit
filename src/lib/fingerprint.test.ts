import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect } from 'vitest';

import { detect, fingerprint, readDeclaration } from './fingerprint';

function tmpDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `ralph-kit-fp-${prefix}-`));
}

function scaffold(base: string, files: Record<string, string>): void {
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(base, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
}

describe('readDeclaration', () => {
  it('returns null when no .ralph-kit.json exists', () => {
    const tmp = tmpDir('no-decl');
    try {
      expect(readDeclaration(tmp)).toBeNull();
    } finally {
      fs.rmSync(tmp, { recursive: true });
    }
  });

  it('reads a valid declaration', () => {
    const tmp = tmpDir('valid-decl');
    try {
      scaffold(tmp, {
        '.ralph-kit.json': JSON.stringify({ root: 'my-ralph', taskFile: { file: 'tasks.json', format: 'json' } }),
      });
      const decl = readDeclaration(tmp);
      expect(decl).not.toBeNull();
      expect(decl!.root).toBe('my-ralph');
      expect(decl!.taskFile?.format).toBe('json');
    } finally {
      fs.rmSync(tmp, { recursive: true });
    }
  });

  it('returns null for invalid JSON', () => {
    const tmp = tmpDir('bad-json');
    try {
      scaffold(tmp, { '.ralph-kit.json': 'not json' });
      expect(readDeclaration(tmp)).toBeNull();
    } finally {
      fs.rmSync(tmp, { recursive: true });
    }
  });
});

describe('fingerprint', () => {
  it('detects frankbria layout', () => {
    const tmp = tmpDir('frankbria');
    try {
      scaffold(tmp, {
        '.ralphrc': 'ALLOWED_TOOLS="Write,Read"',
        '.ralph/fix_plan.md': '# Fix Plan\n## High Priority\n- [ ] task',
      });
      const sig = fingerprint(tmp);
      expect(sig).not.toBeNull();
      expect(sig!.name).toBe('frankbria');
      expect(sig!.root).toBe('.ralph');
    } finally {
      fs.rmSync(tmp, { recursive: true });
    }
  });

  it('detects snarktank layout', () => {
    const tmp = tmpDir('snarktank');
    try {
      scaffold(tmp, {
        'scripts/ralph/ralph.sh': '#!/bin/bash',
        'scripts/ralph/prd.json': '{}',
      });
      const sig = fingerprint(tmp);
      expect(sig).not.toBeNull();
      expect(sig!.name).toBe('snarktank');
      expect(sig!.root).toBe('scripts/ralph');
    } finally {
      fs.rmSync(tmp, { recursive: true });
    }
  });

  it('detects snarktank-dotralph (both .ralph and scripts/ralph)', () => {
    const tmp = tmpDir('snarktank-dotralph');
    try {
      scaffold(tmp, {
        '.ralph/PROMPT.md': '# Prompt',
        'scripts/ralph/ralph.sh': '#!/bin/bash',
      });
      const sig = fingerprint(tmp);
      expect(sig).not.toBeNull();
      expect(sig!.name).toBe('snarktank-dotralph');
      expect(sig!.root).toBe('.ralph');
    } finally {
      fs.rmSync(tmp, { recursive: true });
    }
  });

  it('returns null for unknown layout', () => {
    const tmp = tmpDir('unknown');
    try {
      scaffold(tmp, { 'random.txt': 'hello' });
      expect(fingerprint(tmp)).toBeNull();
    } finally {
      fs.rmSync(tmp, { recursive: true });
    }
  });
});

describe('detect (three-tier)', () => {
  it('tier 1: declaration wins over fingerprint', () => {
    const tmp = tmpDir('decl-wins');
    try {
      scaffold(tmp, {
        '.ralph-kit.json': JSON.stringify({ root: 'custom-root' }),
        '.ralphrc': 'ALLOWED_TOOLS="Write"',
        '.ralph/fix_plan.md': '# Fix Plan',
      });
      const result = detect(tmp);
      expect(result).not.toBeNull();
      expect(result!.tier).toBe('declaration');
      expect(result!.profile.root).toBe('custom-root');
    } finally {
      fs.rmSync(tmp, { recursive: true });
    }
  });

  it('tier 2: fingerprint when no declaration', () => {
    const tmp = tmpDir('fp-only');
    try {
      scaffold(tmp, {
        'scripts/ralph/ralph.sh': '#!/bin/bash',
        'scripts/ralph/prd.json': '{}',
      });
      const result = detect(tmp);
      expect(result).not.toBeNull();
      expect(result!.tier).toBe('fingerprint');
      expect(result!.implementation).toBe('snarktank');
    } finally {
      fs.rmSync(tmp, { recursive: true });
    }
  });

  it('returns null when nothing matches (tier 3 fallback)', () => {
    const tmp = tmpDir('nothing');
    try {
      expect(detect(tmp)).toBeNull();
    } finally {
      fs.rmSync(tmp, { recursive: true });
    }
  });
});

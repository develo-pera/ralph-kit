import { describe, it, expect } from 'vitest';

import { getFlavor, listFlavors } from './flavors';

describe('listFlavors', () => {
  it('returns at least 3 built-in flavors', () => {
    const flavors = listFlavors();
    expect(flavors.length).toBeGreaterThanOrEqual(3);
  });

  it('includes ralph-kit, frankbria, and snarktank', () => {
    const names = listFlavors().map((f) => f.name);
    expect(names).toContain('ralph-kit');
    expect(names).toContain('frankbria');
    expect(names).toContain('snarktank');
  });

  it('every flavor has required fields', () => {
    for (const f of listFlavors()) {
      expect(f.name).toBeTruthy();
      expect(f.displayName).toBeTruthy();
      expect(f.description).toBeTruthy();
      expect(f.branch).toBeTruthy();
      expect(f.root).toBeTruthy();
      expect(f.taskFile.file).toBeTruthy();
      expect(['markdown', 'json']).toContain(f.taskFile.format);
    }
  });
});

describe('getFlavor', () => {
  it('returns a flavor by name', () => {
    const f = getFlavor('snarktank');
    expect(f).toBeDefined();
    expect(f!.repo).toBe('snarktank/ralph');
  });

  it('returns undefined for unknown flavor', () => {
    expect(getFlavor('nonexistent')).toBeUndefined();
  });

  it('ralph-kit flavor has no repo (built-in)', () => {
    const f = getFlavor('ralph-kit');
    expect(f).toBeDefined();
    expect(f!.repo).toBeNull();
    expect(f!.filesToClone).toHaveLength(0);
  });

  it('frankbria flavor has clone mappings', () => {
    const f = getFlavor('frankbria');
    expect(f).toBeDefined();
    expect(f!.filesToClone.length).toBeGreaterThan(0);
    expect(f!.repo).toBe('frankbria/ralph-claude-code');
  });
});

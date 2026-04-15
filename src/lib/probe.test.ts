import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { probe, findRootCandidates } from './probe';

const FIXTURES = path.join(__dirname, '..', '..', 'fixtures', 'profiles');
const HIDDEN_FULL = path.join(FIXTURES, 'hidden-ralph-full', 'ralph-project');
const VISIBLE_MD = path.join(FIXTURES, 'visible-ralph-markdown', 'ralph-project');
const PROGRESS_ONLY = path.join(FIXTURES, 'progress-only', 'ralph-project');
const EMPTY_MD = path.join(FIXTURES, 'empty-markdown', 'ralph-project');

describe('findRootCandidates', () => {
  it('finds .ralph/ when present', () => {
    expect(findRootCandidates(HIDDEN_FULL)).toEqual(['.ralph']);
  });

  it('finds ralph/ (non-dotfile) when present', () => {
    expect(findRootCandidates(VISIBLE_MD)).toEqual(['ralph']);
  });

  it('returns empty for a dir with no Ralph project', () => {
    expect(findRootCandidates(FIXTURES)).toEqual([]);
  });
});

describe('probe', () => {
  it('reports full fixture with JSON loop source, breaker, live log', () => {
    const r = probe(HIDDEN_FULL);
    expect(r.rootName).toBe('.ralph');
    expect(r.hasMarkdownTrio).toBe(true);
    expect(r.fixPlanSections).toEqual(['High Priority', 'Medium Priority', 'Blocked', 'Completed']);

    const names = r.files.map((f) => f.name).sort();
    expect(names).toContain('status.json');
    expect(names).toContain('progress.json');
    expect(names).toContain('.circuit_breaker_state');
    expect(names).toContain('live.log');

    const status = r.files.find((f) => f.name === 'status.json');
    expect(status?.jsonShape?.loop_count).toBe('number');
    expect(status?.jsonShape?.status).toBe('string');

    const breaker = r.files.find((f) => f.name === '.circuit_breaker_state');
    expect(breaker?.jsonShape?.state).toBe('string');
    expect(breaker?.jsonValues?.state).toBe('OPEN');
  });

  it('reports visible-ralph-markdown with no JSON', () => {
    const r = probe(VISIBLE_MD);
    expect(r.rootName).toBe('ralph');
    expect(r.hasMarkdownTrio).toBe(true);
    expect(r.files.some((f) => f.type === 'json')).toBe(false);
    expect(r.fixPlanSections).toEqual(['Now', 'Later', 'Shipped']);
  });

  it('reports progress-only with progress.json but no status.json', () => {
    const r = probe(PROGRESS_ONLY);
    expect(r.rootName).toBe('.ralph');
    expect(r.files.some((f) => f.name === 'status.json')).toBe(false);
    const progress = r.files.find((f) => f.name === 'progress.json');
    expect(progress?.jsonShape?.status).toBe('string');
  });

  it('reports empty-markdown with only markdown files', () => {
    const r = probe(EMPTY_MD);
    expect(r.rootName).toBe('.ralph');
    expect(r.hasMarkdownTrio).toBe(true);
    expect(r.files.some((f) => f.type === 'json')).toBe(false);
    expect(r.files.some((f) => f.type === 'log')).toBe(false);
  });
});

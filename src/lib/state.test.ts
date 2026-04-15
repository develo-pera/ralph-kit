import { describe, it, expect } from 'vitest';
import { parseBreakerState } from './state';

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

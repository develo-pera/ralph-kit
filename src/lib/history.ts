import fs from 'node:fs';
import path from 'node:path';

import { PROFILE_DIR } from './profile';
import { atomicWrite } from './writers';

export interface ResolvedEvent {
  text: string;
  source: 'breaker' | 'status';
  resolvedAt: string;
}

interface HistoryFile {
  resolved: ResolvedEvent[];
}

const HISTORY_FILE = 'history.json';

export function historyPath(cwd: string): string {
  return path.join(cwd, PROFILE_DIR, HISTORY_FILE);
}

export function loadHistory(cwd: string): HistoryFile {
  const p = historyPath(cwd);
  if (!fs.existsSync(p)) return { resolved: [] };
  try {
    const raw = JSON.parse(fs.readFileSync(p, 'utf8')) as Partial<HistoryFile>;
    return { resolved: Array.isArray(raw.resolved) ? raw.resolved : [] };
  } catch {
    return { resolved: [] };
  }
}

export function appendResolved(cwd: string, event: Omit<ResolvedEvent, 'resolvedAt'>): void {
  const history = loadHistory(cwd);
  history.resolved.push({
    ...event,
    resolvedAt: new Date().toISOString(),
  });
  atomicWrite(historyPath(cwd), JSON.stringify(history, null, 2) + '\n');
}

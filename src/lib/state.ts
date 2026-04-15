import fs from 'node:fs';
import path from 'node:path';

export interface ProgressJson {
  loop_count?: number;
  status?: string;
  [key: string]: unknown;
}

export interface StatusJson {
  loop_count?: number;
  status?: string;
  last_action?: string;
  [key: string]: unknown;
}

export interface Snapshot {
  status: StatusJson | null;
  progress: ProgressJson | null;
  breakerOpen: boolean;
  liveTail: string[];
  exists: boolean;
}

export function ralphDir(cwd?: string): string {
  return path.join(cwd || process.cwd(), '.ralph');
}

export function readJSON<T = unknown>(file: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch {
    return null;
  }
}

export function readText(file: string): string | null {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

export function snapshot(cwd: string): Snapshot {
  const dir = ralphDir(cwd);
  const status = readJSON<StatusJson>(path.join(dir, 'status.json'));
  const progress = readJSON<ProgressJson>(path.join(dir, 'progress.json'));
  const cbRaw = readText(path.join(dir, '.circuit_breaker_state')) || '';
  const breakerOpen =
    /"state"\s*:\s*"OPEN"/i.test(cbRaw) || /\bOPEN\b/.test(cbRaw.split('\n')[0] || '');
  const liveLog = readText(path.join(dir, 'live.log')) || '';
  const tail = liveLog.split('\n').filter(Boolean).slice(-20);
  return {
    status,
    progress,
    breakerOpen,
    liveTail: tail,
    exists: fs.existsSync(dir),
  };
}

export function watchedPaths(cwd: string): string[] {
  const dir = ralphDir(cwd);
  return [
    path.join(dir, 'fix_plan.md'),
    path.join(dir, 'backlog.md'),
    path.join(dir, 'PROMPT.md'),
    path.join(dir, 'specs'),
    path.join(dir, 'status.json'),
    path.join(dir, 'progress.json'),
    path.join(dir, '.circuit_breaker_state'),
    path.join(dir, 'live.log'),
  ];
}

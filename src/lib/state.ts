import fs from 'node:fs';
import path from 'node:path';

import type { Profile } from './profile';
import { defaultProfile, profileFilePaths } from './profile';

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
  breakerReason: string | null;
  liveTail: string[];
  exists: boolean;
}

interface BreakerState {
  open: boolean;
  reason: string | null;
}

export function parseBreakerState(
  raw: string | null | undefined,
  options: { openPattern?: string; reasonField?: string } = {},
): BreakerState {
  if (!raw) return { open: false, reason: null };
  const openRe = new RegExp(options.openPattern ?? 'OPEN', 'i');
  const reasonKey = options.reasonField ?? 'reason';
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>;
    if (obj && typeof obj.state === 'string') {
      const reasonVal = obj[reasonKey];
      return {
        open: openRe.test(obj.state),
        reason:
          typeof reasonVal === 'string' && reasonVal.trim() ? reasonVal.trim() : null,
      };
    }
  } catch {
    /* fall through */
  }
  return {
    open: /\bOPEN\b/.test(raw.split('\n')[0] || ''),
    reason: null,
  };
}

export function ralphDir(cwd: string, profile: Profile = defaultProfile()): string {
  return path.join(cwd, profile.root);
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

function pickField<T>(
  obj: Record<string, unknown> | null,
  field: string | undefined,
  guard: (v: unknown) => v is T,
): T | null {
  if (!obj || !field) return null;
  const v = obj[field];
  return guard(v) ? v : null;
}

export function snapshot(cwd: string, profile: Profile = defaultProfile()): Snapshot {
  const dir = ralphDir(cwd, profile);

  const loop = profile.loop;
  const status = loop ? readJSON<StatusJson>(path.join(dir, loop.file)) : null;
  const progress = loop?.fallback
    ? readJSON<ProgressJson>(path.join(dir, loop.fallback.file))
    : null;

  const breakerConf = profile.breaker;
  const cbRaw = breakerConf ? readText(path.join(dir, breakerConf.file)) : null;
  const breaker = parseBreakerState(cbRaw, {
    openPattern: breakerConf?.openPattern,
    reasonField: breakerConf?.reasonField,
  });

  const logConf = profile.liveLog;
  const liveLog = logConf ? readText(path.join(dir, logConf.file)) || '' : '';
  const tailN = logConf?.tailLines ?? 20;
  const tail = liveLog.split('\n').filter(Boolean).slice(-tailN);

  return {
    status,
    progress,
    breakerOpen: breaker.open,
    breakerReason: breaker.reason,
    liveTail: tail,
    exists: fs.existsSync(dir),
  };
}

export function extractLoopState(
  snap: Snapshot,
  profile: Profile = defaultProfile(),
): { loopCount: number | null; loopStatus: string | null } {
  const loop = profile.loop;
  const isNumber = (v: unknown): v is number => typeof v === 'number';
  const isString = (v: unknown): v is string => typeof v === 'string';

  const loopCount =
    pickField(snap.status as unknown as Record<string, unknown> | null, loop?.countField, isNumber) ??
    pickField(
      snap.progress as unknown as Record<string, unknown> | null,
      loop?.fallback?.countField,
      isNumber,
    );

  const loopStatus =
    pickField(snap.status as unknown as Record<string, unknown> | null, loop?.statusField, isString) ??
    pickField(
      snap.progress as unknown as Record<string, unknown> | null,
      loop?.fallback?.statusField,
      isString,
    );

  return { loopCount, loopStatus };
}

export function watchedPaths(cwd: string, profile: Profile = defaultProfile()): string[] {
  const dir = ralphDir(cwd, profile);
  const always = [
    path.join(dir, 'PROMPT.md'),
    path.join(dir, 'AGENT.md'),
    path.join(dir, 'fix_plan.md'),
    path.join(dir, 'backlog.md'),
    path.join(dir, 'specs'),
  ];
  const derived = profileFilePaths(cwd, profile);
  return Array.from(new Set([...always, ...derived]));
}

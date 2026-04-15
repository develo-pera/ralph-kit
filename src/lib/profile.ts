import fs from 'node:fs';
import path from 'node:path';

import { atomicWrite } from './writers';

export const PROFILE_DIR = '.ralph-kit';
export const PROFILE_FILE = 'profile.json';
export const PROFILE_VERSION = 1 as const;

export interface LoopProfile {
  file: string;
  countField?: string;
  statusField?: string;
  fallback?: { file: string; countField?: string; statusField?: string };
}

export interface BreakerProfile {
  file: string;
  openPattern?: string;
  reasonField?: string;
}

export interface LiveLogProfile {
  file: string;
  tailLines?: number;
}

export interface FixPlanProfile {
  blockedSections?: string[];
  highSections?: string[];
  completedSections?: string[];
}

export interface Profile {
  version: typeof PROFILE_VERSION;
  root: string;
  loop?: LoopProfile;
  breaker?: BreakerProfile;
  liveLog?: LiveLogProfile;
  fixPlan?: FixPlanProfile;
  promptTemplateMarkers?: string[];
  watch?: string[];
}

export function defaultProfile(): Profile {
  return {
    version: PROFILE_VERSION,
    root: '.ralph',
    loop: {
      file: 'status.json',
      countField: 'loop_count',
      statusField: 'status',
      fallback: {
        file: 'progress.json',
        countField: 'loop_count',
        statusField: 'status',
      },
    },
    breaker: {
      file: '.circuit_breaker_state',
      reasonField: 'reason',
    },
    liveLog: {
      file: 'live.log',
      tailLines: 20,
    },
    fixPlan: {
      blockedSections: ['Blocked'],
      highSections: ['High Priority'],
      completedSections: ['Completed'],
    },
    promptTemplateMarkers: [
      'Project Type:** unknown',
      'Review the codebase and understand the current state',
    ],
  };
}

export function profilePath(cwd: string): string {
  return path.join(cwd, PROFILE_DIR, PROFILE_FILE);
}

const cache = new Map<string, Profile>();

export function loadProfile(cwd: string): Profile {
  const cached = cache.get(cwd);
  if (cached) return cached;

  const p = profilePath(cwd);
  if (fs.existsSync(p)) {
    try {
      const raw = fs.readFileSync(p, 'utf8');
      const parsed = JSON.parse(raw) as Partial<Profile>;
      if (parsed && typeof parsed.version === 'number' && parsed.version !== PROFILE_VERSION) {
        throw new Error(
          `${PROFILE_DIR}/${PROFILE_FILE} uses schema version ${parsed.version}; this ralph-kit expects ${PROFILE_VERSION}. Re-run 'ralph-kit map --force' to regenerate.`,
        );
      }
      if (parsed && typeof parsed.root === 'string') {
        const merged = { ...defaultProfile(), ...parsed, version: PROFILE_VERSION } as Profile;
        cache.set(cwd, merged);
        return merged;
      }
    } catch (err) {
      if (err instanceof Error && err.message.includes('schema version')) throw err;
      // fall through to default
    }
  }

  const fallback = defaultProfile();
  cache.set(cwd, fallback);
  return fallback;
}

export function writeProfile(cwd: string, profile: Profile): string {
  const dir = path.join(cwd, PROFILE_DIR);
  fs.mkdirSync(dir, { recursive: true });
  const target = profilePath(cwd);
  atomicWrite(target, JSON.stringify(profile, null, 2) + '\n');
  cache.delete(cwd);
  return target;
}

/** Test-only hook. */
export function clearProfileCache(): void {
  cache.clear();
}

/** Every filesystem path (absolute) referenced by a profile, for watcher derivation. */
export function profileFilePaths(cwd: string, profile: Profile): string[] {
  const root = path.join(cwd, profile.root);
  const paths: string[] = [];
  const add = (rel: string | undefined) => {
    if (rel) paths.push(path.join(root, rel));
  };

  if (profile.loop) {
    add(profile.loop.file);
    add(profile.loop.fallback?.file);
  }
  if (profile.breaker) add(profile.breaker.file);
  if (profile.liveLog) add(profile.liveLog.file);
  if (profile.watch) for (const w of profile.watch) add(w);

  return paths;
}

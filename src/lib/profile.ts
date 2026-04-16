import fs from 'node:fs';
import path from 'node:path';

import { atomicWrite } from './writers';
import type { ProbeResult, ProbedFile } from './probe';
import { probe } from './probe';
import { detect } from './fingerprint';

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
  /**
   * When true, breaker state is inferred from the loop status file
   * (e.g. status.json "status": "halted") rather than a dedicated breaker file.
   */
  fromStatus?: boolean;
  /** Field in status JSON whose value signals the breaker is open (default: "status"). */
  statusField?: string;
  /** Regex pattern to match the halted value (default: "halted|stopped|error"). */
  haltedPattern?: string;
  /** Field in status JSON containing the reason (default: "exit_reason"). */
  statusReasonField?: string;
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

export interface TaskFileProfile {
  file: string;
  format: 'markdown' | 'json';
}

export interface Profile {
  version: typeof PROFILE_VERSION;
  root: string;
  /** When set, tasks come from this file instead of fix_plan.md. */
  taskFile?: TaskFileProfile;
  /** Which known implementation was detected (e.g. 'frankbria', 'snarktank'). */
  implementation?: string;
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

const LOOP_COUNT_FIELDS = ['loop_count', 'loopCount', 'count', 'iteration'];
const LOOP_STATUS_FIELDS = ['status', 'state', 'phase'];
const BREAKER_NAME_RE = /breaker|circuit|halt/i;
const BREAKER_STATE_VALUES = /^(OPEN|CLOSED|HALF[-_]?OPEN)$/i;
const FILENAME_SPECIFICITY = (name: string): number =>
  name === 'status.json' ? 3 : name === 'state.json' ? 2 : name.endsWith('.json') ? 1 : 0;

function pickLoopCandidates(files: ProbedFile[]): ProbedFile[] {
  return files
    .filter((f) => f.type === 'json' && f.jsonShape)
    .filter((f) => LOOP_STATUS_FIELDS.some((k) => f.jsonShape?.[k] === 'string'))
    .sort((a, b) => {
      const aCount = LOOP_COUNT_FIELDS.some((k) => a.jsonShape?.[k] === 'number') ? 1 : 0;
      const bCount = LOOP_COUNT_FIELDS.some((k) => b.jsonShape?.[k] === 'number') ? 1 : 0;
      if (aCount !== bCount) return bCount - aCount;
      const aSpec = FILENAME_SPECIFICITY(a.name);
      const bSpec = FILENAME_SPECIFICITY(b.name);
      if (aSpec !== bSpec) return bSpec - aSpec;
      return a.name.localeCompare(b.name);
    });
}

interface BreakerDetection {
  kind: 'dedicated' | 'fromStatus';
  file: ProbedFile;
}

const HALTED_RE = /^(halted|stopped|error|failed|exited)$/i;

function pickBreaker(files: ProbedFile[]): BreakerDetection | null {
  // 1. Prefer a dedicated breaker file (e.g. .circuit_breaker_state with state: OPEN/CLOSED)
  for (const f of files) {
    if (!BREAKER_NAME_RE.test(f.name)) continue;
    if (f.type !== 'json' || !f.jsonShape) continue;
    if (f.jsonShape.state !== 'string') continue;
    const stateValue = f.jsonValues?.state;
    if (typeof stateValue !== 'string' || !BREAKER_STATE_VALUES.test(stateValue)) continue;
    return { kind: 'dedicated', file: f };
  }

  // 2. Fall back: check if status.json signals halted with an exit_reason
  //    (common pattern: { status: "halted", exit_reason: "permission_denied" })
  for (const f of files) {
    if (f.type !== 'json' || !f.jsonShape) continue;
    if (f.jsonShape.status !== 'string') continue;
    const statusVal = f.jsonValues?.status;
    if (typeof statusVal !== 'string' || !HALTED_RE.test(statusVal)) continue;
    // Must have some kind of reason/exit field to distinguish from normal status
    const hasReason = f.jsonShape.exit_reason === 'string'
      || f.jsonShape.reason === 'string'
      || f.jsonShape.error === 'string';
    if (!hasReason) continue;
    return { kind: 'fromStatus', file: f };
  }

  return null;
}

function pickLiveLog(files: ProbedFile[]): ProbedFile | null {
  return (
    files.find((f) => f.name === 'live.log') ??
    files.find((f) => f.type === 'log') ??
    null
  );
}

function classifySection(name: string): 'blocked' | 'high' | 'completed' | null {
  if (/blocked/i.test(name)) return 'blocked';
  if (/complete|done|shipped/i.test(name)) return 'completed';
  if (/high|now|next|doing/i.test(name)) return 'high';
  return null;
}

function pickLoopFields(file: ProbedFile): { countField?: string; statusField?: string } {
  const out: { countField?: string; statusField?: string } = {};
  for (const k of LOOP_STATUS_FIELDS) {
    if (file.jsonShape?.[k] === 'string') {
      out.statusField = k;
      break;
    }
  }
  for (const k of LOOP_COUNT_FIELDS) {
    if (file.jsonShape?.[k] === 'number') {
      out.countField = k;
      break;
    }
  }
  return out;
}

export function generateProfile(result: ProbeResult): Profile {
  const root = result.rootName ?? '.ralph';
  const profile: Profile = { version: PROFILE_VERSION, root };

  const loopCandidates = pickLoopCandidates(result.files);
  if (loopCandidates.length > 0) {
    const primary = loopCandidates[0];
    profile.loop = {
      file: primary.name,
      ...pickLoopFields(primary),
    };
    const secondary = loopCandidates.find((f) => f.name !== primary.name);
    if (secondary) {
      profile.loop.fallback = {
        file: secondary.name,
        ...pickLoopFields(secondary),
      };
    }
  }

  const breakerDetection = pickBreaker(result.files);
  if (breakerDetection) {
    if (breakerDetection.kind === 'dedicated') {
      profile.breaker = {
        file: breakerDetection.file.name,
        reasonField: breakerDetection.file.jsonShape?.reason === 'string' ? 'reason' : undefined,
      };
    } else {
      // fromStatus: breaker state is inferred from the loop status file
      const f = breakerDetection.file;
      const reasonField = f.jsonShape?.exit_reason === 'string' ? 'exit_reason'
        : f.jsonShape?.reason === 'string' ? 'reason'
        : f.jsonShape?.error === 'string' ? 'error'
        : undefined;
      profile.breaker = {
        file: f.name,
        fromStatus: true,
        statusField: 'status',
        haltedPattern: 'halted|stopped|error|failed|exited',
        statusReasonField: reasonField,
      };
    }
  }

  const logFile = pickLiveLog(result.files);
  if (logFile) {
    profile.liveLog = { file: logFile.name };
  }

  if (result.fixPlanSections.length > 0) {
    const fp: Profile['fixPlan'] = {};
    for (const name of result.fixPlanSections) {
      const bucket = classifySection(name);
      if (bucket === 'blocked') (fp.blockedSections ??= []).push(name);
      else if (bucket === 'high') (fp.highSections ??= []).push(name);
      else if (bucket === 'completed') (fp.completedSections ??= []).push(name);
    }
    if (fp.blockedSections || fp.highSections || fp.completedSections) {
      profile.fixPlan = fp;
    }
  }

  // Keep the current default-marker set as a starting point; user can edit the written profile.
  profile.promptTemplateMarkers = [...(defaultProfile().promptTemplateMarkers ?? [])];

  return profile;
}

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
        const merged: Profile = { ...parsed, version: PROFILE_VERSION, root: parsed.root };
        cache.set(cwd, merged);
        return merged;
      }
    } catch (err) {
      if (err instanceof Error && err.message.includes('schema version')) throw err;
      // fall through to auto-generation
    }
  }

  // Tier 1 & 2: declaration file or known implementation fingerprint
  const detected = detect(cwd);
  if (detected) {
    const profile = detected.profile;
    if (detected.implementation) profile.implementation = detected.implementation;
    cache.set(cwd, profile);
    return profile;
  }

  // Tier 3: heuristic probe
  const generated = generateProfile(probe(cwd));
  cache.set(cwd, generated);
  return generated;
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

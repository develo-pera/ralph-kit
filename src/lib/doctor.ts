import fs from 'node:fs';
import path from 'node:path';

import { promptTemplate, fixPlanTemplate, agentTemplate } from './templates';
import { defaultContent as backlogDefaultContent } from './backlog_parser';
import type { Profile } from './profile';
import { defaultProfile } from './profile';

const BUILTIN_PROMPT_MARKERS = [
  'Project Type:** unknown',
  'Review the codebase and understand the current state',
] as const;

export type DoctorState = 'missing' | 'uninitialized' | 'initialized';

export interface DoctorReport {
  state: DoctorState;
  cwd: string;
  reasons: string[];
  files?: {
    prompt: boolean;
    fixPlan: boolean;
    agent: boolean;
    backlog: boolean;
    specsDir: boolean;
    ralphrc: boolean;
  };
  flags?: {
    promptCustomized: boolean;
    fixPlanReady: boolean;
    hasSpecs: boolean;
  };
}

export function ralphDir(cwd: string, profile: Profile = defaultProfile()): string {
  return path.join(cwd, profile.root);
}

export function inspect(cwd: string, profile: Profile = defaultProfile()): DoctorReport {
  const dir = ralphDir(cwd, profile);
  if (!fs.existsSync(dir)) {
    return { state: 'missing', cwd, reasons: [`${profile.root}/ directory not found`] };
  }

  const promptPath = path.join(dir, 'PROMPT.md');
  const fixPlanPath = path.join(dir, 'fix_plan.md');
  const agentPath = path.join(dir, 'AGENT.md');
  const specsDir = path.join(dir, 'specs');
  const backlogPath = path.join(dir, 'backlog.md');
  const rcPath = path.join(cwd, '.ralphrc');

  const markers = profile.promptTemplateMarkers ?? BUILTIN_PROMPT_MARKERS;

  const reasons: string[] = [];
  let promptCustomized = false;
  if (fs.existsSync(promptPath)) {
    const txt = fs.readFileSync(promptPath, 'utf8');
    promptCustomized = markers.length === 0 || !markers.some((m) => txt.includes(m));
    if (!promptCustomized) reasons.push('PROMPT.md still matches the default template');
  } else {
    reasons.push('PROMPT.md missing');
  }

  let fixPlanReady = false;
  if (fs.existsSync(fixPlanPath)) {
    const txt = fs.readFileSync(fixPlanPath, 'utf8');
    fixPlanReady = !/Status:\s*BLOCKED/i.test(txt);
    if (!fixPlanReady) reasons.push('fix_plan.md has Status: BLOCKED');
  } else {
    reasons.push('fix_plan.md missing');
  }

  let hasSpecs = false;
  if (fs.existsSync(specsDir) && fs.statSync(specsDir).isDirectory()) {
    hasSpecs = fs.readdirSync(specsDir).some((f) => f.endsWith('.md'));
  }
  if (!hasSpecs) reasons.push('no specs/*.md files');

  const initialized = promptCustomized && fixPlanReady && hasSpecs;

  return {
    state: initialized ? 'initialized' : 'uninitialized',
    cwd,
    reasons: initialized ? [] : reasons,
    files: {
      prompt: fs.existsSync(promptPath),
      fixPlan: fs.existsSync(fixPlanPath),
      agent: fs.existsSync(agentPath),
      backlog: fs.existsSync(backlogPath),
      specsDir: fs.existsSync(specsDir),
      ralphrc: fs.existsSync(rcPath),
    },
    flags: { promptCustomized, fixPlanReady, hasSpecs },
  };
}

export function scaffold(cwd: string, profile: Profile = defaultProfile()): string[] {
  const dir = ralphDir(cwd, profile);
  fs.mkdirSync(path.join(dir, 'specs'), { recursive: true });

  const writeIfMissing = (p: string, content: string): boolean => {
    if (!fs.existsSync(p)) {
      fs.writeFileSync(p, content);
      return true;
    }
    return false;
  };

  const created: string[] = [];
  if (writeIfMissing(path.join(dir, 'PROMPT.md'), promptTemplate())) created.push('PROMPT.md');
  if (writeIfMissing(path.join(dir, 'fix_plan.md'), fixPlanTemplate())) created.push('fix_plan.md');
  if (writeIfMissing(path.join(dir, 'AGENT.md'), agentTemplate())) created.push('AGENT.md');
  if (writeIfMissing(path.join(dir, 'backlog.md'), backlogDefaultContent())) created.push('backlog.md');
  return created;
}

export function ensureBacklog(cwd: string, profile: Profile = defaultProfile()): boolean {
  const p = path.join(ralphDir(cwd, profile), 'backlog.md');
  if (!fs.existsSync(p)) {
    fs.writeFileSync(p, backlogDefaultContent());
    return true;
  }
  return false;
}

import fs from 'node:fs';
import path from 'node:path';

import * as fixPlanParser from './fix_plan_parser';
import * as backlogParser from './backlog_parser';
import { atomicWrite, backup } from './writers';

export interface PairPaths {
  fixPlan: string;
  backlog: string;
}

export interface LoadedPair {
  fixPlanDoc: fixPlanParser.FixPlanDoc;
  backlogDoc: backlogParser.BacklogDoc;
  paths: PairPaths;
}

export function paths(cwd: string): PairPaths {
  const dir = path.join(cwd, '.ralph');
  return {
    fixPlan: path.join(dir, 'fix_plan.md'),
    backlog: path.join(dir, 'backlog.md'),
  };
}

export function loadPair(cwd: string): LoadedPair {
  const { fixPlan, backlog } = paths(cwd);
  const fpText = fs.existsSync(fixPlan) ? fs.readFileSync(fixPlan, 'utf8') : '';
  const bkText = fs.existsSync(backlog) ? fs.readFileSync(backlog, 'utf8') : backlogParser.defaultContent();
  return {
    fixPlanDoc: fixPlanParser.parse(fpText || '# Ralph Fix Plan\n'),
    backlogDoc: backlogParser.parse(bkText),
    paths: { fixPlan, backlog },
  };
}

export function writePair(
  cwd: string,
  fixPlanDoc: fixPlanParser.FixPlanDoc,
  backlogDoc: backlogParser.BacklogDoc,
): void {
  const { fixPlan, backlog } = paths(cwd);
  const fpBackup = backup(fixPlan);
  const bkBackup = backup(backlog);
  try {
    atomicWrite(fixPlan, fixPlanParser.serialize(fixPlanDoc));
    atomicWrite(backlog, backlogParser.serialize(backlogDoc));
  } catch (err) {
    if (fpBackup && fs.existsSync(fpBackup)) fs.copyFileSync(fpBackup, fixPlan);
    if (bkBackup && fs.existsSync(bkBackup)) fs.copyFileSync(bkBackup, backlog);
    throw err;
  }
}

export function promoteToTodo(cwd: string, text: string): { ok: true } {
  const { fixPlanDoc, backlogDoc } = loadPair(cwd);
  const removed = backlogParser.removeTask(backlogDoc, text);
  if (!removed) throw new Error(`Task not found in backlog: ${text}`);
  fixPlanParser.addTask(fixPlanDoc, 'High Priority', text);
  writePair(cwd, fixPlanDoc, backlogDoc);
  return { ok: true };
}

export function demoteToBacklog(cwd: string, text: string): { ok: true } {
  const { fixPlanDoc, backlogDoc } = loadPair(cwd);
  let found = false;
  for (const section of Object.keys(fixPlanDoc.sections)) {
    const idx = fixPlanDoc.sections[section].findIndex((t) => t.text === text);
    if (idx >= 0) {
      fixPlanDoc.sections[section].splice(idx, 1);
      found = true;
      break;
    }
  }
  if (!found) throw new Error(`Task not found in fix_plan: ${text}`);
  backlogParser.addTask(backlogDoc, text, 'Ideas');
  writePair(cwd, fixPlanDoc, backlogDoc);
  return { ok: true };
}

import fs from 'node:fs';
import path from 'node:path';
import express, { Router, Request, Response } from 'express';
import chokidar from 'chokidar';

import * as fixPlanParser from '../lib/fix_plan_parser';
import * as backlogParser from '../lib/backlog_parser';
import * as state from '../lib/state';
import * as doctor from '../lib/doctor';
import * as promote from '../lib/promote';
import { atomicWrite, backup } from '../lib/writers';
import type { Profile } from '../lib/profile';
import { defaultProfile, loadProfile } from '../lib/profile';
import { loadHistory, appendResolved } from '../lib/history';

type ColumnId = 'backlog' | 'todo' | 'inProgress' | 'blocked' | 'done';

interface BoardCard {
  text: string;
  source: string;
  group?: string;
  priority?: string;
  done: boolean;
  kind?: 'banner';
}

interface BoardMeta {
  state: doctor.DoctorState;
  reasons: string[];
  blocked: boolean;
  liveTail: string[];
  loopCount: number | null;
  loopStatus: string | null;
  lastLiveLine: string | null;
}

interface Board {
  cwd: string;
  title: string | null;
  statusLine: string | null;
  columns: Record<ColumnId, BoardCard[]>;
  meta: BoardMeta;
}

function fixPlanPath(cwd: string, profile: Profile): string {
  return path.join(state.ralphDir(cwd, profile), 'fix_plan.md');
}

function backlogPath(cwd: string, profile: Profile): string {
  return path.join(state.ralphDir(cwd, profile), 'backlog.md');
}

function loadFixPlan(cwd: string, profile: Profile): fixPlanParser.FixPlanDoc | null {
  const p = fixPlanPath(cwd, profile);
  if (!fs.existsSync(p)) return null;
  return fixPlanParser.parse(fs.readFileSync(p, 'utf8'));
}

function loadBacklog(cwd: string, profile: Profile): backlogParser.BacklogDoc {
  const p = backlogPath(cwd, profile);
  if (!fs.existsSync(p)) return backlogParser.parse(backlogParser.defaultContent());
  return backlogParser.parse(fs.readFileSync(p, 'utf8'));
}

function saveFixPlan(cwd: string, doc: fixPlanParser.FixPlanDoc, profile: Profile): void {
  const p = fixPlanPath(cwd, profile);
  backup(p);
  atomicWrite(p, fixPlanParser.serialize(doc));
}

function saveBacklog(cwd: string, doc: backlogParser.BacklogDoc, profile: Profile): void {
  const p = backlogPath(cwd, profile);
  backup(p);
  atomicWrite(p, backlogParser.serialize(doc));
}

function nameMatchesAny(name: string, patterns: string[] | undefined, fallback: RegExp): boolean {
  if (patterns && patterns.length > 0) {
    return patterns.some((p) => name.toLowerCase() === p.toLowerCase());
  }
  return fallback.test(name);
}

function firstHighSection(profile: Profile): string {
  return profile.fixPlan?.highSections?.[0] ?? 'High Priority';
}

function firstBlockedSection(profile: Profile): string {
  return profile.fixPlan?.blockedSections?.[0] ?? 'Blocked';
}

interface PrevBlockedState {
  breakerOpen: boolean;
  breakerText: string | null;
  statusBlocked: boolean;
  statusText: string | null;
}

const prevState = new Map<string, PrevBlockedState>();

export function buildBoard(cwd: string, profile: Profile = defaultProfile()): Board {
  const snap = state.snapshot(cwd, profile);
  const health = doctor.inspect(cwd, profile);
  const { loopCount, loopStatus } = state.extractLoopState(snap, profile);

  const columns: Record<ColumnId, BoardCard[]> = {
    backlog: [],
    todo: [],
    inProgress: [],
    blocked: [],
    done: [],
  };

  const meta: BoardMeta = {
    state: health.state,
    reasons: health.reasons,
    blocked: false,
    liveTail: snap.liveTail,
    loopCount,
    loopStatus,
    lastLiveLine: snap.liveTail[snap.liveTail.length - 1] || null,
  };

  if (health.state === 'missing') {
    return { cwd, columns, meta, title: null, statusLine: null };
  }

  const fpDoc = loadFixPlan(cwd, profile);
  const bkDoc = loadBacklog(cwd, profile);

  for (const name of bkDoc.groupOrder) {
    for (const t of bkDoc.groups[name]) {
      if (t.done) columns.done.push({ text: t.text, source: 'backlog', group: name, done: true });
      else columns.backlog.push({ text: t.text, source: 'backlog', group: name, done: false });
    }
  }

  let statusLine: string | null = null;
  let statusBlocked = false;
  if (fpDoc) {
    statusLine = fpDoc.statusLine;
    const isProjectBlocked = !!statusLine && /blocked/i.test(statusLine);

    for (const name of fpDoc.sectionOrder) {
      const isBlocked = nameMatchesAny(name, profile.fixPlan?.blockedSections, /blocked/i);
      const isCompleted = nameMatchesAny(name, profile.fixPlan?.completedSections, /complete|done|shipped/i);
      for (const t of fpDoc.sections[name]) {
        const card: BoardCard = { text: t.text, source: 'fix_plan', priority: name, done: t.done };
        if (t.done || isCompleted) columns.done.push(card);
        else if (isBlocked) columns.blocked.push(card);
        else columns.todo.push(card);
      }
    }

    const running = /running/i.test(meta.loopStatus || '');
    if (running && columns.todo.length > 0) {
      columns.inProgress.push(columns.todo.shift()!);
    }

    if (isProjectBlocked && statusLine) {
      columns.blocked.unshift({
        text: statusLine,
        source: 'status',
        priority: 'Status',
        done: false,
        kind: 'banner',
      });
      meta.blocked = true;
      statusBlocked = true;
    }
  }

  const breakerText = snap.breakerOpen
    ? (snap.breakerReason ? `Ralph halted: ${snap.breakerReason}` : 'Circuit breaker OPEN — Ralph halted')
    : null;

  if (snap.breakerOpen && breakerText) {
    const breakerFile = profile.breaker
      ? path.join(profile.root, profile.breaker.file)
      : '.ralph/.circuit_breaker_state';
    columns.blocked.push({
      text: breakerText,
      source: 'breaker',
      priority: `Fix it, then delete ${breakerFile} to reset`,
      done: false,
      kind: 'banner',
    });
    meta.blocked = true;
  }

  const prev = prevState.get(cwd);
  if (prev) {
    if (prev.breakerOpen && !snap.breakerOpen && prev.breakerText) {
      appendResolved(cwd, { text: prev.breakerText, source: 'breaker' });
    }
    if (prev.statusBlocked && !statusBlocked && prev.statusText) {
      appendResolved(cwd, { text: prev.statusText, source: 'status' });
    }
  }
  prevState.set(cwd, {
    breakerOpen: snap.breakerOpen,
    breakerText,
    statusBlocked,
    statusText: statusBlocked ? statusLine : null,
  });

  const history = loadHistory(cwd);
  for (const event of history.resolved) {
    columns.done.push({
      text: `Resolved: ${event.text}`,
      source: event.source,
      priority: `Resolved ${new Date(event.resolvedAt).toLocaleDateString()}`,
      done: true,
      kind: 'banner',
    });
  }

  return {
    cwd,
    title: fpDoc && fpDoc.title,
    statusLine,
    columns,
    meta,
  };
}

function requireInitialized(cwd: string, res: Response, profile: Profile): boolean {
  const health = doctor.inspect(cwd, profile);
  if (health.state !== 'initialized') {
    res.status(409).json({ error: 'project-uninitialized', state: health.state, reasons: health.reasons });
    return false;
  }
  return true;
}

export function createRouter(cwd: string): Router {
  const router = express.Router();
  const profile = loadProfile(cwd);

  router.get('/board', (_req: Request, res: Response) => {
    res.json(buildBoard(cwd, profile));
  });

  router.get('/stream', (req: Request, res: Response) => {
    res.set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();

    const send = (): void => {
      try {
        res.write(`data: ${JSON.stringify(buildBoard(cwd, profile))}\n\n`);
      } catch {
        /* connection closed */
      }
    };

    send();
    const watcher = chokidar.watch(state.watchedPaths(cwd, profile), {
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 150, pollInterval: 50 },
    });
    watcher.on('all', () => send());

    const heartbeat = setInterval(() => {
      try {
        res.write(': ping\n\n');
      } catch {
        /* ignore */
      }
    }, 15000);

    req.on('close', () => {
      clearInterval(heartbeat);
      void watcher.close();
    });
  });

  router.post('/task', (req: Request, res: Response) => {
    if (!requireInitialized(cwd, res, profile)) return;
    const { text, destination } = (req.body || {}) as { text?: string; destination?: string };
    if (!text || !destination) {
      res.status(400).json({ error: 'text and destination required' });
      return;
    }

    if (destination === 'backlog') {
      const doc = loadBacklog(cwd, profile);
      backlogParser.addTask(doc, text, 'Ideas');
      saveBacklog(cwd, doc, profile);
    } else {
      const doc = loadFixPlan(cwd, profile);
      if (!doc) {
        res.status(404).json({ error: 'no fix_plan.md' });
        return;
      }
      const section = destination === 'blocked' ? firstBlockedSection(profile) : firstHighSection(profile);
      fixPlanParser.addTask(doc, section, text);
      saveFixPlan(cwd, doc, profile);
    }
    res.json({ ok: true });
  });

  router.post('/task/toggle', (req: Request, res: Response) => {
    if (!requireInitialized(cwd, res, profile)) return;
    const { text, source } = (req.body || {}) as { text?: string; source?: string };
    if (!text) {
      res.status(400).json({ error: 'text required' });
      return;
    }

    if (source === 'backlog') {
      const doc = loadBacklog(cwd, profile);
      if (!backlogParser.toggleTask(doc, text)) {
        res.status(404).json({ error: 'task not found' });
        return;
      }
      saveBacklog(cwd, doc, profile);
    } else {
      const doc = loadFixPlan(cwd, profile);
      if (!doc || !fixPlanParser.toggleTask(doc, text)) {
        res.status(404).json({ error: 'task not found' });
        return;
      }
      saveFixPlan(cwd, doc, profile);
    }
    res.json({ ok: true });
  });

  router.post('/task/move', (req: Request, res: Response) => {
    if (!requireInitialized(cwd, res, profile)) return;
    const { text, source, toColumn } = (req.body || {}) as {
      text?: string;
      source?: string;
      toColumn?: string;
    };
    if (!text || !toColumn) {
      res.status(400).json({ error: 'text and toColumn required' });
      return;
    }

    try {
      if (toColumn === 'done') {
        if (source === 'backlog') {
          const doc = loadBacklog(cwd, profile);
          if (!backlogParser.toggleTask(doc, text)) {
            res.status(404).json({ error: 'task not found' });
            return;
          }
          saveBacklog(cwd, doc, profile);
        } else {
          const doc = loadFixPlan(cwd, profile);
          if (!doc || !fixPlanParser.toggleTask(doc, text)) {
            res.status(404).json({ error: 'task not found' });
            return;
          }
          saveFixPlan(cwd, doc, profile);
        }
        res.json({ ok: true });
        return;
      }

      if (toColumn === 'backlog') {
        if (source === 'backlog') {
          res.json({ ok: true });
          return;
        }
        promote.demoteToBacklog(cwd, text, profile);
        res.json({ ok: true });
        return;
      }

      if (toColumn === 'todo' || toColumn === 'inProgress') {
        if (source === 'backlog') {
          promote.promoteToTodo(cwd, text, profile);
        } else {
          const doc = loadFixPlan(cwd, profile);
          if (!doc || !fixPlanParser.moveTask(doc, text, firstHighSection(profile))) {
            res.status(404).json({ error: 'task not found' });
            return;
          }
          saveFixPlan(cwd, doc, profile);
        }
        res.json({ ok: true });
        return;
      }

      if (toColumn === 'blocked') {
        if (source === 'backlog') {
          promote.promoteToTodo(cwd, text, profile);
          const doc = loadFixPlan(cwd, profile);
          if (doc) {
            fixPlanParser.moveTask(doc, text, firstBlockedSection(profile));
            saveFixPlan(cwd, doc, profile);
          }
        } else {
          const doc = loadFixPlan(cwd, profile);
          if (!doc || !fixPlanParser.moveTask(doc, text, firstBlockedSection(profile))) {
            res.status(404).json({ error: 'task not found' });
            return;
          }
          saveFixPlan(cwd, doc, profile);
        }
        res.json({ ok: true });
        return;
      }

      res.status(400).json({ error: `unknown toColumn: ${toColumn}` });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: msg });
    }
  });

  return router;
}

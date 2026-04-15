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

function fixPlanPath(cwd: string): string {
  return path.join(state.ralphDir(cwd), 'fix_plan.md');
}

function backlogPath(cwd: string): string {
  return path.join(state.ralphDir(cwd), 'backlog.md');
}

function loadFixPlan(cwd: string): fixPlanParser.FixPlanDoc | null {
  const p = fixPlanPath(cwd);
  if (!fs.existsSync(p)) return null;
  return fixPlanParser.parse(fs.readFileSync(p, 'utf8'));
}

function loadBacklog(cwd: string): backlogParser.BacklogDoc {
  const p = backlogPath(cwd);
  if (!fs.existsSync(p)) return backlogParser.parse(backlogParser.defaultContent());
  return backlogParser.parse(fs.readFileSync(p, 'utf8'));
}

function saveFixPlan(cwd: string, doc: fixPlanParser.FixPlanDoc): void {
  const p = fixPlanPath(cwd);
  backup(p);
  atomicWrite(p, fixPlanParser.serialize(doc));
}

function saveBacklog(cwd: string, doc: backlogParser.BacklogDoc): void {
  const p = backlogPath(cwd);
  backup(p);
  atomicWrite(p, backlogParser.serialize(doc));
}

export function buildBoard(cwd: string): Board {
  const snap = state.snapshot(cwd);
  const health = doctor.inspect(cwd);

  const columns: Record<ColumnId, BoardCard[]> = {
    backlog: [],
    todo: [],
    inProgress: [],
    blocked: [],
    done: [],
  };
  const pickNumber = (v: unknown): number | null => (typeof v === 'number' ? v : null);
  const pickString = (v: unknown): string | null => (typeof v === 'string' ? v : null);
  const loopCount =
    pickNumber(snap.status?.loop_count) ?? pickNumber(snap.progress?.loop_count);
  const loopStatus =
    pickString(snap.status?.status) ?? pickString(snap.progress?.status);

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

  const fpDoc = loadFixPlan(cwd);
  const bkDoc = loadBacklog(cwd);

  for (const name of bkDoc.groupOrder) {
    for (const t of bkDoc.groups[name]) {
      if (t.done) columns.done.push({ text: t.text, source: 'backlog', group: name, done: true });
      else columns.backlog.push({ text: t.text, source: 'backlog', group: name, done: false });
    }
  }

  let statusLine: string | null = null;
  if (fpDoc) {
    statusLine = fpDoc.statusLine;
    const isProjectBlocked = !!statusLine && /blocked/i.test(statusLine);

    for (const name of fpDoc.sectionOrder) {
      const isHigh = /high/i.test(name);
      const isBlocked = /blocked/i.test(name);
      const isCompleted = /completed/i.test(name);
      for (const t of fpDoc.sections[name]) {
        const card: BoardCard = { text: t.text, source: 'fix_plan', priority: name, done: t.done };
        if (t.done || isCompleted) columns.done.push(card);
        else if (isBlocked) columns.blocked.push(card);
        else if (isHigh) columns.todo.push(card);
        else columns.backlog.push(card);
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
    }
  }

  if (snap.breakerOpen) {
    columns.blocked.push({
      text: 'Circuit breaker OPEN — Ralph halted',
      source: 'breaker',
      priority: 'Breaker',
      done: false,
      kind: 'banner',
    });
    meta.blocked = true;
  }

  return {
    cwd,
    title: fpDoc && fpDoc.title,
    statusLine,
    columns,
    meta,
  };
}

function requireInitialized(cwd: string, res: Response): boolean {
  const health = doctor.inspect(cwd);
  if (health.state !== 'initialized') {
    res.status(409).json({ error: 'project-uninitialized', state: health.state, reasons: health.reasons });
    return false;
  }
  return true;
}

export function createRouter(cwd: string): Router {
  const router = express.Router();

  router.get('/board', (_req: Request, res: Response) => {
    res.json(buildBoard(cwd));
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
        res.write(`data: ${JSON.stringify(buildBoard(cwd))}\n\n`);
      } catch {
        /* connection closed */
      }
    };

    send();
    const watcher = chokidar.watch(state.watchedPaths(cwd), {
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
    if (!requireInitialized(cwd, res)) return;
    const { text, destination } = (req.body || {}) as { text?: string; destination?: string };
    if (!text || !destination) {
      res.status(400).json({ error: 'text and destination required' });
      return;
    }

    if (destination === 'backlog') {
      const doc = loadBacklog(cwd);
      backlogParser.addTask(doc, text, 'Ideas');
      saveBacklog(cwd, doc);
    } else {
      const doc = loadFixPlan(cwd);
      if (!doc) {
        res.status(404).json({ error: 'no fix_plan.md' });
        return;
      }
      const section = destination === 'blocked' ? 'Blocked' : 'High Priority';
      fixPlanParser.addTask(doc, section, text);
      saveFixPlan(cwd, doc);
    }
    res.json({ ok: true });
  });

  router.post('/task/toggle', (req: Request, res: Response) => {
    if (!requireInitialized(cwd, res)) return;
    const { text, source } = (req.body || {}) as { text?: string; source?: string };
    if (!text) {
      res.status(400).json({ error: 'text required' });
      return;
    }

    if (source === 'backlog') {
      const doc = loadBacklog(cwd);
      if (!backlogParser.toggleTask(doc, text)) {
        res.status(404).json({ error: 'task not found' });
        return;
      }
      saveBacklog(cwd, doc);
    } else {
      const doc = loadFixPlan(cwd);
      if (!doc || !fixPlanParser.toggleTask(doc, text)) {
        res.status(404).json({ error: 'task not found' });
        return;
      }
      saveFixPlan(cwd, doc);
    }
    res.json({ ok: true });
  });

  router.post('/task/move', (req: Request, res: Response) => {
    if (!requireInitialized(cwd, res)) return;
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
          const doc = loadBacklog(cwd);
          if (!backlogParser.toggleTask(doc, text)) {
            res.status(404).json({ error: 'task not found' });
            return;
          }
          saveBacklog(cwd, doc);
        } else {
          const doc = loadFixPlan(cwd);
          if (!doc || !fixPlanParser.toggleTask(doc, text)) {
            res.status(404).json({ error: 'task not found' });
            return;
          }
          saveFixPlan(cwd, doc);
        }
        res.json({ ok: true });
        return;
      }

      if (toColumn === 'backlog') {
        if (source === 'backlog') {
          res.json({ ok: true });
          return;
        }
        promote.demoteToBacklog(cwd, text);
        res.json({ ok: true });
        return;
      }

      if (toColumn === 'todo' || toColumn === 'inProgress') {
        if (source === 'backlog') {
          promote.promoteToTodo(cwd, text);
        } else {
          const doc = loadFixPlan(cwd);
          if (!doc || !fixPlanParser.moveTask(doc, text, 'High Priority')) {
            res.status(404).json({ error: 'task not found' });
            return;
          }
          saveFixPlan(cwd, doc);
        }
        res.json({ ok: true });
        return;
      }

      if (toColumn === 'blocked') {
        if (source === 'backlog') {
          promote.promoteToTodo(cwd, text);
          const doc = loadFixPlan(cwd);
          if (doc) {
            fixPlanParser.moveTask(doc, text, 'Blocked');
            saveFixPlan(cwd, doc);
          }
        } else {
          const doc = loadFixPlan(cwd);
          if (!doc || !fixPlanParser.moveTask(doc, text, 'Blocked')) {
            res.status(404).json({ error: 'task not found' });
            return;
          }
          saveFixPlan(cwd, doc);
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

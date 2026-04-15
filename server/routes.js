'use strict';

const fs = require('fs');
const path = require('path');
const express = require('express');
const chokidar = require('chokidar');

const fixPlanParser = require('../lib/fix_plan_parser');
const backlogParser = require('../lib/backlog_parser');
const state = require('../lib/state');
const doctor = require('../lib/doctor');
const promote = require('../lib/promote');
const { atomicWrite, backup } = require('../lib/writers');

function fixPlanPath(cwd) {
  return path.join(state.ralphDir(cwd), 'fix_plan.md');
}
function backlogPath(cwd) {
  return path.join(state.ralphDir(cwd), 'backlog.md');
}

function loadFixPlan(cwd) {
  const p = fixPlanPath(cwd);
  if (!fs.existsSync(p)) return null;
  return fixPlanParser.parse(fs.readFileSync(p, 'utf8'));
}

function loadBacklog(cwd) {
  const p = backlogPath(cwd);
  if (!fs.existsSync(p)) return backlogParser.parse(backlogParser.defaultContent());
  return backlogParser.parse(fs.readFileSync(p, 'utf8'));
}

function saveFixPlan(cwd, doc) {
  const p = fixPlanPath(cwd);
  backup(p);
  atomicWrite(p, fixPlanParser.serialize(doc));
}

function saveBacklog(cwd, doc) {
  const p = backlogPath(cwd);
  backup(p);
  atomicWrite(p, backlogParser.serialize(doc));
}

function buildBoard(cwd) {
  const snap = state.snapshot(cwd);
  const health = doctor.inspect(cwd);

  const columns = { backlog: [], todo: [], inProgress: [], blocked: [], done: [] };
  const meta = {
    state: health.state,
    reasons: health.reasons,
    blocked: false,
    liveTail: snap.liveTail,
    loopCount: snap.progress && snap.progress.loop_count,
    loopStatus: snap.progress && snap.progress.status,
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

  let statusLine = null;
  if (fpDoc) {
    statusLine = fpDoc.statusLine;
    const isProjectBlocked = !!statusLine && /blocked/i.test(statusLine);

    for (const name of fpDoc.sectionOrder) {
      const isHigh = /high/i.test(name);
      const isBlocked = /blocked/i.test(name);
      const isCompleted = /completed/i.test(name);
      for (const t of fpDoc.sections[name]) {
        const card = { text: t.text, source: 'fix_plan', priority: name, done: t.done };
        if (t.done || isCompleted) columns.done.push(card);
        else if (isBlocked) columns.blocked.push(card);
        else if (isHigh) columns.todo.push(card);
        else columns.backlog.push(card);
      }
    }

    const running = /running/i.test(meta.loopStatus || '');
    if (running && columns.todo.length > 0) {
      columns.inProgress.push(columns.todo.shift());
    }

    if (isProjectBlocked) {
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

function requireInitialized(cwd, res) {
  const health = doctor.inspect(cwd);
  if (health.state !== 'initialized') {
    res.status(409).json({ error: 'project-uninitialized', state: health.state, reasons: health.reasons });
    return false;
  }
  return true;
}

function createRouter(cwd) {
  const router = express.Router();

  router.get('/board', (req, res) => {
    res.json(buildBoard(cwd));
  });

  router.get('/stream', (req, res) => {
    res.set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();

    const send = () => {
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
      watcher.close();
    });
  });

  router.post('/task', (req, res) => {
    if (!requireInitialized(cwd, res)) return;
    const { text, destination } = req.body || {};
    if (!text || !destination) return res.status(400).json({ error: 'text and destination required' });

    if (destination === 'backlog') {
      const doc = loadBacklog(cwd);
      backlogParser.addTask(doc, text, 'Ideas');
      saveBacklog(cwd, doc);
    } else {
      const doc = loadFixPlan(cwd);
      if (!doc) return res.status(404).json({ error: 'no fix_plan.md' });
      const section = destination === 'blocked' ? 'Blocked' : 'High Priority';
      fixPlanParser.addTask(doc, section, text);
      saveFixPlan(cwd, doc);
    }
    res.json({ ok: true });
  });

  router.post('/task/toggle', (req, res) => {
    if (!requireInitialized(cwd, res)) return;
    const { text, source } = req.body || {};
    if (!text) return res.status(400).json({ error: 'text required' });

    if (source === 'backlog') {
      const doc = loadBacklog(cwd);
      if (!backlogParser.toggleTask(doc, text)) return res.status(404).json({ error: 'task not found' });
      saveBacklog(cwd, doc);
    } else {
      const doc = loadFixPlan(cwd);
      if (!doc || !fixPlanParser.toggleTask(doc, text)) return res.status(404).json({ error: 'task not found' });
      saveFixPlan(cwd, doc);
    }
    res.json({ ok: true });
  });

  router.post('/task/move', (req, res) => {
    if (!requireInitialized(cwd, res)) return;
    const { text, source, toColumn } = req.body || {};
    if (!text || !toColumn) return res.status(400).json({ error: 'text and toColumn required' });

    try {
      if (toColumn === 'done') {
        if (source === 'backlog') {
          const doc = loadBacklog(cwd);
          if (!backlogParser.toggleTask(doc, text)) return res.status(404).json({ error: 'task not found' });
          saveBacklog(cwd, doc);
        } else {
          const doc = loadFixPlan(cwd);
          if (!doc || !fixPlanParser.toggleTask(doc, text)) return res.status(404).json({ error: 'task not found' });
          saveFixPlan(cwd, doc);
        }
        return res.json({ ok: true });
      }

      if (toColumn === 'backlog') {
        if (source === 'backlog') return res.json({ ok: true });
        promote.demoteToBacklog(cwd, text);
        return res.json({ ok: true });
      }

      if (toColumn === 'todo' || toColumn === 'inProgress') {
        if (source === 'backlog') promote.promoteToTodo(cwd, text);
        else {
          const doc = loadFixPlan(cwd);
          if (!doc || !fixPlanParser.moveTask(doc, text, 'High Priority'))
            return res.status(404).json({ error: 'task not found' });
          saveFixPlan(cwd, doc);
        }
        return res.json({ ok: true });
      }

      if (toColumn === 'blocked') {
        if (source === 'backlog') {
          promote.promoteToTodo(cwd, text);
          const doc = loadFixPlan(cwd);
          fixPlanParser.moveTask(doc, text, 'Blocked');
          saveFixPlan(cwd, doc);
        } else {
          const doc = loadFixPlan(cwd);
          if (!doc || !fixPlanParser.moveTask(doc, text, 'Blocked'))
            return res.status(404).json({ error: 'task not found' });
          saveFixPlan(cwd, doc);
        }
        return res.json({ ok: true });
      }

      res.status(400).json({ error: `unknown toColumn: ${toColumn}` });
    } catch (err) {
      res.status(500).json({ error: String(err.message || err) });
    }
  });

  return router;
}

module.exports = { createRouter, buildBoard };

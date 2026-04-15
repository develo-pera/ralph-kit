'use strict';

const fs = require('fs');
const path = require('path');
const express = require('express');
const chokidar = require('chokidar');

const parser = require('../lib/fix_plan_parser');
const state = require('../lib/state');
const { atomicWrite, backup } = require('../lib/writers');

function fixPlanPath(cwd) {
  return path.join(state.ralphDir(cwd), 'fix_plan.md');
}

function loadDoc(cwd) {
  const p = fixPlanPath(cwd);
  if (!fs.existsSync(p)) return null;
  return parser.parse(fs.readFileSync(p, 'utf8'));
}

function saveDoc(cwd, doc) {
  const p = fixPlanPath(cwd);
  backup(p);
  atomicWrite(p, parser.serialize(doc));
}

function buildBoard(cwd) {
  const snap = state.snapshot(cwd);
  const doc = loadDoc(cwd);
  if (!doc) {
    return {
      error: 'no-fix-plan',
      cwd,
      ralphExists: snap.exists,
      columns: { upNext: [], inProgress: [], backlog: [], done: [], blocked: [] },
      meta: { blocked: false, liveTail: snap.liveTail },
    };
  }
  const cols = parser.toBoard(doc);
  if (snap.breakerOpen) {
    cols.blocked.push({ text: 'Circuit breaker OPEN', priority: 'Breaker', done: false });
  }
  return {
    cwd,
    title: doc.title,
    statusLine: doc.statusLine,
    columns: cols,
    meta: {
      blocked: cols.blocked.length > 0,
      liveTail: snap.liveTail,
      loopCount: snap.progress && snap.progress.loop_count,
      status: snap.progress && snap.progress.status,
    },
  };
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
    const { text, priority } = req.body || {};
    if (!text || !priority) return res.status(400).json({ error: 'text and priority required' });
    const doc = loadDoc(cwd);
    if (!doc) return res.status(404).json({ error: 'no fix_plan.md' });
    parser.addTask(doc, priority, text);
    saveDoc(cwd, doc);
    res.json({ ok: true });
  });

  router.post('/task/toggle', (req, res) => {
    const { text } = req.body || {};
    if (!text) return res.status(400).json({ error: 'text required' });
    const doc = loadDoc(cwd);
    if (!doc) return res.status(404).json({ error: 'no fix_plan.md' });
    const ok = parser.toggleTask(doc, text);
    if (!ok) return res.status(404).json({ error: 'task not found' });
    saveDoc(cwd, doc);
    res.json({ ok: true });
  });

  router.post('/task/move', (req, res) => {
    const { text, toPriority } = req.body || {};
    if (!text || !toPriority) return res.status(400).json({ error: 'text and toPriority required' });
    const doc = loadDoc(cwd);
    if (!doc) return res.status(404).json({ error: 'no fix_plan.md' });
    const ok = parser.moveTask(doc, text, toPriority);
    if (!ok) return res.status(404).json({ error: 'task not found' });
    saveDoc(cwd, doc);
    res.json({ ok: true });
  });

  return router;
}

module.exports = { createRouter, buildBoard };

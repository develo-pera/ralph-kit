'use strict';

const fs = require('fs');
const path = require('path');

function ralphDir(cwd) {
  return path.join(cwd || process.cwd(), '.ralph');
}

function readJSON(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function readText(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

function snapshot(cwd) {
  const dir = ralphDir(cwd);
  const status = readJSON(path.join(dir, 'status.json'));
  const progress = readJSON(path.join(dir, 'progress.json'));
  const cbRaw = readText(path.join(dir, '.circuit_breaker_state')) || '';
  const breakerOpen = /"state"\s*:\s*"OPEN"/i.test(cbRaw) || /\bOPEN\b/.test(cbRaw.split('\n')[0] || '');
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

function watchedPaths(cwd) {
  const dir = ralphDir(cwd);
  return [
    path.join(dir, 'fix_plan.md'),
    path.join(dir, 'status.json'),
    path.join(dir, 'progress.json'),
    path.join(dir, '.circuit_breaker_state'),
    path.join(dir, 'live.log'),
  ];
}

module.exports = { ralphDir, snapshot, watchedPaths, readJSON, readText };

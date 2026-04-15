'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_PROMPT_MARKERS = [
  'Project Type:** unknown',
  'Follow tasks in fix_plan.md',
];

function ralphDir(cwd) {
  return path.join(cwd, '.ralph');
}

function inspect(cwd) {
  const dir = ralphDir(cwd);
  if (!fs.existsSync(dir)) {
    return { state: 'missing', cwd, reasons: ['.ralph/ directory not found'] };
  }

  const promptPath = path.join(dir, 'PROMPT.md');
  const fixPlanPath = path.join(dir, 'fix_plan.md');
  const agentPath = path.join(dir, 'AGENT.md');
  const specsDir = path.join(dir, 'specs');
  const backlogPath = path.join(dir, 'backlog.md');
  const rcPath = path.join(cwd, '.ralphrc');

  const reasons = [];
  let promptCustomized = false;
  if (fs.existsSync(promptPath)) {
    const txt = fs.readFileSync(promptPath, 'utf8');
    promptCustomized = !DEFAULT_PROMPT_MARKERS.some((m) => txt.includes(m));
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

function scaffold(cwd) {
  const dir = ralphDir(cwd);
  fs.mkdirSync(path.join(dir, 'specs'), { recursive: true });

  const writeIfMissing = (p, content) => {
    if (!fs.existsSync(p)) {
      fs.writeFileSync(p, content);
      return true;
    }
    return false;
  };

  const created = [];
  if (writeIfMissing(path.join(dir, 'PROMPT.md'), require('./templates').promptTemplate())) created.push('PROMPT.md');
  if (writeIfMissing(path.join(dir, 'fix_plan.md'), require('./templates').fixPlanTemplate())) created.push('fix_plan.md');
  if (writeIfMissing(path.join(dir, 'AGENT.md'), require('./templates').agentTemplate())) created.push('AGENT.md');
  if (writeIfMissing(path.join(dir, 'backlog.md'), require('./backlog_parser').defaultContent())) created.push('backlog.md');
  return created;
}

function ensureBacklog(cwd) {
  const p = path.join(ralphDir(cwd), 'backlog.md');
  if (!fs.existsSync(p)) {
    fs.writeFileSync(p, require('./backlog_parser').defaultContent());
    return true;
  }
  return false;
}

module.exports = { inspect, scaffold, ensureBacklog, ralphDir };

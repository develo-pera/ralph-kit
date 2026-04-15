#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { Command } = require('commander');
const chalk = require('chalk');

const program = new Command();
program
  .name('ralph-kit')
  .description('Questionnaire + Kanban dashboard for Ralph Loop projects')
  .version(require('../package.json').version);

program
  .command('board')
  .description('Start the local Kanban dashboard')
  .option('-p, --port <port>', 'port to listen on', '4777')
  .option('-d, --dir <dir>', 'project dir (must contain .ralph/)', process.cwd())
  .action(async (opts) => {
    const { start } = require('../server');
    const cwd = path.resolve(opts.dir);
    const ralph = path.join(cwd, '.ralph');
    if (!fs.existsSync(ralph)) {
      console.error(chalk.red(`No .ralph/ in ${cwd}. Run 'ralph enable' first.`));
      process.exit(1);
    }
    const { port } = await start({ port: Number(opts.port), cwd });
    console.log(chalk.green(`ralph-kit board  →  http://localhost:${port}`));
    console.log(chalk.gray(`watching ${ralph}`));
  });

program
  .command('doctor')
  .description('Validate .ralph/ layout')
  .option('-d, --dir <dir>', 'project dir', process.cwd())
  .action((opts) => {
    const cwd = path.resolve(opts.dir);
    const ralph = path.join(cwd, '.ralph');
    const required = ['PROMPT.md', 'fix_plan.md', 'AGENT.md'];
    const optional = ['specs'];
    let ok = true;
    console.log(chalk.bold(`Checking ${ralph}`));
    if (!fs.existsSync(ralph)) {
      console.log(chalk.red('  ✗ .ralph/ missing — not a Ralph project'));
      process.exit(1);
    }
    for (const f of required) {
      const p = path.join(ralph, f);
      if (fs.existsSync(p)) console.log(chalk.green(`  ✓ ${f}`));
      else {
        console.log(chalk.red(`  ✗ ${f} missing`));
        ok = false;
      }
    }
    for (const f of optional) {
      const p = path.join(ralph, f);
      console.log((fs.existsSync(p) ? chalk.green('  ✓ ') : chalk.yellow('  ~ ')) + f + ' (optional)');
    }
    const fixPlan = path.join(ralph, 'fix_plan.md');
    if (fs.existsSync(fixPlan)) {
      const txt = fs.readFileSync(fixPlan, 'utf8');
      if (/Status:\s*BLOCKED/i.test(txt)) {
        console.log(chalk.yellow('  ! fix_plan.md is BLOCKED — run /ralph-define in Claude Code'));
      }
    }
    process.exit(ok ? 0 : 1);
  });

program
  .command('install-commands')
  .description('Copy slash commands into ~/.claude/commands/')
  .option('--force', 'overwrite existing commands')
  .action((opts) => {
    const src = path.join(__dirname, '..', 'commands');
    const dst = path.join(os.homedir(), '.claude', 'commands');
    fs.mkdirSync(dst, { recursive: true });
    const files = fs.readdirSync(src).filter((f) => f.endsWith('.md'));
    for (const f of files) {
      const target = path.join(dst, f);
      if (fs.existsSync(target) && !opts.force) {
        console.log(chalk.yellow(`  ~ ${f} exists (use --force to overwrite)`));
        continue;
      }
      fs.copyFileSync(path.join(src, f), target);
      console.log(chalk.green(`  ✓ installed ${f}`));
    }
    console.log(chalk.gray(`\nSlash commands available: ${files.map((f) => '/' + f.replace('.md', '')).join(', ')}`));
  });

program.parseAsync(process.argv);

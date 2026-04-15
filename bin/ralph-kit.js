#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { Command } = require('commander');
const chalk = require('chalk');

const doctor = require('../lib/doctor');

const program = new Command();
program
  .name('ralph-kit')
  .description('Questionnaire + Kanban dashboard for Ralph Loop projects')
  .version(require('../package.json').version);

function missingRalphError(cwd) {
  console.error(chalk.red(`No .ralph/ directory found in ${cwd}.`));
  console.error('');
  console.error('Either (a) run your Ralph implementation\'s setup:');
  console.error(chalk.gray('      ralph enable              # frankbria/ralph-claude-code'));
  console.error(chalk.gray('      # other implementations: see their docs'));
  console.error('');
  console.error('or (b) run ralph-kit\'s implementation-agnostic bootstrap:');
  console.error(chalk.gray('      ralph-kit init'));
}

program
  .command('board')
  .description('Start the local Kanban dashboard')
  .option('-p, --port <port>', 'port to listen on', '4777')
  .option('-d, --dir <dir>', 'project dir (must contain .ralph/)', process.cwd())
  .action(async function boardAction(opts) {
    const { start } = require('../server');
    const cwd = path.resolve(opts.dir);
    if (!fs.existsSync(path.join(cwd, '.ralph'))) {
      missingRalphError(cwd);
      process.exit(1);
    }
    doctor.ensureBacklog(cwd);
    const requested = Number(opts.port);
    const strictPort = this.getOptionValueSource('port') === 'cli';
    let result;
    try {
      result = await start({ port: requested, cwd, strictPort });
    } catch (err) {
      if (err && err.code === 'EADDRINUSE') {
        console.error(
          chalk.red(
            strictPort
              ? `Port ${requested} is already in use (you asked for it explicitly — not auto-incrementing).`
              : `Couldn't find a free port near ${requested}. Is another ralph-kit instance stuck?`,
          ),
        );
        process.exit(1);
      }
      throw err;
    }
    const { port } = result;
    const health = doctor.inspect(cwd);
    if (port !== requested) {
      console.log(chalk.yellow(`  port ${requested} in use — using ${port} instead`));
    }
    console.log(chalk.green(`ralph-kit board  →  http://localhost:${port}`));
    console.log(chalk.gray(`watching ${path.join(cwd, '.ralph')}`));
    if (health.state !== 'initialized') {
      console.log(
        chalk.yellow(`  project is ${health.state} — UI is gated; run /ralph-kit:define in Claude Code`),
      );
    }
  });

program
  .command('init')
  .description('Scaffold a neutral .ralph/ layout (implementation-agnostic)')
  .option('-d, --dir <dir>', 'project dir', process.cwd())
  .action((opts) => {
    const cwd = path.resolve(opts.dir);
    const created = doctor.scaffold(cwd);
    if (created.length === 0) {
      console.log(chalk.gray('.ralph/ already scaffolded — nothing to do'));
    } else {
      for (const f of created) console.log(chalk.green(`  ✓ created .ralph/${f}`));
    }
    console.log('');
    console.log(chalk.yellow('Next steps:'));
    console.log('  1. Install your Ralph Loop implementation of choice');
    console.log('     e.g.  npm i -g github:frankbria/ralph-claude-code  (and run `ralph enable`)');
    console.log('  2. In Claude Code, run  /ralph-kit:define  to define the project');
    console.log('  3. Start the dashboard:  ralph-kit board');
  });

program
  .command('doctor')
  .description('Validate .ralph/ layout')
  .option('-d, --dir <dir>', 'project dir', process.cwd())
  .action((opts) => {
    const cwd = path.resolve(opts.dir);
    const r = doctor.inspect(cwd);
    console.log(chalk.bold(`Checking ${path.join(cwd, '.ralph')}`));
    if (r.state === 'missing') {
      console.log(chalk.red('  ✗ .ralph/ missing'));
      missingRalphError(cwd);
      process.exit(1);
    }
    for (const [k, v] of Object.entries(r.files)) {
      console.log((v ? chalk.green('  ✓ ') : chalk.yellow('  ~ ')) + k);
    }
    console.log('');
    const label = r.state === 'initialized' ? chalk.green('initialized') : chalk.yellow(r.state);
    console.log(`  state: ${label}`);
    if (r.reasons.length > 0) {
      for (const reason of r.reasons) console.log(chalk.gray(`    · ${reason}`));
      console.log(chalk.yellow('\n  → run /ralph-kit:define in Claude Code to resolve'));
    }
    process.exit(r.state === 'initialized' ? 0 : 2);
  });

program
  .command('install-commands')
  .description('Copy slash commands into ~/.claude/commands/ralph-kit/')
  .option('--force', 'overwrite existing commands')
  .action((opts) => {
    const src = path.join(__dirname, '..', 'commands');
    const dst = path.join(os.homedir(), '.claude', 'commands', 'ralph-kit');
    const legacyDst = path.join(os.homedir(), '.claude', 'commands');
    fs.mkdirSync(dst, { recursive: true });
    const files = fs.readdirSync(src).filter((f) => f.endsWith('.md'));
    for (const f of files) {
      const target = path.join(dst, f);
      if (fs.existsSync(target) && !opts.force) {
        console.log(chalk.yellow(`  ~ ralph-kit/${f} exists (use --force to overwrite)`));
        continue;
      }
      fs.copyFileSync(path.join(src, f), target);
      console.log(chalk.green(`  ✓ installed ralph-kit/${f}`));
    }
    const legacyNames = ['ralph-define.md', 'ralph-add-feature.md', 'ralph-add-task.md', 'ralph-revise.md'];
    for (const f of legacyNames) {
      const p = path.join(legacyDst, f);
      if (fs.existsSync(p)) {
        fs.unlinkSync(p);
        console.log(chalk.gray(`  - removed legacy ${f}`));
      }
    }
    console.log(
      chalk.gray(`\nSlash commands available: ${files.map((f) => '/ralph-kit:' + f.replace('.md', '')).join(', ')}`),
    );
  });

program.parseAsync(process.argv);

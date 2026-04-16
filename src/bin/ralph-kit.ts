#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { Command } from 'commander';
import chalk from 'chalk';

import * as doctor from '../lib/doctor';
import {
  loadProfile,
  writeProfile,
  generateProfile,
  profilePath,
  type Profile,
} from '../lib/profile';
import { probe } from '../lib/probe';
import { detect } from '../lib/fingerprint';
import { start } from '../server';
import pkg from '../../package.json';

const program = new Command();
program
  .name('ralph-kit')
  .description('Questionnaire + Kanban dashboard for Ralph Loop projects')
  .version(pkg.version);

function missingRalphError(cwd: string, rootName: string): void {
  console.error(chalk.red(`No Ralph Loop project detected in ${cwd}.`));
  console.error('');
  console.error('(a) If you already have a Ralph Loop set up, let ralph-kit map it:');
  console.error(chalk.gray('      ralph-kit map'));
  console.error('');
  console.error('(b) If you\'re starting from scratch:');
  console.error(chalk.gray(`      ralph-kit init                    # scaffold a minimal ${rootName}/ layout`));
  console.error('');
  console.error('(c) If you haven\'t installed a Ralph Loop implementation yet:');
  console.error(chalk.gray('      see https://ghuntley.com/ralph/ for the pattern and implementations'));
}

function printProfileSummary(profile: Profile, tier?: string, implName?: string): void {
  const pad = (s: string, n = 10) => s.padEnd(n);
  const root = profile.root;
  if (tier) {
    const label = implName ? `${tier} — ${implName}` : tier;
    console.log(chalk.gray(`  ${pad('detected')}${label}`));
  }
  if (profile.taskFile) {
    console.log(chalk.gray(`  ${pad('tasks')}${profile.taskFile.file}  (${profile.taskFile.format})`));
  }
  if (profile.loop) {
    const fields = [profile.loop.countField, profile.loop.statusField].filter(Boolean).join(', ');
    console.log(chalk.gray(`  ${pad('loop')}${profile.loop.file}${fields ? `  (${fields})` : ''}`));
    if (profile.loop.fallback) {
      const fb = [profile.loop.fallback.countField, profile.loop.fallback.statusField]
        .filter(Boolean)
        .join(', ');
      console.log(
        chalk.gray(`  ${pad('fallback')}${profile.loop.fallback.file}${fb ? `  (${fb})` : ''}`),
      );
    }
  } else {
    console.log(chalk.gray(`  ${pad('loop')}(none detected)`));
  }
  console.log(
    chalk.gray(
      `  ${pad('breaker')}${profile.breaker ? `${profile.breaker.file}${profile.breaker.fromStatus ? '  (from status)' : ''}${profile.breaker.reasonField ? `  (reason: ${profile.breaker.reasonField})` : ''}${profile.breaker.statusReasonField ? `  (reason: ${profile.breaker.statusReasonField})` : ''}` : '(none detected)'}`,
    ),
  );
  console.log(
    chalk.gray(`  ${pad('live log')}${profile.liveLog ? profile.liveLog.file : '(none detected)'}`),
  );
  const fp = profile.fixPlan;
  if (fp && (fp.blockedSections || fp.highSections || fp.completedSections)) {
    console.log(chalk.gray(`  fix_plan sections:`));
    if (fp.blockedSections) console.log(chalk.gray(`    ${pad('blocked', 11)}${fp.blockedSections.join(', ')}`));
    if (fp.highSections) console.log(chalk.gray(`    ${pad('high', 11)}${fp.highSections.join(', ')}`));
    if (fp.completedSections)
      console.log(chalk.gray(`    ${pad('completed', 11)}${fp.completedSections.join(', ')}`));
  }
  console.log(chalk.gray(`  root dir: ${root}/`));
}

program
  .command('board')
  .description('Start the local Kanban dashboard')
  .option('-p, --port <port>', 'port to listen on', '4777')
  .option('-d, --dir <dir>', 'project dir (must contain a Ralph directory)', process.cwd())
  .action(async function boardAction(this: Command, opts: { port: string; dir: string }) {
    const cwd = path.resolve(opts.dir);
    const profile = loadProfile(cwd);
    const ralphRoot = path.join(cwd, profile.root);
    if (!fs.existsSync(ralphRoot)) {
      missingRalphError(cwd, profile.root);
      process.exit(1);
    }
    doctor.ensureBacklog(cwd, profile);
    const requested = Number(opts.port);
    const strictPort = this.getOptionValueSource('port') === 'cli';
    let result;
    try {
      result = await start({ port: requested, cwd, strictPort });
    } catch (err) {
      const e = err as NodeJS.ErrnoException;
      if (e && e.code === 'EADDRINUSE') {
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
    const health = doctor.inspect(cwd, profile);
    if (port !== requested) {
      console.log(chalk.yellow(`  port ${requested} in use — using ${port} instead`));
    }
    console.log(chalk.green(`ralph-kit board  →  http://localhost:${port}`));
    console.log(chalk.gray(`watching ${ralphRoot}`));
    if (health.state !== 'initialized') {
      console.log(
        chalk.yellow(`  project is ${health.state} — UI is gated; run /ralph-kit:define in Claude Code`),
      );
    }
  });

program
  .command('init')
  .description('Scaffold a neutral Ralph directory (implementation-agnostic)')
  .option('-d, --dir <dir>', 'project dir', process.cwd())
  .action((opts: { dir: string }) => {
    const cwd = path.resolve(opts.dir);
    const profile = loadProfile(cwd);
    const created = doctor.scaffold(cwd, profile);
    if (created.length === 0) {
      console.log(chalk.gray(`${profile.root}/ already scaffolded — nothing to do`));
    } else {
      for (const f of created) console.log(chalk.green(`  ✓ created ${profile.root}/${f}`));
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
  .description('Validate Ralph directory layout')
  .option('-d, --dir <dir>', 'project dir', process.cwd())
  .action((opts: { dir: string }) => {
    const cwd = path.resolve(opts.dir);
    const profile = loadProfile(cwd);
    const r = doctor.inspect(cwd, profile);
    console.log(chalk.bold(`Checking ${path.join(cwd, profile.root)}`));
    if (r.state === 'missing') {
      console.log(chalk.red(`  ✗ ${profile.root}/ missing`));
      missingRalphError(cwd, profile.root);
      process.exit(1);
    }
    if (r.files) {
      for (const [k, v] of Object.entries(r.files)) {
        console.log((v ? chalk.green('  ✓ ') : chalk.yellow('  ~ ')) + k);
      }
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
  .action((opts: { force?: boolean }) => {
    const src = path.join(__dirname, '..', '..', 'commands');
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

program
  .command('map')
  .description('Introspect the project and write a profile describing its Ralph Loop layout')
  .option('-d, --dir <dir>', 'project dir', process.cwd())
  .option('--dry-run', 'print what would be written without touching disk')
  .option('--force', 'overwrite an existing .ralph-kit/profile.json')
  .action((opts: { dir: string; dryRun?: boolean; force?: boolean }) => {
    const cwd = path.resolve(opts.dir);

    // Tier 1 & 2: declaration or fingerprint
    const detected = detect(cwd);
    let profile: Profile;
    let tier: string | undefined;
    let implName: string | undefined;

    if (detected) {
      profile = detected.profile;
      tier = detected.tier;
      implName = detected.implementation;
      if (implName) profile.implementation = implName;
      console.log(chalk.green(`Detected Ralph project at  ${profile.root}/`));
    } else {
      // Tier 3: heuristic probe
      const probeResult = probe(cwd);
      if (!probeResult.rootName) {
        console.error(chalk.yellow(`No Ralph Loop project detected in ${cwd}.`));
        console.error('');
        console.error('If this is a new project, scaffold a starter layout first:');
        console.error(chalk.gray('      ralph-kit init'));
        console.error('');
        console.error('Or drop a .ralph-kit.json to declare the layout manually.');
        process.exit(1);
      }
      profile = generateProfile(probeResult);
      tier = 'heuristic';
      console.log(chalk.green(`Detected Ralph project at  ${profile.root}/`));
    }

    printProfileSummary(profile, tier, implName);

    const target = profilePath(cwd);
    if (opts.dryRun) {
      console.log('');
      console.log(chalk.gray('(dry-run — nothing written)'));
      return;
    }
    if (fs.existsSync(target) && !opts.force) {
      console.log('');
      console.log(
        chalk.yellow(
          `  ${path.relative(cwd, target)} already exists — pass --force to overwrite`,
        ),
      );
      process.exit(2);
    }
    const written = writeProfile(cwd, profile);
    console.log('');
    console.log(chalk.green(`  ✓ wrote ${path.relative(cwd, written)}`));
  });

const profileCmd = program
  .command('profile')
  .description('Inspect ralph-kit\'s per-project profile');

profileCmd
  .command('show')
  .description('Print the active profile for this project')
  .option('-d, --dir <dir>', 'project dir', process.cwd())
  .action((opts: { dir: string }) => {
    const cwd = path.resolve(opts.dir);
    const persisted = profilePath(cwd);
    if (fs.existsSync(persisted)) {
      const profile = loadProfile(cwd);
      console.log(chalk.gray(`from ${path.relative(cwd, persisted)}:`));
      console.log(JSON.stringify(profile, null, 2));
      return;
    }
    const probed = probe(cwd);
    if (!probed.rootName) {
      console.error(chalk.yellow('No profile persisted and no Ralph Loop project detected.'));
      console.error(chalk.gray('  run `ralph-kit map` in a project with a Ralph directory'));
      process.exit(1);
    }
    const generated = generateProfile(probed);
    console.log(chalk.gray('no persisted profile — `ralph-kit map` would produce:'));
    console.log(JSON.stringify(generated, null, 2));
  });

void program.parseAsync(process.argv);

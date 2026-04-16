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
import { scan, profileFromScan } from '../lib/scanner';
import { listFlavors, getFlavor, type Flavor } from '../lib/flavors';
import { execSync } from 'node:child_process';
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

function printProfileSummary(profile: Profile, scanResult?: import('../lib/scanner').ScanResult): void {
  const pad = (s: string, n = 12) => s.padEnd(n);

  // Loop runner (from scan)
  const runner = scanResult?.files.find((f) => f.role === 'loopRunner');
  console.log(chalk.gray(`  ${pad('runner')}${runner ? runner.path : '(none detected)'}`));

  // Task file
  const taskFile = scanResult?.files.find((f) => f.role === 'taskList');
  if (profile.taskFile) {
    console.log(chalk.gray(`  ${pad('tasks')}${profile.taskFile.file}  (${profile.taskFile.format})`));
  } else if (taskFile) {
    console.log(chalk.gray(`  ${pad('tasks')}${taskFile.path}  (${taskFile.format})`));
  }

  // Loop status
  if (profile.loop) {
    const fields = [profile.loop.countField, profile.loop.statusField].filter(Boolean).join(', ');
    console.log(chalk.gray(`  ${pad('status')}${profile.loop.file}${fields ? `  (${fields})` : ''}`));
    if (profile.loop.fallback) {
      const fb = [profile.loop.fallback.countField, profile.loop.fallback.statusField]
        .filter(Boolean)
        .join(', ');
      console.log(chalk.gray(`  ${pad('fallback')}${profile.loop.fallback.file}${fb ? `  (${fb})` : ''}`));
    }
  } else {
    console.log(chalk.gray(`  ${pad('status')}(no status.json — created at runtime)`));
  }

  // Breaker
  console.log(
    chalk.gray(
      `  ${pad('breaker')}${profile.breaker ? `${profile.breaker.file}${profile.breaker.fromStatus ? '  (from status)' : ''}${profile.breaker.reasonField ? `  (reason: ${profile.breaker.reasonField})` : ''}${profile.breaker.statusReasonField ? `  (reason: ${profile.breaker.statusReasonField})` : ''}` : '(none — detected at runtime)'}`,
    ),
  );

  // Live log
  console.log(
    chalk.gray(`  ${pad('live log')}${profile.liveLog ? profile.liveLog.file : '(none — created at runtime)'}`),
  );

  // Fix plan sections
  const fp = profile.fixPlan;
  if (fp && (fp.blockedSections || fp.highSections || fp.completedSections)) {
    console.log(chalk.gray(`  fix_plan sections:`));
    const secPad = (s: string) => s.padEnd(13);
    if (fp.blockedSections) console.log(chalk.gray(`    ${secPad('blocked')}${fp.blockedSections.join(', ')}`));
    if (fp.highSections) console.log(chalk.gray(`    ${secPad('high')}${fp.highSections.join(', ')}`));
    if (fp.completedSections) console.log(chalk.gray(`    ${secPad('completed')}${fp.completedSections.join(', ')}`));
  }

  console.log(chalk.gray(`  ${pad('root dir')}${profile.root}/`));
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

function cloneFlavorFiles(cwd: string, flavor: Flavor): string[] {
  if (!flavor.repo || flavor.filesToClone.length === 0) return [];

  const cloned: string[] = [];
  const tmpDir = path.join(os.tmpdir(), `ralph-kit-clone-${Date.now()}`);

  try {
    console.log(chalk.gray(`  cloning from ${flavor.repo}...`));
    execSync(`git clone --depth 1 --branch ${flavor.branch} https://github.com/${flavor.repo}.git ${tmpDir}`, {
      stdio: 'pipe',
    });

    for (const mapping of flavor.filesToClone) {
      const src = path.join(tmpDir, mapping.from);
      const dst = path.join(cwd, mapping.to);

      if (!fs.existsSync(src)) {
        console.log(chalk.yellow(`  ~ ${mapping.from} not found in repo — skipped`));
        continue;
      }

      fs.mkdirSync(path.dirname(dst), { recursive: true });

      if (fs.statSync(src).isDirectory()) {
        fs.cpSync(src, dst, { recursive: true });
      } else {
        fs.copyFileSync(src, dst);
      }

      // Make shell scripts executable
      if (mapping.to.endsWith('.sh')) {
        fs.chmodSync(dst, 0o755);
      }

      cloned.push(mapping.to);
      console.log(chalk.green(`  ✓ ${mapping.to}`));
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(chalk.red(`  clone failed: ${msg}`));
    console.error(chalk.gray('  you can clone manually and re-run ralph-kit map'));
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch { /* ignore cleanup errors */ }
  }

  return cloned;
}

program
  .command('init')
  .description('Set up a Ralph Loop project with a chosen flavor')
  .option('-d, --dir <dir>', 'project dir', process.cwd())
  .option('--flavor <name>', 'flavor name (skip interactive selection)')
  .option('--list', 'list available flavors and exit')
  .action((opts: { dir: string; flavor?: string; list?: boolean }) => {
    // List mode
    if (opts.list) {
      console.log(chalk.bold('Available flavors:\n'));
      for (const f of listFlavors()) {
        console.log(`  ${chalk.green(f.name.padEnd(20))} ${f.description}`);
        if (f.repo) console.log(chalk.gray(`  ${''.padEnd(20)} ${f.repo}`));
      }
      return;
    }

    const cwd = path.resolve(opts.dir);

    // Select flavor
    let flavor: Flavor | undefined;
    if (opts.flavor) {
      flavor = getFlavor(opts.flavor);
      if (!flavor) {
        console.error(chalk.red(`Unknown flavor: ${opts.flavor}`));
        console.error('Available: ' + listFlavors().map((f) => f.name).join(', '));
        process.exit(1);
      }
    } else {
      // Non-interactive default: show choices and ask user to pick with --flavor
      console.log(chalk.bold('Which Ralph Loop flavor do you want?\n'));
      for (const f of listFlavors()) {
        console.log(`  ${chalk.green(f.name.padEnd(20))} ${f.description}`);
      }
      console.log('');
      console.log(`Run: ${chalk.cyan('ralph-kit init --flavor <name>')}`);
      console.log('');
      console.log(chalk.gray('Example:'));
      console.log(chalk.gray('  ralph-kit init --flavor ralph-kit    # native, no external deps'));
      console.log(chalk.gray('  ralph-kit init --flavor frankbria    # frankbria/ralph-claude-code'));
      console.log(chalk.gray('  ralph-kit init --flavor snarktank    # snarktank/ralph'));
      return;
    }

    console.log(chalk.bold(`\nInitializing with flavor: ${flavor.displayName}\n`));

    // Step 1: Clone files from repo
    const clonedPaths = cloneFlavorFiles(cwd, flavor);

    // Step 2: Scaffold control files
    console.log('');
    const profile = loadProfile(cwd);
    const created = doctor.scaffold(cwd, profile);
    if (created.length > 0) {
      console.log(chalk.bold('Scaffolded control files:'));
      for (const f of created) console.log(chalk.green(`  ✓ ${profile.root}/${f}`));
    }

    // Step 3: Write profile
    const fullProfile = { ...profile, implementation: flavor.name };
    if (flavor.taskFile) fullProfile.taskFile = flavor.taskFile;
    const written = writeProfile(cwd, fullProfile);
    console.log(chalk.green(`  ✓ ${path.relative(cwd, written)}`));

    // Step 4: Run scan to verify
    const scanResult = scan(cwd);
    console.log('');
    console.log(chalk.bold('Scan result:'));
    console.log(chalk.gray(`  ${scanResult.files.length} ralph-related files found`));
    if (scanResult.flavor) console.log(chalk.gray(`  flavor: ${scanResult.flavor}`));
    for (const conflict of scanResult.conflicts) {
      console.log(chalk.yellow(`  conflict: ${conflict.message}`));
    }

    // Step 5: Next steps
    console.log('');
    console.log(chalk.yellow('Next steps:'));
    console.log('  1. In Claude Code, run  /ralph-kit:define  to define your project');
    console.log('  2. Start the dashboard:  ralph-kit board');
    if (flavor.repo && clonedPaths.some((p) => p.endsWith('.sh'))) {
      const runner = clonedPaths.find((p) => p.endsWith('.sh'));
      console.log(`  3. Start the loop:      ./${runner}`);
    }
  });

program
  .command('run')
  .description('Run the Ralph loop — spawns Claude Code iteratively to work through fix_plan.md')
  .option('-d, --dir <dir>', 'project dir', process.cwd())
  .option('-n, --max <n>', 'max iterations', '10')
  .option('--allowed-tools <tools>', 'allowed tools for Claude Code', 'Write,Read,Edit,Bash')
  .option('--delay <ms>', 'delay between iterations in ms', '2000')
  .action(async (opts: { dir: string; max: string; allowedTools: string; delay: string }) => {
    const cwd = path.resolve(opts.dir);
    const profile = loadProfile(cwd);
    const health = doctor.inspect(cwd, profile);

    if (health.state === 'missing') {
      console.error(chalk.red(`No Ralph directory found. Run: ralph-kit init --flavor ralph-kit`));
      process.exit(1);
    }
    if (health.state === 'uninitialized') {
      console.error(chalk.yellow(`Project not defined yet. Run /ralph-kit:define in Claude Code first.`));
      process.exit(1);
    }

    // Check if an external loop runner exists — delegate to it instead of built-in loop
    const scanResult = scan(cwd);
    const runner = scanResult.files.find((f) => f.role === 'loopRunner');

    if (runner) {
      const runnerPath = path.resolve(cwd, runner.path);
      console.log(chalk.bold(`\nralph-kit run — delegating to ${runner.path}\n`));
      console.log(chalk.gray(`  runner: ${runnerPath}`));
      console.log(chalk.gray(`  max iterations: ${opts.max}`));
      console.log('');

      const ralphRoot = path.join(cwd, profile.root);
      fs.mkdirSync(ralphRoot, { recursive: true });
      const logFile = path.join(ralphRoot, profile.liveLog?.file ?? 'live.log');
      const statusFile = path.join(ralphRoot, profile.loop?.file ?? 'status.json');

      // Write initial status so the board knows we're running
      const writeRunnerStatus = (status: string, extra?: Record<string, unknown>) => {
        const obj = { timestamp: new Date().toISOString(), loop_count: 0, status, last_action: 'external_runner', ...extra };
        fs.writeFileSync(statusFile, JSON.stringify(obj, null, 4) + '\n');
      };
      writeRunnerStatus('running');

      // Append to live.log so the board sees output
      const appendToLog = (text: string) => {
        fs.appendFileSync(logFile, text);
      };
      appendToLog(`[${new Date().toISOString()}] ralph-kit run — delegating to ${runner.path}\n`);

      // Delegate to the external runner, capturing output for live.log
      const { createSpinner } = await import('../lib/spinner.js');
      const { spawn: spawnChild } = await import('node:child_process');
      const args = ['--tool', 'claude', opts.max];
      const child = spawnChild(runnerPath, args, {
        cwd,
        stdio: ['inherit', 'pipe', 'pipe'],
        env: { ...process.env },
      });

      // Parse iteration numbers from runner output to update loop_count
      const iterationRe = /Iteration\s+(\d+)\s+of\s+(\d+)/i;
      const runnerSpinner = createSpinner('Claude is working');

      child.stdout.on('data', (data: Buffer) => {
        const text = data.toString();
        runnerSpinner.update();
        // Only clear spinner for substantive output (not blank lines)
        if (text.trim()) {
          runnerSpinner.stop();
        }
        process.stdout.write(text);
        appendToLog(text);

        const match = text.match(iterationRe);
        if (match) {
          writeRunnerStatus('running', { loop_count: parseInt(match[1], 10) });
          runnerSpinner.update(`Iteration ${match[1]} of ${match[2]}`);
        }
      });

      child.stderr.on('data', (data: Buffer) => {
        const text = data.toString();
        runnerSpinner.update();
        process.stderr.write(text);
        appendToLog(text);
      });

      // Clean up on interrupt
      const runnerCleanup = () => {
        runnerSpinner.stop('interrupted');
        writeRunnerStatus('interrupted', { last_action: 'user_cancelled' });
        appendToLog(`[${new Date().toISOString()}] Interrupted by user\n`);
        child.kill();
        process.exit(130);
      };
      process.on('SIGINT', runnerCleanup);
      process.on('SIGTERM', runnerCleanup);

      child.on('close', (code) => {
        runnerSpinner.stop(code === 0 ? 'done' : `exited with code ${code}`);
        process.removeListener('SIGINT', runnerCleanup);
        process.removeListener('SIGTERM', runnerCleanup);
        const finalStatus = code === 0 ? 'complete' : 'halted';
        writeRunnerStatus(finalStatus, code !== 0 ? { exit_reason: `Runner exited with code ${code}` } : {});
        appendToLog(`[${new Date().toISOString()}] Runner exited with code ${code}\n`);
        process.exit(code ?? 0);
      });

      child.on('error', (err) => {
        runnerSpinner.stop('error');
        process.removeListener('SIGINT', runnerCleanup);
        process.removeListener('SIGTERM', runnerCleanup);
        writeRunnerStatus('halted', { exit_reason: err.message });
        console.error(chalk.red(`Failed to start runner: ${err.message}`));
        process.exit(1);
      });
      return;
    }

    // No external runner — use built-in loop
    const { runLoop } = await import('../lib/loop.js');

    // Check claude is available
    try {
      execSync('claude --version', { stdio: 'pipe' });
    } catch {
      console.error(chalk.red('Claude Code CLI not found. Install it first: https://claude.ai/claude-code'));
      process.exit(1);
    }

    console.log(chalk.bold(`\nralph-kit run — built-in loop (${profile.root}/)\n`));
    console.log(chalk.gray(`  max iterations: ${opts.max}`));
    console.log(chalk.gray(`  allowed tools:  ${opts.allowedTools}`));
    console.log(chalk.gray(`  delay:          ${opts.delay}ms`));
    console.log('');

    await runLoop({
      cwd,
      profile,
      maxIterations: parseInt(opts.max, 10),
      allowedTools: opts.allowedTools,
      delayMs: parseInt(opts.delay, 10),
      onLog: (line: string) => console.log(chalk.gray(line)),
    });
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

    // Full-project scan
    const scanResult = scan(cwd);

    if (scanResult.files.length === 0) {
      console.error(chalk.yellow(`No Ralph Loop project detected in ${cwd}.`));
      console.error('');
      console.error('If this is a new project, scaffold a starter layout first:');
      console.error(chalk.gray('      ralph-kit init'));
      console.error('');
      console.error('Or drop a .ralph-kit.json to declare the layout manually.');
      process.exit(1);
    }

    const profile = profileFromScan(scanResult);
    console.log(chalk.green(`Detected Ralph project at  ${profile.root}/`));

    // Show discovered files
    if (scanResult.files.length > 0) {
      console.log(chalk.gray(`  scanned   ${scanResult.files.length} ralph-related files found`));
    }
    if (scanResult.flavor) {
      console.log(chalk.gray(`  flavor    ${scanResult.flavor}`));
    }

    // Show conflicts
    for (const conflict of scanResult.conflicts) {
      console.log(chalk.yellow(`  conflict  ${conflict.message}`));
    }

    printProfileSummary(profile, scanResult);

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

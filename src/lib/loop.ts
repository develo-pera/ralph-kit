/**
 * ralph-kit native loop runner.
 *
 * Spawns Claude Code in non-interactive mode, one iteration at a time.
 * Each iteration reads PROMPT.md + fix_plan.md, runs Claude, parses
 * the status block, updates status.json and live.log, then decides
 * whether to continue, halt, or declare completion.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

import type { Profile } from './profile';
import { atomicWrite } from './writers';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LoopOptions {
  cwd: string;
  profile: Profile;
  maxIterations: number;
  /** Allowed tools for Claude Code (default: Write,Read,Edit,Bash). */
  allowedTools: string;
  /** Delay between iterations in ms (default: 2000). */
  delayMs: number;
  /** Callback for log output. */
  onLog?: (line: string) => void;
}

export interface IterationResult {
  iteration: number;
  status: 'in_progress' | 'complete' | 'blocked' | 'error';
  tasksCompleted: number;
  recommendation: string;
  exitSignal: boolean;
  output: string;
}

interface StatusJson {
  timestamp: string;
  loop_count: number;
  status: string;
  last_action: string;
  exit_reason?: string;
}

// ---------------------------------------------------------------------------
// Status block parsing
// ---------------------------------------------------------------------------

const STATUS_BLOCK_RE = /---RALPH_STATUS---\s*([\s\S]*?)\s*---END_RALPH_STATUS---/;

function parseStatusBlock(output: string): Partial<IterationResult> {
  const match = output.match(STATUS_BLOCK_RE);
  if (!match) return {};

  const block = match[1];
  const get = (key: string): string | undefined => {
    const m = block.match(new RegExp(`^${key}:\\s*(.+)$`, 'mi'));
    return m?.[1]?.trim();
  };

  const statusRaw = get('STATUS')?.toLowerCase() ?? '';
  const status = statusRaw.includes('complete') ? 'complete' as const
    : statusRaw.includes('blocked') ? 'blocked' as const
    : 'in_progress' as const;

  return {
    status,
    tasksCompleted: parseInt(get('TASKS_COMPLETED_THIS_LOOP') ?? '0', 10) || 0,
    recommendation: get('RECOMMENDATION') ?? '',
    exitSignal: get('EXIT_SIGNAL')?.toLowerCase() === 'true',
  };
}

// ---------------------------------------------------------------------------
// State management
// ---------------------------------------------------------------------------

function ralphDir(cwd: string, profile: Profile): string {
  return path.join(cwd, profile.root);
}

function writeStatus(cwd: string, profile: Profile, status: StatusJson): void {
  const dir = ralphDir(cwd, profile);
  fs.mkdirSync(dir, { recursive: true });
  const statusFile = profile.loop?.file ?? 'status.json';
  atomicWrite(path.join(dir, statusFile), JSON.stringify(status, null, 4) + '\n');
}

function appendLog(cwd: string, profile: Profile, line: string): void {
  const dir = ralphDir(cwd, profile);
  const logFile = profile.liveLog?.file ?? 'live.log';
  const logPath = path.join(dir, logFile);
  fs.appendFileSync(logPath, line + '\n');
}

function buildPrompt(cwd: string, profile: Profile, iteration: number): string {
  const dir = ralphDir(cwd, profile);
  const promptPath = path.join(dir, 'PROMPT.md');
  const fixPlanPath = path.join(dir, 'fix_plan.md');
  const agentPath = path.join(dir, 'AGENT.md');

  let prompt = '';

  if (fs.existsSync(promptPath)) {
    prompt += fs.readFileSync(promptPath, 'utf8');
  }

  if (fs.existsSync(agentPath)) {
    prompt += '\n\n' + fs.readFileSync(agentPath, 'utf8');
  }

  if (fs.existsSync(fixPlanPath)) {
    prompt += '\n\n## Current Fix Plan\n\n' + fs.readFileSync(fixPlanPath, 'utf8');
  }

  prompt += `\n\n## Loop Context\nThis is iteration ${iteration}. Complete ONE task from the fix plan, then stop.\n`;

  return prompt;
}

// ---------------------------------------------------------------------------
// Single iteration
// ---------------------------------------------------------------------------

function runClaude(prompt: string, cwd: string, allowedTools: string): Promise<{ output: string; exitCode: number }> {
  return new Promise((resolve) => {
    // Write prompt to a temp file — more reliable than stdin piping for Claude Code
    const tmpPrompt = path.join(os.tmpdir(), `ralph-kit-prompt-${process.pid}-${Date.now()}.md`);
    fs.writeFileSync(tmpPrompt, prompt, 'utf8');

    // Use shell to redirect the file into claude's stdin, matching how snarktank does it
    const cmd = `claude --dangerously-skip-permissions -p --allowedTools ${JSON.stringify(allowedTools)} < ${JSON.stringify(tmpPrompt)}`;

    const child = spawn('sh', ['-c', cmd], {
      cwd,
      stdio: ['inherit', 'pipe', 'pipe'],
      env: { ...process.env },
    });

    let output = '';

    child.stdout.on('data', (data: Buffer) => {
      const text = data.toString();
      output += text;
      process.stdout.write(text);
    });

    child.stderr.on('data', (data: Buffer) => {
      const text = data.toString();
      output += text;
      process.stderr.write(text);
    });

    child.on('close', (code) => {
      try { fs.unlinkSync(tmpPrompt); } catch { /* ignore */ }
      resolve({ output, exitCode: code ?? 1 });
    });

    child.on('error', (err) => {
      try { fs.unlinkSync(tmpPrompt); } catch { /* ignore */ }
      resolve({ output: output + '\n' + err.message, exitCode: 1 });
    });
  });
}

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------

export async function runLoop(opts: LoopOptions): Promise<void> {
  const { cwd, profile, maxIterations, allowedTools, delayMs, onLog } = opts;
  const log = (msg: string) => {
    const line = `[${new Date().toISOString()}] ${msg}`;
    appendLog(cwd, profile, line);
    if (onLog) onLog(line);
    else console.log(line);
  };

  log(`ralph-kit loop starting — max ${maxIterations} iterations`);

  let consecutiveErrors = 0;

  for (let i = 1; i <= maxIterations; i++) {
    log(`═══ Iteration ${i} of ${maxIterations} ═══`);

    writeStatus(cwd, profile, {
      timestamp: new Date().toISOString(),
      loop_count: i,
      status: 'running',
      last_action: 'starting_iteration',
    });

    const prompt = buildPrompt(cwd, profile, i);
    const { output, exitCode } = await runClaude(prompt, cwd, allowedTools);

    const parsed = parseStatusBlock(output);
    const result: IterationResult = {
      iteration: i,
      status: exitCode !== 0 ? 'error' : (parsed.status ?? 'in_progress'),
      tasksCompleted: parsed.tasksCompleted ?? 0,
      recommendation: parsed.recommendation ?? '',
      exitSignal: parsed.exitSignal ?? false,
      output,
    };

    log(`iteration ${i}: status=${result.status} tasks=${result.tasksCompleted} exit_signal=${result.exitSignal}`);
    if (result.recommendation) log(`  recommendation: ${result.recommendation}`);

    // Update status
    writeStatus(cwd, profile, {
      timestamp: new Date().toISOString(),
      loop_count: i,
      status: result.status === 'error' ? 'halted' : result.status === 'complete' ? 'complete' : 'running',
      last_action: result.status,
      ...(result.status === 'error' ? { exit_reason: `Claude exited with code ${exitCode}` } : {}),
    });

    // Check termination conditions
    if (result.status === 'complete' || result.exitSignal) {
      log('All tasks complete! Loop finished.');
      writeStatus(cwd, profile, {
        timestamp: new Date().toISOString(),
        loop_count: i,
        status: 'complete',
        last_action: 'all_tasks_done',
      });
      return;
    }

    if (result.status === 'blocked') {
      log(`Blocked: ${result.recommendation}`);
      writeStatus(cwd, profile, {
        timestamp: new Date().toISOString(),
        loop_count: i,
        status: 'halted',
        last_action: 'blocked',
        exit_reason: result.recommendation || 'Blocked — needs human input',
      });
      return;
    }

    if (result.status === 'error') {
      consecutiveErrors++;
      log(`Error (${consecutiveErrors} consecutive)`);
      if (consecutiveErrors >= 3) {
        log('Circuit breaker: 3 consecutive errors — halting');
        writeStatus(cwd, profile, {
          timestamp: new Date().toISOString(),
          loop_count: i,
          status: 'halted',
          last_action: 'circuit_breaker',
          exit_reason: `${consecutiveErrors} consecutive errors`,
        });
        return;
      }
    } else {
      consecutiveErrors = 0;
    }

    if (result.tasksCompleted === 0 && result.status === 'in_progress') {
      consecutiveErrors++;
      if (consecutiveErrors >= 3) {
        log('Circuit breaker: 3 iterations with no progress — halting');
        writeStatus(cwd, profile, {
          timestamp: new Date().toISOString(),
          loop_count: i,
          status: 'halted',
          last_action: 'no_progress',
          exit_reason: 'No progress in 3 consecutive iterations',
        });
        return;
      }
    }

    // Delay between iterations
    if (i < maxIterations) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  log(`Reached max iterations (${maxIterations}). Loop finished.`);
  writeStatus(cwd, profile, {
    timestamp: new Date().toISOString(),
    loop_count: maxIterations,
    status: 'complete',
    last_action: 'max_iterations_reached',
  });
}

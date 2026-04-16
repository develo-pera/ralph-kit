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
import { createSpinner } from './spinner';

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

  prompt += `\n\n## Loop Context\nThis is iteration ${iteration}. Complete ONE task from the fix plan, then stop.\nIMPORTANT: After completing a task, update fix_plan.md to mark it as done — change \`- [ ]\` to \`- [x]\`.\n`;

  return prompt;
}

// ---------------------------------------------------------------------------
// Single iteration
// ---------------------------------------------------------------------------

interface StreamEvent {
  type: string;
  subtype?: string;
  tool_name?: string;
  content?: string;
  message?: { role?: string; content?: unknown };
  [key: string]: unknown;
}

function formatStreamEvent(event: StreamEvent): string | null {
  switch (event.type) {
    case 'assistant': {
      // Text output from Claude
      if (event.subtype === 'text') return event.content ?? null;
      return null;
    }
    case 'tool_use': {
      const name = event.tool_name ?? 'tool';
      return `  → ${name}`;
    }
    case 'tool_result': {
      return null; // too noisy
    }
    case 'result': {
      // Final result — extract text content
      const msg = event.message;
      if (msg && Array.isArray(msg.content)) {
        const texts = (msg.content as Array<{ type: string; text?: string }>)
          .filter((b) => b.type === 'text' && b.text)
          .map((b) => b.text);
        return texts.join('\n') || null;
      }
      return null;
    }
    default:
      return null;
  }
}

function runClaude(prompt: string, cwd: string, allowedTools: string): Promise<{ output: string; exitCode: number }> {
  return new Promise((resolve) => {
    // Write prompt to a temp file
    const tmpPrompt = path.join(os.tmpdir(), `ralph-kit-prompt-${process.pid}-${Date.now()}.md`);
    fs.writeFileSync(tmpPrompt, prompt, 'utf8');

    // Use stream-json for real-time output
    const cmd = `claude --dangerously-skip-permissions -p --output-format stream-json --allowedTools ${JSON.stringify(allowedTools)} < ${JSON.stringify(tmpPrompt)}`;

    const child = spawn('sh', ['-c', cmd], {
      cwd,
      stdio: ['inherit', 'pipe', 'pipe'],
      env: { ...process.env },
    });

    let output = '';
    let jsonBuffer = '';
    const spinner = createSpinner('Claude is working');

    child.stdout.on('data', (data: Buffer) => {
      jsonBuffer += data.toString();

      // stream-json sends one JSON object per line
      const lines = jsonBuffer.split('\n');
      jsonBuffer = lines.pop() ?? ''; // keep incomplete last line in buffer

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const event = JSON.parse(trimmed) as StreamEvent;
          const formatted = formatStreamEvent(event);
          if (formatted) {
            spinner.clear();
            output += formatted + '\n';
            process.stdout.write(formatted + '\n');
          }
          // Update spinner with tool name if it's a tool call
          if (event.type === 'tool_use' && event.tool_name) {
            spinner.update(`Claude is working — ${event.tool_name}`);
          }
        } catch {
          // Not JSON — pass through raw
          spinner.clear();
          output += trimmed + '\n';
          process.stdout.write(trimmed + '\n');
        }
      }
    });

    child.stderr.on('data', (data: Buffer) => {
      const text = data.toString();
      spinner.update();
      process.stderr.write(text);
    });

    child.on('close', (code) => {
      spinner.stop(code === 0 ? 'done' : `exited with code ${code}`);
      // Process any remaining buffered data
      if (jsonBuffer.trim()) {
        try {
          const event = JSON.parse(jsonBuffer.trim()) as StreamEvent;
          const formatted = formatStreamEvent(event);
          if (formatted) {
            output += formatted + '\n';
            process.stdout.write(formatted + '\n');
          }
        } catch {
          output += jsonBuffer;
        }
      }
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

  // Clean up status on interrupt (ctrl+C)
  let currentIteration = 0;
  const cleanup = () => {
    log('Interrupted — cleaning up');
    writeStatus(cwd, profile, {
      timestamp: new Date().toISOString(),
      loop_count: currentIteration,
      status: 'interrupted',
      last_action: 'user_cancelled',
    });
    process.exit(130);
  };
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  log(`ralph-kit loop starting — max ${maxIterations} iterations`);

  let consecutiveErrors = 0;

  for (let i = 1; i <= maxIterations; i++) {
    currentIteration = i;
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

  process.removeListener('SIGINT', cleanup);
  process.removeListener('SIGTERM', cleanup);

  log(`Reached max iterations (${maxIterations}). Loop finished.`);
  writeStatus(cwd, profile, {
    timestamp: new Date().toISOString(),
    loop_count: maxIterations,
    status: 'complete',
    last_action: 'max_iterations_reached',
  });
}

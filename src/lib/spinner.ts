/**
 * Terminal spinner with elapsed time display.
 * Shows a rotating indicator so the user knows the process is alive.
 */

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

export interface Spinner {
  update: (message?: string) => void;
  stop: (finalMessage?: string) => void;
}

export function createSpinner(initialMessage: string): Spinner {
  let frame = 0;
  let message = initialMessage;
  let startTime = Date.now();
  let lastActivity = Date.now();
  let stopped = false;

  function elapsed(): string {
    const secs = Math.floor((Date.now() - startTime) / 1000);
    if (secs < 60) return `${secs}s`;
    const mins = Math.floor(secs / 60);
    const remainSecs = secs % 60;
    return `${mins}m ${remainSecs}s`;
  }

  function sinceActivity(): string {
    const secs = Math.floor((Date.now() - lastActivity) / 1000);
    if (secs < 3) return '';
    return ` (waiting ${secs}s)`;
  }

  const interval = setInterval(() => {
    if (stopped) return;
    frame = (frame + 1) % FRAMES.length;
    const line = `  ${FRAMES[frame]} ${message} — ${elapsed()}${sinceActivity()}`;
    process.stderr.write(`\r\x1b[K${line}`);
  }, 80);

  return {
    update(newMessage?: string) {
      if (newMessage) message = newMessage;
      lastActivity = Date.now();
    },
    stop(finalMessage?: string) {
      stopped = true;
      clearInterval(interval);
      process.stderr.write('\r\x1b[K');
      if (finalMessage) {
        process.stderr.write(`  ${finalMessage}\n`);
      }
    },
  };
}

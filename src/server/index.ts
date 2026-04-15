import path from 'node:path';
import express from 'express';
import { Server } from 'node:http';
import { createRouter } from './routes';

const DEFAULT_MAX_ATTEMPTS = 10;

export interface StartOptions {
  port?: number;
  cwd?: string;
  strictPort?: boolean;
  maxAttempts?: number;
}

export interface StartResult {
  server: Server;
  port: number;
  requestedPort: number;
  cwd: string;
}

export function start({
  port = 4777,
  cwd = process.cwd(),
  strictPort = false,
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
}: StartOptions = {}): Promise<StartResult> {
  const app = express();
  app.use(express.json());
  app.use('/api', createRouter(cwd));
  app.use('/', express.static(path.join(__dirname, '..', '..', 'web', 'dist')));

  return new Promise<StartResult>((resolve, reject) => {
    const tryListen = (candidate: number, attemptsLeft: number): void => {
      const server = app.listen(candidate, '127.0.0.1', () => {
        resolve({ server, port: candidate, requestedPort: port, cwd });
      });
      server.once('error', (err: NodeJS.ErrnoException) => {
        if (err && err.code === 'EADDRINUSE' && !strictPort && attemptsLeft > 1) {
          tryListen(candidate + 1, attemptsLeft - 1);
        } else {
          reject(err);
        }
      });
    };
    tryListen(port, Math.max(1, maxAttempts));
  });
}

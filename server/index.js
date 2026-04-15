'use strict';

const path = require('path');
const express = require('express');
const { createRouter } = require('./routes');

const DEFAULT_MAX_ATTEMPTS = 10;

function start({ port = 4777, cwd = process.cwd(), strictPort = false, maxAttempts = DEFAULT_MAX_ATTEMPTS } = {}) {
  const app = express();
  app.use(express.json());
  app.use('/api', createRouter(cwd));
  app.use('/', express.static(path.join(__dirname, '..', 'web', 'dist')));

  return new Promise((resolve, reject) => {
    const tryListen = (candidate, attemptsLeft) => {
      const server = app.listen(candidate, '127.0.0.1', () => {
        resolve({ server, port: candidate, requestedPort: port, cwd });
      });
      server.once('error', (err) => {
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

module.exports = { start };

'use strict';

const path = require('path');
const express = require('express');
const { createRouter } = require('./routes');

function start({ port = 4777, cwd = process.cwd() } = {}) {
  const app = express();
  app.use(express.json());
  app.use('/api', createRouter(cwd));
  app.use('/', express.static(path.join(__dirname, '..', 'web', 'dist')));

  return new Promise((resolve, reject) => {
    const server = app.listen(port, '127.0.0.1', () => {
      resolve({ server, port, cwd });
    });
    server.on('error', reject);
  });
}

module.exports = { start };

import * as fs from 'node:fs';
import * as http from 'node:http';
import * as path from 'node:path';
import { createApp } from '../app';
import { createRouter } from './router';

/** Local development server: wires the router to node:http. */
const app = createApp();
const indexHtml = path.join(app.config.root, 'public', 'index.html');

const route = createRouter({
  dashboard: app.dashboard,
  syncAll: () => app.sync.syncAll(),
  syncTtlMs: app.config.syncTtlMinutes * 60_000,
  readIndexHtml: () => fs.readFileSync(indexHtml),
  now: Date.now,
  warn: console.warn,
});

const server = http.createServer(async (req, res) => {
  const { status, contentType, body } = await route(req.url ?? '/');
  res.writeHead(status, { 'Content-Type': contentType });
  res.end(body);
});

// Loopback only: the local API has no authentication.
server.listen(app.config.port, '127.0.0.1', () => console.log(`Dashboard on http://localhost:${app.config.port}`));

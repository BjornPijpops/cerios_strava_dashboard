import * as fs from 'node:fs';
import * as http from 'node:http';
import * as path from 'node:path';
import { createApp } from '../app';

const app = createApp();
const publicDir = path.join(app.config.root, 'public');
let lastAttempt = 0;
let syncing: Promise<unknown> | null = null;

/** Syncs at most once per TTL, and never concurrently, so page refreshes can't burn the API budget. */
async function syncIfStale(): Promise<void> {
  if (syncing || Date.now() - lastAttempt < app.config.syncTtlMinutes * 60_000) return;
  lastAttempt = Date.now();
  syncing = app.sync
    .syncAll()
    .then((rs) => rs.filter((r) => r.error).forEach((r) => console.warn(`sync ${r.athleteId}: ${r.error}`)))
    .finally(() => (syncing = null));
  await syncing;
}

const server = http.createServer(async (req, res) => {
  const json = (status: number, body: unknown): void => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  };
  try {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const quarter = url.searchParams.get('quarter') ?? undefined;
    if (url.pathname === '/api/dashboard') {
      // Past quarters are static, so only the current one is worth a sync.
      if (!quarter || quarter === app.dashboard.quarters()[0].id) await syncIfStale();
      const data = app.dashboard.build(quarter);
      data ? json(200, data) : json(404, { error: 'Unknown quarter' });
    } else if (url.pathname.startsWith('/api/challenge/')) {
      const detail = app.dashboard.detail(decodeURIComponent(url.pathname.slice('/api/challenge/'.length)), quarter);
      detail ? json(200, detail) : json(404, { error: 'Unknown challenge or quarter' });
    } else if (url.pathname === '/' || url.pathname === '/index.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(fs.readFileSync(path.join(publicDir, 'index.html')));
    } else {
      res.writeHead(404).end('Not found');
    }
  } catch (e) {
    json(500, { error: (e as Error).message });
  }
});

// Loopback only: the local API has no authentication.
server.listen(app.config.port, '127.0.0.1', () => console.log(`Dashboard on http://localhost:${app.config.port}`));

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRouter, RouterDeps } from './router';

const QUARTER = { id: '2026-Q4' };

function setup(overrides: Partial<RouterDeps> = {}) {
  let now = 1_000_000_000;
  const state = { syncs: 0, warnings: [] as string[], advance: (ms: number) => void (now += ms) };
  const deps: RouterDeps = {
    dashboard: {
      quarters: () => [QUARTER] as never,
      build: (q) => (q && q !== QUARTER.id ? undefined : ({ quarter: QUARTER } as never)),
      detail: (id) => (id === 'running' ? ({ id } as never) : undefined),
    },
    syncAll: async () => (state.syncs++, []),
    syncTtlMs: 60_000,
    readIndexHtml: () => '<html></html>',
    now: () => now,
    warn: (m) => state.warnings.push(m),
    ...overrides,
  };
  return { route: createRouter(deps), state };
}

test('serves the dashboard JSON and 404s an unknown quarter', async () => {
  const { route } = setup();
  const ok = await route('/api/dashboard?quarter=2026-Q4');
  assert.equal(ok.status, 200);
  assert.equal(ok.contentType, 'application/json');
  assert.equal((await route('/api/dashboard?quarter=1999-Q1')).status, 404);
});

test('serves a challenge detail, decodes the id and 404s unknown ones', async () => {
  const { route } = setup();
  assert.equal((await route('/api/challenge/running')).status, 200);
  assert.equal((await route('/api/challenge/%72unning')).status, 200);
  assert.equal((await route('/api/challenge/nope')).status, 404);
});

test('serves the page and 404s other paths', async () => {
  const { route } = setup();
  const page = await route('/');
  assert.equal(page.status, 200);
  assert.match(page.contentType, /text\/html/);
  assert.equal((await route('/secret.txt')).status, 404);
});

test('syncs the current quarter at most once per TTL', async () => {
  const { route, state } = setup();
  await route('/api/dashboard');
  await route('/api/dashboard');
  assert.equal(state.syncs, 1);
  state.advance(61_000);
  await route('/api/dashboard?quarter=2026-Q4');
  assert.equal(state.syncs, 2);
});

test('never syncs for a past quarter', async () => {
  const dashboard = {
    quarters: () => [{ id: '2026-Q4' }, { id: '2026-Q3' }] as never,
    build: () => ({}) as never,
    detail: () => undefined,
  };
  const { route, state } = setup({ dashboard });
  await route('/api/dashboard?quarter=2026-Q3');
  assert.equal(state.syncs, 0);
});

test('concurrent requests share one sync', async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  let calls = 0;
  const { route } = setup({ syncAll: async () => (calls++, await gate, []) });
  const first = route('/api/dashboard');
  const second = route('/api/dashboard');
  release();
  await Promise.all([first, second]);
  assert.equal(calls, 1);
});

test('member sync errors are logged but do not fail the page', async () => {
  const { route, state } = setup({ syncAll: async () => [{ athleteId: 5, error: 'boom' }] });
  assert.equal((await route('/api/dashboard')).status, 200);
  assert.deepEqual(state.warnings, ['sync 5: boom']);
});

test('unexpected failures become a 500 with the message', async () => {
  const { route } = setup({ readIndexHtml: () => { throw new Error('disk gone'); } });
  const res = await route('/');
  assert.equal(res.status, 500);
  assert.match(String(res.body), /disk gone/);
});

test('a malformed challenge URL is a 500, not a crash', async () => {
  const { route } = setup();
  assert.equal((await route('/api/challenge/%E0%A4%A')).status, 500);
});

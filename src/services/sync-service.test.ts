import test from 'node:test';
import assert from 'node:assert/strict';
import { SyncService } from './sync-service';
import { memoryRepo } from '../testing/fixtures';
import { ActivitySource } from '../strava/client';
import { RateLimitError } from '../strava/rate-limit';

const config = {
  firstQuarter: '2026-Q3',
  members: [{ athleteId: 1, name: 'A' }, { athleteId: 2, name: 'B' }],
};

const NOW = Date.parse('2026-11-20T10:00:00Z');

test('first sync starts at the first quarter, second is incremental with overlap', async () => {
  const calls: number[] = [];
  const source: ActivitySource = { fetchActivities: async (_id, after) => (calls.push(after), []) };
  const svc = new SyncService(source, memoryRepo(), config, () => NOW);
  await svc.syncAll();
  await svc.syncAll();
  assert.equal(calls[0], Date.parse('2026-07-01T00:00:00Z') / 1000);
  assert.equal(calls[2], (NOW - 24 * 3600 * 1000) / 1000);
});

test('backfills history when the stored sync does not cover the tracked range', async () => {
  const calls: number[] = [];
  const source: ActivitySource = { fetchActivities: async (_id, after) => (calls.push(after), []) };
  const legacy = { at: '2026-11-19T10:00:00.000Z', from: null };
  const covered = { at: '2026-11-19T10:00:00.000Z', from: '2026-07-01T00:00:00.000Z' };
  await new SyncService(source, memoryRepo({ 1: legacy, 2: covered }), config, () => NOW).syncAll();
  assert.equal(calls[0], Date.parse('2026-07-01T00:00:00Z') / 1000);
  assert.equal(calls[1], (Date.parse(covered.at) - 24 * 3600 * 1000) / 1000);
});

test('a rate-limited member does not stop the others (each member has their own Strava app)', async () => {
  const seen: number[] = [];
  const source: ActivitySource = {
    fetchActivities: async (id) => {
      seen.push(id);
      if (id === config.members[0].athleteId) throw new RateLimitError('limit');
      return [];
    },
  };
  const results = await new SyncService(source, memoryRepo(), config, () => NOW).syncAll();
  assert.equal(seen.length, config.members.length);
  assert.ok(results[0].error);
  assert.ok(results.slice(1).every((r) => !r.error));
});

test('skips members who left, and starts joiners at their first quarter', async () => {
  const calls: Array<[number, number]> = [];
  const source: ActivitySource = { fetchActivities: async (id, after, before) => (calls.push([id, after]), []) };
  const cfg = {
    firstQuarter: '2026-Q1',
    members: [
      { athleteId: 1, name: 'leaver', leftQuarter: '2026-Q2' },
      { athleteId: 2, name: 'joiner', joinedQuarter: '2026-Q4' },
      { athleteId: 3, name: 'leaver-unsynced', leftQuarter: '2026-Q2' },
    ],
  };
  const repo = memoryRepo({ 1: { at: '2026-07-05T00:00:00.000Z', from: '2026-01-01T00:00:00.000Z' } });
  await new SyncService(source, repo, cfg, () => NOW).syncAll();
  assert.deepEqual(calls.map(([id]) => id), [2, 3]);
  assert.equal(calls[0][1], Date.parse('2026-10-01T00:00:00Z') / 1000);
});

test('members without tokens are reported, not fetched', async () => {
  const fetched: number[] = [];
  const source: ActivitySource = { fetchActivities: async (id) => (fetched.push(id), []) };
  const results = await new SyncService(source, memoryRepo(), config, () => NOW, (id) => id === 2).syncAll();
  assert.deepEqual(fetched, [2]);
  assert.equal(results[0].error, 'no tokens configured');
});

test('fetched activities and the sync marker are stored; a failed fetch stores nothing', async () => {
  const repo = memoryRepo();
  const ok: ActivitySource = { fetchActivities: async (id) => [{ id: id * 100 } as never] };
  await new SyncService(ok, repo, config, () => NOW).syncAll();
  assert.equal(repo.stored.length, 2);
  assert.equal(repo.getSync(1)?.at, new Date(NOW).toISOString());

  const failing = memoryRepo();
  const broken: ActivitySource = { fetchActivities: async () => { throw new Error('boom'); } };
  const results = await new SyncService(broken, failing, config, () => NOW).syncAll();
  assert.equal(failing.stored.length, 0);
  assert.equal(failing.getSync(1), null);
  assert.equal(results[0].error, 'boom');
});

test('a leaver is fetched only up to the end of their last quarter, and not again once synced after it', async () => {
  const windows: Array<[number, number]> = [];
  const source: ActivitySource = { fetchActivities: async (_id, after, before) => (windows.push([after, before]), []) };
  const cfg = { firstQuarter: '2026-Q1', members: [{ athleteId: 1, name: 'leaver', leftQuarter: '2026-Q2' }] };
  const repo = memoryRepo();
  const svc = new SyncService(source, repo, cfg, () => NOW);
  await svc.syncAll();
  assert.equal(windows[0][1], Date.parse('2026-07-01T00:00:00Z') / 1000);
  await svc.syncAll();
  assert.equal(windows.length, 1);
});

test('syncing twice in a row is idempotent for the stored marker window', async () => {
  const source: ActivitySource = { fetchActivities: async () => [] };
  const repo = memoryRepo();
  const svc = new SyncService(source, repo, config, () => NOW);
  await svc.syncAll();
  const first = repo.getSync(1);
  await svc.syncAll();
  assert.equal(repo.getSync(1)?.from, first?.from);
});

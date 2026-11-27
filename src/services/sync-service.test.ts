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
  const covered = { at: '2026-11-19T10:00:00.000Z', from: '2026-07-01T00:00:00.000Z', fullAt: '2026-11-20T09:00:00.000Z' };
  await new SyncService(source, memoryRepo({ 1: legacy, 2: covered }), config, () => NOW).syncAll();
  assert.equal(calls[0], Date.parse('2026-07-01T00:00:00Z') / 1000);
  assert.equal(calls[1], (Date.parse(covered.at) - 24 * 3600 * 1000) / 1000);
});

const stravaActivity = (id: number, athleteId: number, startDate: string, name = `a${id}`) => ({ id, athleteId, startDate, name }) as never;
const cfg1 = { firstQuarter: '2026-Q1', members: [{ athleteId: 1, name: 'A' }] };
const syncedAt = (iso: string) => ({ at: iso, from: '2026-01-01T00:00:00.000Z' });

test('the daily refresh fetches the whole current quarter, then later runs are incremental again', async () => {
  const calls: number[] = [];
  const source: ActivitySource = { fetchActivities: async (_id, after) => (calls.push(after), []) };
  const repo = memoryRepo({ 1: syncedAt('2026-11-19T10:00:00.000Z') });
  let now = NOW;
  const svc = new SyncService(source, repo, cfg1, () => now);
  await svc.syncAll();
  now += 30 * 60 * 1000;
  await svc.syncAll();
  now += 24 * 3600 * 1000;
  await svc.syncAll();
  const quarterStart = Date.parse('2026-10-01T00:00:00Z') / 1000;
  assert.deepEqual(calls.map((c) => c === quarterStart), [true, false, true]);
});

test('the daily refresh corrects edited activities and drops deleted ones, only for that member and quarter', async () => {
  const repo = memoryRepo({ 1: syncedAt('2026-11-19T10:00:00.000Z') });
  repo.upsertMany([
    stravaActivity(1, 1, '2026-11-02T08:00:00Z', 'wrong'),
    stravaActivity(2, 1, '2026-11-03T08:00:00Z', 'deleted in strava'),
    stravaActivity(3, 1, '2026-08-03T08:00:00Z', 'earlier quarter'),
    stravaActivity(4, 2, '2026-11-03T08:00:00Z', 'someone else'),
  ]);
  const source: ActivitySource = { fetchActivities: async () => [stravaActivity(1, 1, '2026-11-02T08:00:00Z', 'fixed')] };
  await new SyncService(source, repo, cfg1, () => NOW).syncAll();
  assert.deepEqual(repo.stored.map((a) => a.name).sort(), ['earlier quarter', 'fixed', 'someone else']);
});

test('an incremental run never removes stored activities', async () => {
  const repo = memoryRepo({ 1: { ...syncedAt('2026-11-20T09:00:00.000Z'), fullAt: '2026-11-20T09:00:00.000Z' } });
  repo.upsertMany([stravaActivity(2, 1, '2026-11-03T08:00:00Z')]);
  const source: ActivitySource = { fetchActivities: async () => [] };
  await new SyncService(source, repo, cfg1, () => NOW).syncAll();
  assert.equal(repo.stored.length, 1);
});

test('a failed refresh keeps the stored activities and retries on the next run', async () => {
  const repo = memoryRepo({ 1: syncedAt('2026-11-19T10:00:00.000Z') });
  repo.upsertMany([stravaActivity(2, 1, '2026-11-03T08:00:00Z')]);
  const broken: ActivitySource = { fetchActivities: async () => { throw new RateLimitError('limit'); } };
  const results = await new SyncService(broken, repo, cfg1, () => NOW).syncAll();
  assert.ok(results[0].error);
  assert.equal(repo.stored.length, 1);
  assert.equal(repo.getSync(1)?.fullAt, undefined);
});

test('in the first week of a quarter the refresh also covers the previous quarter', async () => {
  const calls: number[] = [];
  const source: ActivitySource = { fetchActivities: async (_id, after) => (calls.push(after), []) };
  const early = Date.parse('2026-10-04T10:00:00Z');
  await new SyncService(source, memoryRepo({ 1: syncedAt('2026-10-03T10:00:00.000Z') }), cfg1, () => early).syncAll();
  const later = Date.parse('2026-10-09T10:00:00Z');
  await new SyncService(source, memoryRepo({ 1: syncedAt('2026-10-08T10:00:00.000Z') }), cfg1, () => later).syncAll();
  assert.deepEqual(calls, [Date.parse('2026-07-01T00:00:00Z') / 1000, Date.parse('2026-10-01T00:00:00Z') / 1000]);
});

test('the refresh never reaches before a member joined', async () => {
  const calls: number[] = [];
  const source: ActivitySource = { fetchActivities: async (_id, after) => (calls.push(after), []) };
  const cfg = { firstQuarter: '2026-Q1', members: [{ athleteId: 1, name: 'A', joinedQuarter: '2026-Q4' }] };
  const early = Date.parse('2026-10-04T10:00:00Z');
  const repo = memoryRepo({ 1: { at: '2026-10-03T10:00:00.000Z', from: '2026-10-01T00:00:00.000Z' } });
  await new SyncService(source, repo, cfg, () => early).syncAll();
  assert.deepEqual(calls, [Date.parse('2026-10-01T00:00:00Z') / 1000]);
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

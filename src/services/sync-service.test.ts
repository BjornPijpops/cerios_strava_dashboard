import test from 'node:test';
import assert from 'node:assert/strict';
import { SyncService } from './sync-service';
import { Activity } from '../domain/types';
import { ActivityRepository, SyncMarker } from '../infra/activity-repository';
import { ActivitySource } from '../strava/client';
import { RateLimitError } from '../strava/rate-limit';

const config = {
  firstQuarter: '2026-Q3',
  members: [{ athleteId: 1, name: 'A' }, { athleteId: 2, name: 'B' }],
};

function memoryRepo(initial: Record<number, SyncMarker> = {}): ActivityRepository & { stored: Activity[] } {
  const synced: Record<number, SyncMarker> = { ...initial };
  const stored: Activity[] = [];
  return {
    stored,
    upsertMany: (a) => void stored.push(...a),
    all: () => stored,
    getSync: (id) => synced[id] ?? null,
    setSync: (id, marker) => void (synced[id] = marker),
    lastSyncedAt: () => null,
  };
}

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

test('stops after a rate limit error', async () => {
  let n = 0;
  const source: ActivitySource = {
    fetchActivities: async () => {
      n++;
      throw new RateLimitError('limit');
    },
  };
  const results = await new SyncService(source, memoryRepo(), config, () => NOW).syncAll();
  assert.equal(n, 1);
  assert.equal(results.length, 1);
  assert.ok(results[0].error);
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

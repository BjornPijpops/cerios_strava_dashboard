import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { Activity } from '../domain/types';
import { JsonActivityRepository } from './activity-repository';

const tempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'repo-'));
const activity = (id: number, name: string) => ({ id, name }) as unknown as Activity;

test('upserting the same id twice keeps one activity with the latest data', () => {
  const repo = new JsonActivityRepository(tempDir());
  repo.upsertMany([activity(1, 'old')]);
  repo.upsertMany([activity(1, 'new'), activity(2, 'other')]);
  assert.deepEqual(repo.all().map((a) => a.name).sort(), ['new', 'other']);
});

test('data survives creating a new repository on the same folder', () => {
  const dir = tempDir();
  new JsonActivityRepository(dir).upsertMany([activity(1, 'kept')]);
  assert.equal(new JsonActivityRepository(dir).all()[0].name, 'kept');
});

test('sync markers round-trip and are null for unknown athletes', () => {
  const repo = new JsonActivityRepository(tempDir());
  assert.equal(repo.getSync(1), null);
  repo.setSync(1, { at: '2026-01-01T00:00:00Z', from: '2025-10-01T00:00:00Z' });
  assert.deepEqual(repo.getSync(1), { at: '2026-01-01T00:00:00Z', from: '2025-10-01T00:00:00Z' });
});

test('replaceRange swaps one athlete\'s activities inside the range and nothing else', () => {
  const dir = tempDir();
  const repo = new JsonActivityRepository(dir);
  const at = (id: number, athleteId: number, startDate: string, name: string) => ({ id, athleteId, startDate, name }) as unknown as Activity;
  repo.upsertMany([
    at(1, 1, '2026-11-02T08:00:00Z', 'old'),
    at(2, 1, '2026-08-02T08:00:00Z', 'before range'),
    at(3, 2, '2026-11-02T08:00:00Z', 'other athlete'),
    at(4, 1, '2026-10-01T00:00:00Z', 'exactly on the boundary'),
  ]);
  const after = Date.parse('2026-10-01T00:00:00Z') / 1000;
  const before = Date.parse('2026-12-01T00:00:00Z') / 1000;
  repo.replaceRange(1, after, before, [at(5, 1, '2026-11-05T08:00:00Z', 'new')]);
  assert.deepEqual(new JsonActivityRepository(dir).all().map((a) => a.name).sort(), ['before range', 'exactly on the boundary', 'new', 'other athlete']);
});

test('the full refresh time round-trips, survives later markers without it, and is absent for old data', () => {
  const dir = tempDir();
  const repo = new JsonActivityRepository(dir);
  repo.setSync(1, { at: '2026-01-01T00:00:00Z', from: null });
  assert.equal(repo.getSync(1)?.fullAt, undefined);
  repo.setSync(1, { at: '2026-01-02T00:00:00Z', from: null, fullAt: '2026-01-02T00:00:00Z' });
  repo.setSync(1, { at: '2026-01-03T00:00:00Z', from: null });
  assert.equal(new JsonActivityRepository(dir).getSync(1)?.fullAt, '2026-01-02T00:00:00Z');
});

test('lastSyncedAt is the most recent sync of any member, or null before any sync', () => {
  const repo = new JsonActivityRepository(tempDir());
  assert.equal(repo.lastSyncedAt(), null);
  repo.setSync(1, { at: '2026-01-01T00:00:00Z', from: null });
  repo.setSync(2, { at: '2026-03-01T00:00:00Z', from: null });
  repo.setSync(3, { at: '2026-02-01T00:00:00Z', from: null });
  assert.equal(repo.lastSyncedAt(), '2026-03-01T00:00:00Z');
});

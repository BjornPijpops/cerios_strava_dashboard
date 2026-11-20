import assert from 'node:assert/strict';
import { test } from 'node:test';
import { activity, challengeFile, memoryRepo } from '../testing/fixtures';
import { DashboardService } from './dashboard-service';

const NOW = Date.parse('2026-11-20T10:00:00Z'); // 2026-Q4

function service(overrides = {}) {
  const repo = memoryRepo();
  repo.upsertMany([
    activity({ id: 1, athleteId: 1, startDate: '2026-11-10T08:00:00Z', movingTimeSec: 7200 }),
    activity({ id: 2, athleteId: 2, startDate: '2026-08-10T08:00:00Z', movingTimeSec: 3600 }),
  ]);
  return new DashboardService(repo, challengeFile(overrides), () => NOW);
}

test('lists quarters from the first one to the current, newest first', () => {
  assert.deepEqual(service().quarters().map((q) => q.id), ['2026-Q4', '2026-Q3']);
});

test('defaults to the current quarter and only counts its activities', () => {
  const data = service().build()!;
  assert.equal(data.quarter.id, '2026-Q4');
  assert.equal(data.generatedAt, '2026-11-20T10:00:00.000Z');
  assert.equal(data.challenges.find((c) => c.id === 'group')!.total, 2);
});

test('a historical quarter counts only its own activities', () => {
  const data = service().build('2026-Q3')!;
  assert.equal(data.challenges.find((c) => c.id === 'group')!.total, 1);
});

test('uses the goal that applies to the quarter', () => {
  const svc = service({
    challenges: [{ id: 'group', name: 'G', metric: 'movingTime', sportTypes: '*', goal: 100, goalByQuarter: { '2026-Q3': 50 } }],
  });
  assert.equal(svc.build('2026-Q3')!.challenges[0].goal, 50);
  assert.equal(svc.build('2026-Q4')!.challenges[0].goal, 100);
});

test('unknown quarters and challenges are undefined, not errors', () => {
  const svc = service();
  assert.equal(svc.build('2020-Q1'), undefined);
  assert.equal(svc.detail('group', '2020-Q1'), undefined);
  assert.equal(svc.detail('nope'), undefined);
});

test('detail carries title, quarter list and last sync time', () => {
  const detail = service().detail('group', '2026-Q4')!;
  assert.equal(detail.title, 'Test Challenge');
  assert.equal(detail.quarter.id, '2026-Q4');
  assert.equal(detail.quarters.length, 2);
  assert.equal(detail.lastSyncedAt, null);
});

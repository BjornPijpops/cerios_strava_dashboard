import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregate } from './aggregate';
import { Activity, ChallengeConfig } from './types';

const config: ChallengeConfig = {
  period: { start: '2026-10-01', end: '2026-12-31' },
  members: [
    { athleteId: 1, name: 'A' },
    { athleteId: 2, name: 'B' },
  ],
  challenges: [
    { id: 'group', name: 'Group', metric: 'movingTime', sportTypes: '*', goal: 10 },
    { id: 'run', name: 'Run', metric: 'distance', sportTypes: ['Run'] },
  ],
};

let nextId = 1;
const act = (over: Partial<Activity>): Activity => ({
  id: nextId++,
  athleteId: 1,
  name: 'x',
  sportType: 'Run',
  startDate: '2026-11-01T10:00:00Z',
  movingTimeSec: 3600,
  elapsedTimeSec: 3700,
  distanceM: 10000,
  ...over,
});

test('sums per challenge and ranks members', () => {
  const [group, run] = aggregate([act({}), act({ athleteId: 2, sportType: 'Ride', movingTimeSec: 7200 })], config);
  assert.equal(group.total, 3);
  assert.equal(group.progress, 0.3);
  assert.equal(group.leaderboard[0].name, 'B');
  assert.equal(run.total, 10);
  assert.equal(run.activityCount, 1);
});

test('ignores activities outside the period (end date inclusive)', () => {
  const [group] = aggregate(
    [
      act({ startDate: '2026-09-30T23:59:59Z' }),
      act({ startDate: '2027-01-01T00:00:00Z' }),
      act({ startDate: '2026-12-31T23:00:00Z' }),
    ],
    config,
  );
  assert.equal(group.activityCount, 1);
});

test('activities of people who are not members that quarter are ignored', () => {
  const [group] = aggregate([act({ athleteId: 99 }), act({})], config);
  assert.equal(group.activityCount, 1);
  assert.equal(group.total, 1);
});

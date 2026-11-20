import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDetail } from './detail';
import { Activity, ChallengeConfig } from './types';

const challenge = { id: 'run', name: 'Run', metric: 'distance' as const, sportTypes: ['Run'], goal: 100 };
const config: ChallengeConfig = {
  period: { start: '2026-10-05', end: '2026-10-25' },
  members: [{ athleteId: 1, name: 'A' }, { athleteId: 2, name: 'B' }],
  challenges: [challenge],
};

let id = 1;
const act = (over: Partial<Activity>): Activity => ({
  id: id++,
  athleteId: 1,
  name: 'run',
  sportType: 'Run',
  startDate: '2026-10-06T08:00:00Z', // Tuesday
  movingTimeSec: 3600,
  elapsedTimeSec: 3600,
  distanceM: 10000,
  ...over,
});

const NOW = Date.parse('2026-10-20T12:00:00Z');

test('weekly series is cumulative and starts on a Monday', () => {
  const d = buildDetail([act({}), act({ startDate: '2026-10-14T08:00:00Z', distanceM: 5000 })], config, challenge, NOW);
  assert.deepEqual(d.weekly.map((w) => [w.weekStart, w.total, w.cumulative]), [
    ['2026-10-05', 10, 10],
    ['2026-10-12', 5, 15],
    ['2026-10-19', 0, 15],
  ]);
});

test('breaks down by weekday, sport, member and finds the biggest activity', () => {
  const d = buildDetail(
    [act({}), act({ athleteId: 2, sportType: 'Run', distanceM: 20000, startDate: '2026-10-10T08:00:00Z' })],
    config,
    challenge,
    NOW,
  );
  assert.equal(d.weekdays[1], 10); // Tuesday
  assert.equal(d.weekdays[5], 20); // Saturday
  assert.equal(d.bySport[0].count, 2);
  assert.equal(d.members[0].name, 'B');
  assert.equal(d.biggest?.member, 'B');
  assert.equal(d.activeDays, 2);
  assert.equal(d.avgPerActivity, 15);
});

test('projects the final total from the current pace', () => {
  const d = buildDetail([act({ distanceM: 30000 })], config, challenge, Date.parse('2026-10-15T12:00:00Z'));
  assert.ok(d.projectedTotal! > 30);
});

test('only shows distance and pace for distance sports', () => {
  const badminton = act({ sportType: 'Badminton', distanceM: 2000, averageHeartrate: 130.4 });
  const run = act({ distanceM: 10000, movingTimeSec: 3000 });
  const all = { ...challenge, sportTypes: '*' as const };
  const d = buildDetail([badminton, run], { ...config, challenges: [all] }, all, NOW);
  const b = d.recent.find((a) => a.sportType === 'Badminton')!;
  const r = d.recent.find((a) => a.sportType === 'Run')!;
  assert.equal(b.hasDistance, false);
  assert.equal(b.pace, undefined);
  assert.equal(b.averageHeartrate, 130);
  assert.deepEqual(r.pace, { value: 5, unit: 'min/km' });
});

test('a challenge without matching activities gives an empty but valid detail', () => {
  const d = buildDetail([], config, challenge, NOW);
  assert.equal(d.biggest, null);
  assert.deepEqual(d.recent, []);
  assert.equal(d.activeDays, 0);
  assert.equal(d.avgPerActivity, 0);
  assert.deepEqual(d.members.map((m) => [m.name, m.total, m.best]), [['A', 0, 0], ['B', 0, 0]]);
});

test('members are counted with their own days, count and best activity', () => {
  const d = buildDetail(
    [act({}), act({ startDate: '2026-10-07T08:00:00Z', distanceM: 3000 }), act({ startDate: '2026-10-07T18:00:00Z', distanceM: 2000 })],
    config,
    challenge,
    NOW,
  );
  assert.deepEqual(d.members[0], { athleteId: 1, name: 'A', total: 15, count: 3, activeDays: 2, best: 10 });
});

test('activities outside the period or from non-members are ignored', () => {
  const d = buildDetail([act({ startDate: '2026-09-01T08:00:00Z' }), act({ athleteId: 99 })], config, challenge, NOW);
  assert.equal(d.summary.activityCount, 0);
  assert.deepEqual(d.recent, []);
});

test('an unknown challenge is a descriptive error, not a crash on undefined', () => {
  assert.throws(() => buildDetail([], config, { ...challenge, id: 'nope' }, NOW), /Challenge "nope" is not part of the given config/);
});

test('without a goal there is no projection', () => {
  const noGoal = { ...challenge, goal: undefined };
  const d = buildDetail([act({})], { ...config, challenges: [noGoal] }, noGoal, NOW);
  assert.equal(d.projectedTotal, undefined);
});

test('the projection assumes at least one elapsed day, so the first hours do not explode it', () => {
  const d = buildDetail([act({ distanceM: 1000 })], config, challenge, Date.parse('2026-10-05T01:00:00Z'));
  assert.equal(d.projectedTotal, 21); // 1 km per day over a 21-day period
});

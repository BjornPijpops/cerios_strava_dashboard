import test from 'node:test';
import assert from 'node:assert/strict';
import { listQuarters, parseQuarter, quarterBounds, quarterIdOf, resolveConfig } from './quarters';
import { ChallengeFile } from './types';

const NOW = Date.parse('2026-11-20T10:00:00Z');

test('parses quarter bounds, including leap-year Q1', () => {
  assert.deepEqual(parseQuarter('2026-Q4', NOW), { id: '2026-Q4', label: '2026 Q4', start: '2026-10-01', end: '2026-12-31', current: true });
  assert.equal(parseQuarter('2028-Q1', NOW).end, '2028-03-31');
  assert.equal(parseQuarter('2026-Q3', NOW).current, false);
  assert.throws(() => parseQuarter('2026-Q5', NOW));
});

test('lists quarters newest first across a year boundary', () => {
  const ids = listQuarters('2025-Q4', Date.parse('2026-02-01T00:00:00Z')).map((q) => q.id);
  assert.deepEqual(ids, ['2026-Q1', '2025-Q4']);
  assert.equal(quarterIdOf(Date.parse('2026-12-31T23:59:59Z')), '2026-Q4');
});

test('applies per-quarter goal overrides', () => {
  const file: ChallengeFile = {
    title: 't',
    firstQuarter: '2026-Q3',
    members: [],
    challenges: [{ id: 'g', name: 'G', metric: 'movingTime', sportTypes: '*', goal: 700, goalByQuarter: { '2026-Q3': 500 } }],
  };
  assert.equal(resolveConfig(file, parseQuarter('2026-Q3', NOW)).challenges[0].goal, 500);
  assert.equal(resolveConfig(file, parseQuarter('2026-Q4', NOW)).challenges[0].goal, 700);
});

test('resolveConfig only includes members active in that quarter', () => {
  const file: ChallengeFile = {
    title: 't',
    firstQuarter: '2026-Q1',
    members: [
      { athleteId: 1, name: 'always' },
      { athleteId: 2, name: 'joiner', joinedQuarter: '2026-Q3' },
      { athleteId: 3, name: 'leaver', leftQuarter: '2026-Q2' },
      { athleteId: 4, name: 'short', joinedQuarter: '2026-Q2', leftQuarter: '2026-Q2' },
    ],
    challenges: [],
  };
  const names = (q: string) => resolveConfig(file, parseQuarter(q, NOW)).members.map((m) => m.name);
  assert.deepEqual(names('2026-Q1'), ['always', 'leaver']);
  assert.deepEqual(names('2026-Q2'), ['always', 'leaver', 'short']);
  assert.deepEqual(names('2026-Q3'), ['always', 'joiner']);
});

test('quarterBounds is clock-free and rejects invalid ids', () => {
  assert.deepEqual(quarterBounds('2026-Q1'), { id: '2026-Q1', label: '2026 Q1', start: '2026-01-01', end: '2026-03-31' });
  assert.throws(() => quarterBounds('2026-Q0'), /Invalid quarter/);
});

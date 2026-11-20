import assert from 'node:assert/strict';
import { test } from 'node:test';
import { activity } from '../testing/fixtures';
import { weekdayTotals, weeklySeries } from './time-series';

const hours = (a: { movingTimeSec: number }) => a.movingTimeSec / 3600;
const MONDAY = '2026-11-02T08:00:00Z';
const SUNDAY = '2026-11-08T08:00:00Z';
const NEXT_MONDAY = '2026-11-09T08:00:00Z';
const range = { startMs: Date.parse('2026-11-01T00:00:00Z'), endMs: Date.parse('2027-01-01T00:00:00Z') };

test('weeks start on Monday: Sunday belongs to the previous week', () => {
  const series = weeklySeries([activity({ startDate: SUNDAY }), activity({ startDate: NEXT_MONDAY })], hours, range, Date.parse('2026-11-20T00:00:00Z'));
  const byWeek = Object.fromEntries(series.map((p) => [p.weekStart, p.total]));
  assert.equal(byWeek['2026-11-02'], 1);
  assert.equal(byWeek['2026-11-09'], 1);
});

test('the series has a point for empty weeks and keeps a running total', () => {
  const series = weeklySeries([activity({ startDate: MONDAY })], hours, range, Date.parse('2026-11-20T00:00:00Z'));
  assert.deepEqual(series.map((p) => p.weekStart), ['2026-10-26', '2026-11-02', '2026-11-09', '2026-11-16']);
  assert.deepEqual(series.map((p) => p.cumulative), [0, 1, 1, 1]);
});

test('the series stops at the period end and is empty before the period starts', () => {
  const ended = weeklySeries([], hours, { startMs: range.startMs, endMs: Date.parse('2026-11-08T00:00:00Z') }, Date.parse('2027-06-01T00:00:00Z'));
  assert.deepEqual(ended.map((p) => p.weekStart), ['2026-10-26', '2026-11-02']);
  assert.deepEqual(weeklySeries([], hours, range, Date.parse('2026-10-01T00:00:00Z')), []);
});

test('weekday totals start on Monday and put Sunday last', () => {
  const totals = weekdayTotals([activity({ startDate: MONDAY }), activity({ startDate: SUNDAY, movingTimeSec: 7200 })], hours);
  assert.deepEqual(totals, [1, 0, 0, 0, 0, 0, 2]);
});

test('no activities gives seven zeros', () => {
  assert.deepEqual(weekdayTotals([], hours), [0, 0, 0, 0, 0, 0, 0]);
});

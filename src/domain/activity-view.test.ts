import assert from 'node:assert/strict';
import { test } from 'node:test';
import { activity } from '../testing/fixtures';
import { toActivityView } from './activity-view';

const view = (overrides = {}) => toActivityView(activity(overrides), 'Anna', 10);

test('running pace is minutes per km', () => {
  // 10 km in 60 minutes
  assert.deepEqual(view().pace, { value: 6, unit: 'min/km' });
});

test('cycling pace is km/h', () => {
  assert.deepEqual(view({ sportType: 'Ride', distanceM: 30_000, movingTimeSec: 3600 }).pace, { value: 30, unit: 'km/h' });
});

test('sports without meaningful distance have no pace and no distance flag', () => {
  const weights = view({ sportType: 'WeightTraining', distanceM: 5000 });
  assert.equal(weights.pace, undefined);
  assert.equal(weights.hasDistance, false);
});

test('zero distance or zero time gives no pace instead of Infinity or NaN', () => {
  assert.equal(view({ distanceM: 0 }).pace, undefined);
  assert.equal(view({ movingTimeSec: 0 }).pace, undefined);
  assert.equal(view({ distanceM: 0 }).hasDistance, false);
});

test('elevation and heart rate are rounded, and omitted when zero or missing', () => {
  const full = view({ elevationGainM: 12.6, averageHeartrate: 141.4 });
  assert.equal(full.elevationGainM, 13);
  assert.equal(full.averageHeartrate, 141);
  const none = view({ elevationGainM: 0 });
  assert.equal(none.elevationGainM, undefined);
  assert.equal(none.averageHeartrate, undefined);
});

test('carries the member name and the challenge value', () => {
  const v = view();
  assert.equal(v.member, 'Anna');
  assert.equal(v.value, 10);
  assert.equal(v.hours, 1);
  assert.equal(v.km, 10);
});

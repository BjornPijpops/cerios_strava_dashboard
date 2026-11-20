import test from 'node:test';
import assert from 'node:assert/strict';
import { RateLimitError, RateLimitGuard, RateLimitRegistry } from './rate-limit';

const MINUTE = 60_000;

/** A clock the test moves by hand. */
function fakeClock(start = 1_000_000) {
  let now = start;
  return { now: () => now, advance: (ms: number) => void (now += ms) };
}

const usage = (limit: string, used: string) => new Headers({ 'x-ratelimit-limit': limit, 'x-ratelimit-usage': used });

test('every Strava app has its own budget', () => {
  const registry = new RateLimitRegistry(fakeClock().now, 5);
  registry.forApp('a').record(usage('100,1000', '99,10'));
  assert.throws(() => registry.forApp('a').assertCanRequest(), RateLimitError);
  assert.doesNotThrow(() => registry.forApp('b').assertCanRequest());
  assert.equal(registry.forApp('a'), registry.forApp('a'));
  assert.equal(registry.busiest().usage15, 99);
});

test('busiest falls back to an empty budget before any app was used', () => {
  assert.equal(new RateLimitRegistry(fakeClock().now).busiest().usage15, 0);
});

test('blocks requests once the 15-minute reserve is reached', () => {
  const guard = new RateLimitGuard(fakeClock().now, 5);
  guard.record(usage('100,1000', '95,200'));
  assert.throws(() => guard.assertCanRequest(), /15-minute budget exhausted/);
});

test('blocks requests once the daily reserve is reached', () => {
  const guard = new RateLimitGuard(fakeClock().now, 5);
  guard.record(usage('100,1000', '10,995'));
  assert.throws(() => guard.assertCanRequest(), /Daily budget exhausted/);
});

test('allows requests with budget left and tracks usage locally', () => {
  const guard = new RateLimitGuard(fakeClock().now, 5);
  guard.assertCanRequest();
  guard.record(new Headers());
  assert.equal(guard.snapshot().usage15, 1);
  assert.equal(guard.snapshot().usageDay, 1);
});

test('the 15-minute usage resets after 15 minutes but the daily usage does not', () => {
  const clock = fakeClock();
  const guard = new RateLimitGuard(clock.now, 5);
  guard.record(usage('100,1000', '99,500'));
  clock.advance(14 * MINUTE);
  assert.throws(() => guard.assertCanRequest(), RateLimitError);
  clock.advance(1 * MINUTE);
  assert.doesNotThrow(() => guard.assertCanRequest());
  assert.deepEqual([guard.snapshot().usage15, guard.snapshot().usageDay], [0, 500]);
});

test('malformed or partial headers are ignored and only the local count is kept', () => {
  const guard = new RateLimitGuard(fakeClock().now, 5);
  guard.record(new Headers({ 'x-ratelimit-limit': 'abc', 'x-ratelimit-usage': '7' }));
  assert.deepEqual(guard.snapshot(), { limit15: 100, limitDay: 1000, usage15: 1, usageDay: 1 });
});

test('learns the real limits from the headers', () => {
  const guard = new RateLimitGuard(fakeClock().now, 5);
  guard.record(usage('200,2000', '3,30'));
  assert.deepEqual(guard.snapshot(), { limit15: 200, limitDay: 2000, usage15: 3, usageDay: 30 });
});

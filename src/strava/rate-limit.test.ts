import test from 'node:test';
import assert from 'node:assert/strict';
import { RateLimitError, RateLimitGuard } from './rate-limit';

test('blocks requests once the reserve is reached', () => {
  const guard = new RateLimitGuard(5);
  const headers = new Headers({ 'x-ratelimit-limit': '100,1000', 'x-ratelimit-usage': '95,200' });
  guard.record(headers);
  assert.throws(() => guard.assertCanRequest(), RateLimitError);
});

test('allows requests with budget left and tracks usage locally', () => {
  const guard = new RateLimitGuard(5);
  guard.assertCanRequest();
  guard.record(new Headers());
  assert.equal(guard.snapshot().usage15, 1);
});

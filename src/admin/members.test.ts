import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseRedirect, parseRepo } from './members';

test('reads owner and repo from https and ssh remotes', () => {
  assert.deepEqual(parseRepo('https://github.com/BjornPijpops/cerios_strava_dashboard.git'), { owner: 'BjornPijpops', repo: 'cerios_strava_dashboard' });
  assert.deepEqual(parseRepo('git@github.com:a/b'), { owner: 'a', repo: 'b' });
  assert.throws(() => parseRepo('https://example.com/x'), /owner\/repo/);
});

test('extracts code and scope from the redirect URL', () => {
  const r = parseRedirect('http://localhost/?state=&code=abc123&scope=read,activity:read_all');
  assert.deepEqual(r, { code: 'abc123', scope: 'read,activity:read_all' });
});

test('accepts a bare code and surrounding whitespace', () => {
  assert.deepEqual(parseRedirect('  abc123 \n'), { code: 'abc123' });
});

test('rejects a URL without a code', () => {
  assert.throws(() => parseRedirect('http://localhost/?error=access_denied'), /redirect URL/);
});

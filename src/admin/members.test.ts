import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseRedirect } from './members';

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

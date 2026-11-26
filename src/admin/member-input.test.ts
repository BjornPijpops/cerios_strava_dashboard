import assert from 'node:assert/strict';
import { test } from 'node:test';
import { accessFromScope, parseRedirect, validateMemberInput } from './member-input';

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

test('validates the three member values and trims them', () => {
  const input = validateMemberInput(' 123 ', ' secret ', 'http://localhost/?code=c1&scope=read,activity:read_all');
  assert.deepEqual(input, { clientId: '123', clientSecret: 'secret', code: 'c1', scope: 'read,activity:read_all' });
});

test('accepts a public-only grant and a bare code', () => {
  assert.equal(validateMemberInput('1', 's', 'http://localhost/?code=c1&scope=read,activity:read').scope, 'read,activity:read');
  assert.deepEqual(validateMemberInput('1', 's', 'c1'), { clientId: '1', clientSecret: 's', code: 'c1' });
});

test('maps granted scopes to the access they give', () => {
  assert.equal(accessFromScope('read,activity:read_all'), 'all');
  assert.equal(accessFromScope('read,activity:read'), 'public');
  assert.equal(accessFromScope('read'), undefined);
  assert.equal(accessFromScope(undefined), undefined);
  assert.equal(accessFromScope('read,activity:read_all_extra'), undefined);
});

test('rejects a non-numeric client id, an empty secret and a grant without activity access', () => {
  const url = 'http://localhost/?code=c1&scope=read,activity:read_all';
  assert.throws(() => validateMemberInput('abc', 's', url), /Client ID must be a number/);
  assert.throws(() => validateMemberInput('1', ' ', url), /Client Secret/);
  assert.throws(() => validateMemberInput('1', 's', 'http://localhost/?code=c1&scope=read'), /neither/);
  assert.throws(() => validateMemberInput('1', 's', 'http://localhost/?code=c1&scope=read,activity:read_all_extra'), /neither/);
});

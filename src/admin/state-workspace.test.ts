import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { git } from './git';
import { StateWorkspace } from './state-workspace';
import { StateBundle } from '../strava/state-bundle';

/** A local bare repository stands in for the GitHub remote. */
function bareRemote(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'remote-'));
  git(dir, 'init', '--quiet', '--bare');
  return dir;
}

const bundle = (id: string): StateBundle => ({
  credentials: { [id]: { clientId: '1', clientSecret: 's' } },
  tokens: { [id]: { accessToken: 'a', refreshToken: 'r', expiresAt: 1 } },
});

test('a remote without a state branch yields a new workspace seeded from the given bundle', () => {
  const ws = StateWorkspace.open(bareRemote());
  try {
    assert.equal(ws.isNew, true);
    assert.deepEqual(ws.load('key', bundle('1')), bundle('1'));
  } finally {
    ws.dispose();
  }
});

test('published state can be opened again and decrypted with the same key only', () => {
  const remote = bareRemote();
  const first = StateWorkspace.open(remote);
  first.load('key', bundle('1'));
  first.publish('key', 'init');
  first.dispose();

  const second = StateWorkspace.open(remote);
  try {
    assert.equal(second.isNew, false);
    assert.deepEqual(second.load('key', bundle('ignored')), bundle('1'));
    assert.throws(() => StateWorkspace.open(remote).load('wrong', bundle('x')), /wrong STATE_KEY/);
  } finally {
    second.dispose();
  }
});

test('a rejected push explains how to recover', () => {
  const remote = bareRemote();
  const a = StateWorkspace.open(remote);
  const b = StateWorkspace.open(remote);
  try {
    a.load('key', bundle('1'));
    b.load('key', bundle('2'));
    a.publish('key', 'a');
    assert.throws(() => b.publish('key', 'b'), /run the command again/);
  } finally {
    a.dispose();
    b.dispose();
  }
});

test('a remote that cannot be read is an error, not an empty state', () => {
  assert.throws(() => StateWorkspace.open(path.join(os.tmpdir(), 'does-not-exist-xyz')), /Could not read the "state" branch/);
});

test('dispose removes the scratch folder', () => {
  const ws = StateWorkspace.open(bareRemote());
  const dir = ws.dataDir;
  ws.dispose();
  assert.equal(fs.existsSync(dir), false);
});

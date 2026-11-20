import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { challengeFile, tempDir } from '../testing/fixtures';
import { loadConfig, validateChallenge } from './config';
import { JsonCredentialStore } from '../strava/credential-store';
import { JsonTokenStore } from '../strava/token-store';
import { readJson, writeJson } from './json-file';

const ENV_KEYS = ['STRAVA_CLIENT_ID', 'STRAVA_CLIENT_SECRET', 'STRAVA_REFRESH_TOKEN', 'STRAVA_ATHLETE_ID', 'PORT', 'SYNC_TTL_MINUTES'];

/** Runs `body` with a clean environment and restores it afterwards, so tests never leak into each other. */
function withCleanEnv<T>(body: () => T): T {
  const saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  ENV_KEYS.forEach((k) => delete process.env[k]);
  try {
    return body();
  } finally {
    for (const [k, v] of Object.entries(saved)) v === undefined ? delete process.env[k] : (process.env[k] = v);
  }
}

function project(files: { challenge?: unknown; env?: string }): string {
  const root = tempDir('config-');
  if (files.challenge !== undefined) {
    fs.mkdirSync(path.join(root, 'config'));
    fs.writeFileSync(path.join(root, 'config', 'challenge.json'), JSON.stringify(files.challenge));
  }
  if (files.env !== undefined) fs.writeFileSync(path.join(root, '.env'), files.env);
  return root;
}

test('a valid challenge file passes validation', () => {
  assert.doesNotThrow(() => validateChallenge(challengeFile()));
});

test('validation rejects each kind of mistake with a pointed message', () => {
  const cases: Array<[string, Partial<ReturnType<typeof challengeFile>>, RegExp]> = [
    ['missing title', { title: '' }, /"title" is required/],
    ['bad first quarter', { firstQuarter: '2026-Q5' }, /Invalid quarter/],
    ['no members', { members: [] }, /"members" must not be empty/],
    ['left before joined', { members: [{ athleteId: 1, name: 'X', joinedQuarter: '2026-Q4', leftQuarter: '2026-Q2' }] }, /before joinedQuarter/],
    ['bad tenure quarter', { members: [{ athleteId: 1, name: 'X', joinedQuarter: 'soon' }] }, /Invalid quarter/],
    ['duplicate challenge id', { challenges: [challengeFile().challenges[0], challengeFile().challenges[0]] }, /Duplicate challenge id/],
    ['bad goal quarter', { challenges: [{ id: 'g', name: 'G', metric: 'movingTime', sportTypes: '*', goalByQuarter: { '26Q1': 1 } }] }, /Invalid quarter/],
  ];
  for (const [label, override, message] of cases) {
    assert.throws(() => validateChallenge(challengeFile(override)), message, label);
  }
});

test('loadConfig fails clearly when the challenge file is missing', () => {
  withCleanEnv(() => assert.throws(() => loadConfig(project({})), /config\/challenge\.json not found/));
});

test('loadConfig applies defaults', () => {
  withCleanEnv(() => {
    const config = loadConfig(project({ challenge: challengeFile() }));
    assert.equal(config.port, 3000);
    assert.equal(config.syncTtlMinutes, 30);
    assert.equal(config.clientId, undefined);
    assert.equal(config.dataDir, path.join(config.root, 'data'));
  });
});

test('loadConfig reads .env, skips comments, and real environment variables win', () => {
  withCleanEnv(() => {
    process.env.PORT = '9999';
    const env = '# a comment\nSTRAVA_CLIENT_ID=123\nPORT=4000\nSYNC_TTL_MINUTES = 5\n';
    const config = loadConfig(project({ challenge: challengeFile(), env }));
    assert.equal(config.clientId, '123');
    assert.equal(config.port, 9999);
    assert.equal(config.syncTtlMinutes, 5);
  });
});

test('JSON files: missing file gives the fallback and writes round-trip without leaving temp files', () => {
  const file = path.join(tempDir('json-'), 'nested', 'x.json');
  assert.deepEqual(readJson(file, { empty: true }), { empty: true });
  writeJson(file, { a: 1 });
  assert.deepEqual(readJson(file, null), { a: 1 });
  assert.equal(fs.existsSync(`${file}.tmp`), false);
});

test('JSON files: a corrupt file is an error rather than silent data loss', () => {
  const file = path.join(tempDir('json-'), 'bad.json');
  fs.writeFileSync(file, '{ not json');
  assert.throws(() => readJson(file, {}));
});

test('credential and token stores persist per athlete and overwrite on set', () => {
  const dir = tempDir('stores-');
  const credentials = new JsonCredentialStore(dir);
  const tokens = new JsonTokenStore(dir);
  assert.equal(credentials.get(1), undefined);
  credentials.set(1, { clientId: '1', clientSecret: 'a' });
  credentials.set(1, { clientId: '1', clientSecret: 'b' });
  tokens.set(1, { accessToken: 'x', refreshToken: 'y', expiresAt: 5 });
  assert.equal(new JsonCredentialStore(dir).get(1)?.clientSecret, 'b');
  assert.equal(new JsonTokenStore(dir).get(1)?.refreshToken, 'y');
  assert.equal(new JsonTokenStore(dir).get(2), undefined);
});

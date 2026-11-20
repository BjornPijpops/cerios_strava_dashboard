import assert from 'node:assert/strict';
import * as path from 'node:path';
import { test } from 'node:test';
import { createApp } from './app';
import { AppConfig } from './infra/config';
import { JsonCredentialStore } from './strava/credential-store';
import { JsonTokenStore } from './strava/token-store';
import { challengeFile, tempDir } from './testing/fixtures';

function configWith(overrides: Partial<AppConfig> = {}): AppConfig {
  const root = tempDir('app-');
  return { root, port: 0, syncTtlMinutes: 30, dataDir: path.join(root, 'data'), challenge: challengeFile(), ...overrides };
}

const SEED = { seedAthleteId: 1, clientId: '10', clientSecret: 's', seedRefreshToken: 'r' };

test('seeds credentials and an expired token for the seed athlete so the first call refreshes', () => {
  const config = configWith(SEED);
  createApp(config);
  assert.deepEqual(new JsonTokenStore(config.dataDir).get(1), { accessToken: '', refreshToken: 'r', expiresAt: 0 });
  assert.deepEqual(new JsonCredentialStore(config.dataDir).get(1), { clientId: '10', clientSecret: 's' });
});

test('existing tokens are never overwritten by the seed', () => {
  const config = configWith(SEED);
  createApp(config);
  new JsonTokenStore(config.dataDir).set(1, { accessToken: 'a', refreshToken: 'rotated', expiresAt: 9 });
  createApp(config);
  assert.equal(new JsonTokenStore(config.dataDir).get(1)?.refreshToken, 'rotated');
});

test('without seed values nothing is stored, and sync reports members without tokens', async () => {
  const config = configWith();
  const results = await createApp(config).sync.syncAll();
  assert.ok(results.every((r) => r.error === 'no tokens configured'));
  assert.equal(new JsonTokenStore(config.dataDir).get(1), undefined);
});

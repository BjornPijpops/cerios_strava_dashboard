import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { decryptStateFile, loadEncrypted, mergeBundles, readBundle, saveEncrypted, StateBundle, updateStateFile, writeBundle } from './state-bundle';
import { decrypt, encrypt, generateKey } from './state-crypto';

const tmp = (): string => fs.mkdtempSync(path.join(os.tmpdir(), 'state-'));
const bundle = (id: string, refresh: string): StateBundle => ({
  credentials: { [id]: { clientId: 'c' + id, clientSecret: 's' + id } },
  tokens: { [id]: { accessToken: 'a', refreshToken: refresh, expiresAt: 5 } },
});

test('encryption round-trips and rejects a wrong key', () => {
  const key = generateKey();
  const payload = encrypt('secret text', key);
  assert.ok(!payload.includes('secret text'));
  assert.equal(decrypt(payload, key), 'secret text');
  assert.throws(() => decrypt(payload, generateKey()), /wrong STATE_KEY/);
});

test('tampered ciphertext is rejected', () => {
  const key = generateKey();
  const e = JSON.parse(encrypt('x', key));
  e.data = Buffer.from('tampered').toString('base64');
  assert.throws(() => decrypt(JSON.stringify(e), key), /wrong STATE_KEY or corrupted/);
});

test('bundle survives write -> read and encrypted save -> load', () => {
  const dir = tmp();
  writeBundle(dir, bundle('1', 'r1'));
  const file = path.join(dir, 'nested', 'state.enc');
  saveEncrypted(file, 'k', readBundle(dir));
  assert.deepEqual(loadEncrypted(file, 'k'), bundle('1', 'r1'));
});

test('decryptStateFile writes the stored bundle into the data folder', () => {
  const dir = tmp();
  const file = path.join(dir, 'state.enc');
  saveEncrypted(file, 'k', bundle('1', 'r1'));
  const dataDir = path.join(dir, 'data');
  decryptStateFile(file, dataDir, 'k');
  assert.deepEqual(readBundle(dataDir), bundle('1', 'r1'));
  assert.throws(() => decryptStateFile(file, dataDir, 'wrong'), /wrong STATE_KEY/);
});

test('updateStateFile keeps members added meanwhile and lets local tokens win', () => {
  const dir = tmp();
  const file = path.join(dir, 'state.enc');
  saveEncrypted(file, 'k', mergeBundles(bundle('1', 'old'), bundle('2', 'added-meanwhile')));
  const dataDir = path.join(dir, 'data');
  writeBundle(dataDir, bundle('1', 'rotated'));
  updateStateFile(file, dataDir, 'k');
  const stored = loadEncrypted(file, 'k');
  assert.equal(stored.tokens['1'].refreshToken, 'rotated');
  assert.equal(stored.tokens['2'].refreshToken, 'added-meanwhile');
});

test('updateStateFile creates the file when none exists and tolerates an empty data folder', () => {
  const dir = tmp();
  const file = path.join(dir, 'new', 'state.enc');
  updateStateFile(file, path.join(dir, 'empty-data'), 'k');
  assert.deepEqual(loadEncrypted(file, 'k'), { credentials: {}, tokens: {} });
});

test('merge keeps members added elsewhere and prefers the overlay tokens', () => {
  const base = { credentials: { ...bundle('1', '').credentials, ...bundle('2', '').credentials }, tokens: { ...bundle('1', 'old').tokens, ...bundle('2', 'x').tokens } };
  const merged = mergeBundles(base, bundle('1', 'new'));
  assert.deepEqual(Object.keys(merged.credentials).sort(), ['1', '2']);
  assert.equal(merged.tokens['1'].refreshToken, 'new');
  assert.equal(merged.tokens['2'].refreshToken, 'x');
});

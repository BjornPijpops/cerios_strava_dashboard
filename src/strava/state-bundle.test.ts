import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { exportState, importState } from './state-bundle';

test('state bundle round-trips credentials and tokens', () => {
  const a = fs.mkdtempSync(path.join(os.tmpdir(), 'state-a-'));
  const b = fs.mkdtempSync(path.join(os.tmpdir(), 'state-b-'));
  fs.writeFileSync(path.join(a, 'credentials.json'), JSON.stringify({ '1': { clientId: 'c', clientSecret: 's' } }));
  fs.writeFileSync(path.join(a, 'tokens.json'), JSON.stringify({ '1': { accessToken: 'a', refreshToken: 'r', expiresAt: 5 } }));

  importState(b, exportState(a));

  assert.equal(exportState(b), exportState(a));
});

test('importing a malformed bundle fails loudly', () => {
  assert.throws(() => importState(os.tmpdir(), '{}'), /credentials/);
});

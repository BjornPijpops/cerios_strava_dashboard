import * as fs from 'node:fs';
import * as path from 'node:path';
import { readJson, writeJson } from '../infra/json-file';
import { StravaCredentials } from './credential-store';
import { decrypt, encrypt } from './state-crypto';
import { TokenSet } from './token-store';

/**
 * Everything secret the app needs: per-athlete Strava app credentials and tokens.
 * It is kept encrypted in a file on the `state` git branch, never as plain text in the repository.
 */
export interface StateBundle {
  credentials: Record<string, StravaCredentials>;
  tokens: Record<string, TokenSet>;
}

const CREDENTIALS_FILE = 'credentials.json';
const TOKENS_FILE = 'tokens.json';

export function readBundle(dataDir: string): StateBundle {
  return {
    credentials: readJson(path.join(dataDir, CREDENTIALS_FILE), {}),
    tokens: readJson(path.join(dataDir, TOKENS_FILE), {}),
  };
}

export function writeBundle(dataDir: string, bundle: StateBundle): void {
  writeJson(path.join(dataDir, CREDENTIALS_FILE), bundle.credentials);
  writeJson(path.join(dataDir, TOKENS_FILE), bundle.tokens);
}

/**
 * `overlay` wins per athlete, everyone else in `base` is kept. This makes saving safe when the file changed
 * in the meantime (e.g. a member was added while a sync was running).
 */
export function mergeBundles(base: StateBundle, overlay: StateBundle): StateBundle {
  return {
    credentials: { ...base.credentials, ...overlay.credentials },
    tokens: { ...base.tokens, ...overlay.tokens },
  };
}

export function loadEncrypted(file: string, key: string): StateBundle {
  const bundle = JSON.parse(decrypt(fs.readFileSync(file, 'utf8'), key)) as Partial<StateBundle>;
  return { credentials: bundle.credentials ?? {}, tokens: bundle.tokens ?? {} };
}

export function saveEncrypted(file: string, key: string, bundle: StateBundle): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, encrypt(JSON.stringify(bundle), key));
}

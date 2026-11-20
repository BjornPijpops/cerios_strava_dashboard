import * as path from 'node:path';
import { readJson, writeJson } from '../infra/json-file';
import { StravaCredentials } from './credential-store';
import { TokenSet } from './token-store';

/**
 * Everything secret the app needs, as one JSON document. In CI it lives in the `STRAVA_STATE`
 * Actions secret: imported before a sync, re-exported afterwards because Strava rotates refresh tokens.
 */
export interface StateBundle {
  credentials: Record<string, StravaCredentials>;
  tokens: Record<string, TokenSet>;
}

const CREDENTIALS_FILE = 'credentials.json';
const TOKENS_FILE = 'tokens.json';

export function exportState(dataDir: string): string {
  const bundle: StateBundle = {
    credentials: readJson(path.join(dataDir, CREDENTIALS_FILE), {}),
    tokens: readJson(path.join(dataDir, TOKENS_FILE), {}),
  };
  return JSON.stringify(bundle);
}

export function importState(dataDir: string, json: string): void {
  const bundle = JSON.parse(json) as Partial<StateBundle>;
  if (!bundle.credentials || !bundle.tokens) throw new Error('STRAVA_STATE must contain "credentials" and "tokens"');
  writeJson(path.join(dataDir, CREDENTIALS_FILE), bundle.credentials);
  writeJson(path.join(dataDir, TOKENS_FILE), bundle.tokens);
}

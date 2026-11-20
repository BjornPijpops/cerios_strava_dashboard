import * as path from 'node:path';
import { readJson, writeJson } from '../infra/json-file';

export interface TokenSet {
  accessToken: string;
  refreshToken: string;
  /** Epoch seconds. */
  expiresAt: number;
}

/** Strava rotates refresh tokens, so the latest one must be persisted per athlete. */
export interface TokenStore {
  get(athleteId: number): TokenSet | undefined;
  set(athleteId: number, tokens: TokenSet): void;
}

export class JsonTokenStore implements TokenStore {
  private readonly file: string;
  private state: Record<string, TokenSet>;

  constructor(dataDir: string) {
    this.file = path.join(dataDir, 'tokens.json');
    this.state = readJson<Record<string, TokenSet>>(this.file, {});
  }

  get(athleteId: number): TokenSet | undefined {
    return this.state[String(athleteId)];
  }

  set(athleteId: number, tokens: TokenSet): void {
    this.state[String(athleteId)] = tokens;
    writeJson(this.file, this.state);
  }
}

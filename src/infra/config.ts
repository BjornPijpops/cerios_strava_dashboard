import * as fs from 'node:fs';
import * as path from 'node:path';
import { parseQuarter } from '../domain/quarters';
import { ChallengeFile } from '../domain/types';
import { readJson } from './json-file';

export interface AppConfig {
  root: string;
  /** Optional: only needed to seed credentials for `seedAthleteId`. */
  clientId?: string;
  clientSecret?: string;
  /** Used only to seed the token store for `seedAthleteId`. */
  seedRefreshToken?: string;
  seedAthleteId?: number;
  port: number;
  syncTtlMinutes: number;
  dataDir: string;
  challenge: ChallengeFile;
}

/** Minimal .env loader (no dependency). Existing environment variables win. */
function loadDotEnv(file: string): void {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && !line.trim().startsWith('#') && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}

export function validateChallenge(c: ChallengeFile): void {
  if (!c.title) throw new Error('config/challenge.json: "title" is required');
  parseQuarter(c.firstQuarter); // throws a descriptive error when invalid
  if (!c.members?.length) throw new Error('config/challenge.json: "members" must not be empty');
  for (const m of c.members) {
    if (m.joinedQuarter) parseQuarter(m.joinedQuarter);
    if (m.leftQuarter) parseQuarter(m.leftQuarter);
    if (m.joinedQuarter && m.leftQuarter && m.leftQuarter < m.joinedQuarter) {
      throw new Error(`Member ${m.name}: leftQuarter ${m.leftQuarter} is before joinedQuarter ${m.joinedQuarter}`);
    }
  }
  const ids = new Set<string>();
  for (const ch of c.challenges ?? []) {
    if (ids.has(ch.id)) throw new Error(`Duplicate challenge id "${ch.id}"`);
    ids.add(ch.id);
    for (const q of Object.keys(ch.goalByQuarter ?? {})) parseQuarter(q);
  }
}

export function loadConfig(root = process.cwd()): AppConfig {
  loadDotEnv(path.join(root, '.env'));
  const challenge = readJson<ChallengeFile | null>(path.join(root, 'config', 'challenge.json'), null);
  if (!challenge) throw new Error('config/challenge.json not found');
  validateChallenge(challenge);

  return {
    root,
    clientId: process.env.STRAVA_CLIENT_ID || undefined,
    clientSecret: process.env.STRAVA_CLIENT_SECRET || undefined,
    seedRefreshToken: process.env.STRAVA_REFRESH_TOKEN || undefined,
    seedAthleteId: process.env.STRAVA_ATHLETE_ID ? Number(process.env.STRAVA_ATHLETE_ID) : undefined,
    port: Number(process.env.PORT ?? 3000),
    syncTtlMinutes: Number(process.env.SYNC_TTL_MINUTES ?? 30),
    dataDir: path.join(root, 'data'),
    challenge,
  };
}

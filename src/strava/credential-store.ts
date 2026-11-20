import * as path from 'node:path';
import { readJson, writeJson } from '../infra/json-file';

/** A Strava API application (each member may use their own, since new apps allow only 1 athlete). */
export interface StravaCredentials {
  clientId: string;
  clientSecret: string;
}

export interface CredentialStore {
  get(athleteId: number): StravaCredentials | undefined;
  set(athleteId: number, credentials: StravaCredentials): void;
}

export class JsonCredentialStore implements CredentialStore {
  private readonly file: string;
  private state: Record<string, StravaCredentials>;

  constructor(dataDir: string) {
    this.file = path.join(dataDir, 'credentials.json');
    this.state = readJson<Record<string, StravaCredentials>>(this.file, {});
  }

  get(athleteId: number): StravaCredentials | undefined {
    return this.state[String(athleteId)];
  }

  set(athleteId: number, credentials: StravaCredentials): void {
    this.state[String(athleteId)] = credentials;
    writeJson(this.file, this.state);
  }
}

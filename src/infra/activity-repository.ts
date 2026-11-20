import * as path from 'node:path';
import { Activity } from '../domain/types';
import { readJson, writeJson } from './json-file';

interface StoreShape {
  /** ISO time of last successful sync per athlete. */
  syncedAt: Record<string, string>;
  /** ISO time from which the athlete's history has been fetched (older stores lack this). */
  syncedFrom?: Record<string, string>;
  activities: Record<string, Activity>;
}

export interface SyncMarker {
  at: string;
  /** Start of the range that has been fetched; null for data synced before this was tracked. */
  from: string | null;
}

/** Persistence port for activities. Swap the implementation (e.g. SQLite) without touching callers. */
export interface ActivityRepository {
  upsertMany(activities: Activity[]): void;
  all(): Activity[];
  getSync(athleteId: number): SyncMarker | null;
  setSync(athleteId: number, marker: SyncMarker): void;
  lastSyncedAt(): string | null;
}

export class JsonActivityRepository implements ActivityRepository {
  private readonly file: string;
  private state: StoreShape;

  constructor(dataDir: string) {
    this.file = path.join(dataDir, 'activities.json');
    this.state = readJson<StoreShape>(this.file, { syncedAt: {}, activities: {} });
  }

  upsertMany(activities: Activity[]): void {
    for (const a of activities) this.state.activities[String(a.id)] = a;
    this.persist();
  }

  all(): Activity[] {
    return Object.values(this.state.activities);
  }

  getSync(athleteId: number): SyncMarker | null {
    const at = this.state.syncedAt[String(athleteId)];
    return at ? { at, from: this.state.syncedFrom?.[String(athleteId)] ?? null } : null;
  }

  setSync(athleteId: number, marker: SyncMarker): void {
    this.state.syncedAt[String(athleteId)] = marker.at;
    if (marker.from) (this.state.syncedFrom ??= {})[String(athleteId)] = marker.from;
    this.persist();
  }

  lastSyncedAt(): string | null {
    const all = Object.values(this.state.syncedAt).sort();
    return all.length ? all[all.length - 1] : null;
  }

  private persist(): void {
    writeJson(this.file, this.state);
  }
}

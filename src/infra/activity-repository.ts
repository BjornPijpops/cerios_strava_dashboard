import * as path from 'node:path';
import { Activity } from '../domain/types';
import { readJson, writeJson } from './json-file';

interface StoreShape {
  /** ISO time of last successful sync per athlete. */
  syncedAt: Record<string, string>;
  /** ISO time from which the athlete's history has been fetched (older stores lack this). */
  syncedFrom?: Record<string, string>;
  /** ISO time of the last full refresh per athlete (older stores lack this). */
  fullSyncedAt?: Record<string, string>;
  activities: Record<string, Activity>;
}

export interface SyncMarker {
  at: string;
  /** Start of the range that has been fetched; null for data synced before this was tracked. */
  from: string | null;
  /** ISO time of the last full refresh, which also corrects edits and deletions. Absent until the first one. */
  fullAt?: string;
}

/** Persistence port for activities. Swap the implementation (e.g. SQLite) without touching callers. */
export interface ActivityRepository {
  upsertMany(activities: Activity[]): void;
  /**
   * Replaces the athlete's stored activities that started strictly between `afterSec` and `beforeSec`
   * (epoch seconds, like the Strava query) with `activities`, so edits and deletions in Strava disappear here too.
   */
  replaceRange(athleteId: number, afterSec: number, beforeSec: number, activities: Activity[]): void;
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

  replaceRange(athleteId: number, afterSec: number, beforeSec: number, activities: Activity[]): void {
    for (const [id, a] of Object.entries(this.state.activities)) {
      const startSec = Date.parse(a.startDate) / 1000;
      if (a.athleteId === athleteId && startSec > afterSec && startSec < beforeSec) delete this.state.activities[id];
    }
    this.upsertMany(activities);
  }

  all(): Activity[] {
    return Object.values(this.state.activities);
  }

  getSync(athleteId: number): SyncMarker | null {
    const at = this.state.syncedAt[String(athleteId)];
    if (!at) return null;
    const fullAt = this.state.fullSyncedAt?.[String(athleteId)];
    return { at, from: this.state.syncedFrom?.[String(athleteId)] ?? null, ...(fullAt ? { fullAt } : {}) };
  }

  setSync(athleteId: number, marker: SyncMarker): void {
    this.state.syncedAt[String(athleteId)] = marker.at;
    if (marker.from) (this.state.syncedFrom ??= {})[String(athleteId)] = marker.from;
    if (marker.fullAt) (this.state.fullSyncedAt ??= {})[String(athleteId)] = marker.fullAt;
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

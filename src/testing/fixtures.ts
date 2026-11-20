import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Activity, ChallengeFile } from '../domain/types';
import { ActivityRepository, SyncMarker } from '../infra/activity-repository';

/** Shared builders for tests. Nothing here touches the network, `data/` or `.env`. */

export const tempDir = (prefix = 'test-'): string => fs.mkdtempSync(path.join(os.tmpdir(), prefix));

export function activity(overrides: Partial<Activity> = {}): Activity {
  return {
    id: 1,
    athleteId: 1,
    name: 'Run',
    sportType: 'Run',
    startDate: '2026-11-10T08:00:00Z',
    movingTimeSec: 3600,
    elapsedTimeSec: 3700,
    distanceM: 10_000,
    ...overrides,
  };
}

export function challengeFile(overrides: Partial<ChallengeFile> = {}): ChallengeFile {
  return {
    title: 'Test Challenge',
    firstQuarter: '2026-Q3',
    members: [
      { athleteId: 1, name: 'Anna' },
      { athleteId: 2, name: 'Bram' },
    ],
    challenges: [
      { id: 'group', name: 'Group goal', metric: 'movingTime', sportTypes: '*', goal: 100 },
      { id: 'running', name: 'Running', metric: 'distance', sportTypes: ['Run'] },
    ],
    ...overrides,
  };
}

export function memoryRepo(initial: Record<number, SyncMarker> = {}): ActivityRepository & { stored: Activity[] } {
  const synced: Record<number, SyncMarker> = { ...initial };
  const stored: Activity[] = [];
  return {
    stored,
    upsertMany: (a) => void stored.push(...a),
    all: () => stored,
    getSync: (id) => synced[id] ?? null,
    setSync: (id, marker) => void (synced[id] = marker),
    lastSyncedAt: () => null,
  };
}

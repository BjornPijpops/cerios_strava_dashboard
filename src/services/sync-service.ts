import { quarterBounds, quarterIdOf, trackingStartMs } from '../domain/quarters';
import { ChallengeFile, Member } from '../domain/types';
import { ActivityRepository } from '../infra/activity-repository';
import { ActivitySource } from '../strava/client';
import { RateLimitError } from '../strava/rate-limit';

const DAY_MS = 24 * 3600 * 1000;
const OVERLAP_MS = DAY_MS;
const FULL_REFRESH_INTERVAL_MS = DAY_MS;
/** Edits made shortly after a quarter ends still belong to that quarter, so it is refreshed for a week. */
const PREVIOUS_QUARTER_GRACE_MS = 7 * DAY_MS;

export interface MemberSyncResult {
  athleteId: number;
  fetched: number;
  error?: string;
}

/**
 * Pulls activities for every member. Most runs are incremental: only what is new since the last
 * successful sync (with a 1-day overlap to catch late uploads), keeping API usage minimal.
 * Once a day per member the current quarter is fetched in full and replaces the stored copy, which also
 * picks up edits and deletions made in Strava (the previous quarter is included in its first week).
 * If the tracked range grew (e.g. an earlier `firstQuarter`), the missing history is backfilled once.
 */
export class SyncService {
  constructor(
    private readonly source: ActivitySource,
    private readonly repo: ActivityRepository,
    private readonly config: Pick<ChallengeFile, 'members' | 'firstQuarter'>,
    private readonly now: () => number,
    private readonly canSync: (athleteId: number) => boolean = () => true,
  ) {}

  async syncAll(): Promise<MemberSyncResult[]> {
    const results: MemberSyncResult[] = [];
    for (const member of this.config.members) {
      if (this.isFinished(member)) continue;
      if (!this.canSync(member.athleteId)) {
        results.push({ athleteId: member.athleteId, fetched: 0, error: 'no tokens configured' });
        continue;
      }
      try {
        results.push({ athleteId: member.athleteId, fetched: await this.syncMember(member) });
      } catch (e) {
        results.push({ athleteId: member.athleteId, fetched: 0, error: (e as Error).message });
      }
    }
    return results;
  }

  /** Member's tracked window in epoch ms: from their first quarter (or the global start) to their last quarter's end. */
  private windowOf(member: Member): { fromMs: number; toMs: number } {
    const globalFrom = trackingStartMs(this.config);
    const fromMs = member.joinedQuarter
      ? Math.max(globalFrom, Date.parse(`${quarterBounds(member.joinedQuarter).start}T00:00:00Z`))
      : globalFrom;
    const toMs = member.leftQuarter ? Date.parse(`${quarterBounds(member.leftQuarter).end}T00:00:00Z`) + DAY_MS : Infinity;
    return { fromMs, toMs };
  }

  /** Someone who left and was synced after their last quarter ended needs no further API calls. */
  private isFinished(member: Member): boolean {
    const last = this.repo.getSync(member.athleteId);
    return !!last && Date.parse(last.at) >= this.windowOf(member).toMs;
  }

  private async syncMember(member: Member): Promise<number> {
    const { fromMs: trackFromMs, toMs: windowEndMs } = this.windowOf(member);
    const athleteId = member.athleteId;
    const startedAt = this.now();
    const last = this.repo.getSync(athleteId);
    const coversRange = !!last?.from && Date.parse(last.from) <= trackFromMs;
    const toMs = Math.min(startedAt, windowEndMs);

    // A "replace" fetch is complete for its range, so it may also drop activities deleted or moved in Strava.
    let fromMs = trackFromMs;
    let replace = true;
    if (last && coversRange) {
      const refreshFromMs = Math.max(trackFromMs, this.refreshStartMs(startedAt));
      const refreshDue = !last.fullAt || startedAt - Date.parse(last.fullAt) >= FULL_REFRESH_INTERVAL_MS;
      if (refreshDue && refreshFromMs < toMs) {
        fromMs = refreshFromMs;
      } else {
        fromMs = Math.max(trackFromMs, Date.parse(last.at) - OVERLAP_MS);
        replace = false;
      }
    }
    if (fromMs >= toMs) return 0;

    const afterSec = Math.floor(fromMs / 1000);
    const beforeSec = Math.ceil(toMs / 1000);
    const activities = await this.source.fetchActivities(athleteId, afterSec, beforeSec);
    if (replace) this.repo.replaceRange(athleteId, afterSec, beforeSec, activities);
    else this.repo.upsertMany(activities);
    this.repo.setSync(athleteId, {
      at: new Date(startedAt).toISOString(),
      from: new Date(trackFromMs).toISOString(),
      ...(replace ? { fullAt: new Date(startedAt).toISOString() } : {}),
    });
    return activities.length;
  }

  /** Start of the range a daily refresh covers: the current quarter, plus the previous one right after a quarter change. */
  private refreshStartMs(nowMs: number): number {
    const current = new Date(Date.parse(`${quarterBounds(quarterIdOf(nowMs)).start}T00:00:00Z`));
    if (nowMs - current.getTime() >= PREVIOUS_QUARTER_GRACE_MS) return current.getTime();
    return Date.UTC(current.getUTCFullYear(), current.getUTCMonth() - 3, 1);
  }
}

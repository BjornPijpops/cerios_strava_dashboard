import { parseQuarter, trackingStartMs } from '../domain/quarters';
import { ChallengeFile, Member } from '../domain/types';
import { ActivityRepository } from '../infra/activity-repository';
import { ActivitySource } from '../strava/client';
import { RateLimitError } from '../strava/rate-limit';

const DAY_MS = 24 * 3600 * 1000;
const OVERLAP_MS = DAY_MS;

export interface MemberSyncResult {
  athleteId: number;
  fetched: number;
  error?: string;
}

/**
 * Incrementally pulls activities for every member. Only fetches what is new since the last
 * successful sync (with a 1-day overlap to catch late uploads/edits), keeping API usage minimal.
 * If the tracked range grew (e.g. an earlier `firstQuarter`), the missing history is backfilled once.
 */
export class SyncService {
  constructor(
    private readonly source: ActivitySource,
    private readonly repo: ActivityRepository,
    private readonly config: Pick<ChallengeFile, 'members' | 'firstQuarter'>,
    private readonly now: () => number = Date.now,
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
        if (e instanceof RateLimitError) break; // no point trying other members
      }
    }
    return results;
  }

  /** Member's tracked window in epoch ms: from their first quarter (or the global start) to their last quarter's end. */
  private windowOf(member: Member): { fromMs: number; toMs: number } {
    const globalFrom = trackingStartMs(this.config);
    const fromMs = member.joinedQuarter
      ? Math.max(globalFrom, Date.parse(`${parseQuarter(member.joinedQuarter).start}T00:00:00Z`))
      : globalFrom;
    const toMs = member.leftQuarter ? Date.parse(`${parseQuarter(member.leftQuarter).end}T00:00:00Z`) + DAY_MS : Infinity;
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
    const fromMs = last && coversRange ? Math.max(trackFromMs, Date.parse(last.at) - OVERLAP_MS) : trackFromMs;
    const toMs = Math.min(startedAt, windowEndMs);
    if (fromMs >= toMs) return 0;

    const activities = await this.source.fetchActivities(athleteId, Math.floor(fromMs / 1000), Math.ceil(toMs / 1000));
    this.repo.upsertMany(activities);
    this.repo.setSync(athleteId, { at: new Date(startedAt).toISOString(), from: new Date(trackFromMs).toISOString() });
    return activities.length;
  }
}

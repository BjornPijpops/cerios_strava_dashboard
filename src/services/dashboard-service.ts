import { aggregate } from '../domain/aggregate';
import { buildDetail, ChallengeDetail } from '../domain/detail';
import { listQuarters, resolveConfig } from '../domain/quarters';
import { ChallengeFile, DashboardData, QuarterInfo } from '../domain/types';
import { ActivityRepository } from '../infra/activity-repository';

export type ChallengeDetailView = ChallengeDetail & {
  title: string;
  quarter: QuarterInfo;
  quarters: QuarterInfo[];
  lastSyncedAt: string | null;
};

export class DashboardService {
  constructor(
    private readonly repo: ActivityRepository,
    private readonly file: ChallengeFile,
    private readonly now: () => number = Date.now,
  ) {}

  quarters(): QuarterInfo[] {
    return listQuarters(this.file.firstQuarter, this.now());
  }

  /** Builds the overview for a quarter (default: current). Undefined for an unknown quarter. */
  build(quarterId?: string): DashboardData | undefined {
    const quarters = this.quarters();
    const quarter = quarterId ? quarters.find((q) => q.id === quarterId) : quarters[0];
    if (!quarter) return undefined;
    const config = resolveConfig(this.file, quarter);
    return {
      title: this.file.title,
      quarter,
      quarters,
      period: config.period,
      generatedAt: new Date(this.now()).toISOString(),
      lastSyncedAt: this.repo.lastSyncedAt(),
      challenges: aggregate(this.repo.all(), config),
    };
  }

  /** Undefined for an unknown challenge or quarter. */
  detail(challengeId: string, quarterId?: string): ChallengeDetailView | undefined {
    const quarters = this.quarters();
    const quarter = quarterId ? quarters.find((q) => q.id === quarterId) : quarters[0];
    if (!quarter) return undefined;
    const config = resolveConfig(this.file, quarter);
    const challenge = config.challenges.find((c) => c.id === challengeId);
    if (!challenge) return undefined;
    return {
      ...buildDetail(this.repo.all(), config, challenge, this.now()),
      title: this.file.title,
      quarter,
      quarters,
      lastSyncedAt: this.repo.lastSyncedAt(),
    };
  }
}

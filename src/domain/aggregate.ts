import { Activity, ChallengeConfig, ChallengeDefinition, ChallengeResult, Metric } from './types';

const DAY_MS = 24 * 3600 * 1000;

const round = (value: number, digits = 2): number => {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
};

const UNIT: Record<Metric, ChallengeResult['unit']> = {
  movingTime: 'h',
  elapsedTime: 'h',
  distance: 'km',
};

/** Value of an activity for a metric, expressed in the display unit. */
export function metricValue(activity: Activity, metric: Metric): number {
  switch (metric) {
    case 'movingTime':
      return activity.movingTimeSec / 3600;
    case 'elapsedTime':
      return activity.elapsedTimeSec / 3600;
    case 'distance':
      return activity.distanceM / 1000;
  }
}

/** Period bounds as epoch ms; end is exclusive (the day after `period.end`). */
export function periodBounds(period: ChallengeConfig['period']): { startMs: number; endMs: number } {
  return {
    startMs: Date.parse(`${period.start}T00:00:00Z`),
    endMs: Date.parse(`${period.end}T00:00:00Z`) + DAY_MS,
  };
}

export function isInPeriod(activity: Activity, period: ChallengeConfig['period']): boolean {
  const { startMs, endMs } = periodBounds(period);
  const t = Date.parse(activity.startDate);
  return t >= startMs && t < endMs;
}

export function counts(activity: Activity, challenge: ChallengeDefinition): boolean {
  return challenge.sportTypes === '*' || challenge.sportTypes.includes(activity.sportType);
}

/** Pure function: activities + config -> one result per challenge. */
export function aggregate(activities: Activity[], config: ChallengeConfig): ChallengeResult[] {
  const memberIds = new Set(config.members.map((m) => m.athleteId));
  const inPeriod = activities.filter((a) => memberIds.has(a.athleteId) && isInPeriod(a, config.period));

  return config.challenges.map((challenge) => {
    const matching = inPeriod.filter((a) => counts(a, challenge));
    const perMember = new Map(config.members.map((m) => [m.athleteId, 0]));
    let total = 0;

    for (const activity of matching) {
      const value = metricValue(activity, challenge.metric);
      total += value;
      const current = perMember.get(activity.athleteId);
      if (current !== undefined) perMember.set(activity.athleteId, current + value);
    }

    const leaderboard = config.members
      .map((m) => ({ athleteId: m.athleteId, name: m.name, total: round(perMember.get(m.athleteId) ?? 0) }))
      .sort((a, b) => b.total - a.total);

    return {
      id: challenge.id,
      name: challenge.name,
      metric: challenge.metric,
      unit: UNIT[challenge.metric],
      goal: challenge.goal,
      total: round(total),
      progress: challenge.goal ? total / challenge.goal : undefined,
      activityCount: matching.length,
      leaderboard,
    };
  });
}

import { ActivityView, toActivityView } from './activity-view';
import { aggregate, counts, isInPeriod, metricValue, periodBounds } from './aggregate';
import { weekdayTotals, weeklySeries, WeekPoint } from './time-series';
import { Activity, ChallengeConfig, ChallengeDefinition, ChallengeResult } from './types';
import { DAY_MS, round } from './units';

export interface SportBreakdown {
  sportType: string;
  total: number;
  count: number;
}

export interface MemberDetail {
  athleteId: number;
  name: string;
  total: number;
  count: number;
  activeDays: number;
  /** Largest single activity, in the challenge's unit. */
  best: number;
}

export interface ChallengeDetail {
  summary: ChallengeResult;
  period: ChallengeConfig['period'];
  weekly: WeekPoint[];
  /** Totals per weekday, Monday first. */
  weekdays: number[];
  bySport: SportBreakdown[];
  members: MemberDetail[];
  recent: ActivityView[];
  biggest: ActivityView | null;
  activeDays: number;
  avgPerActivity: number;
  /** Total expected at period end if the current pace continues (only when a goal exists). */
  projectedTotal?: number;
}

const dayKey = (iso: string): string => iso.slice(0, 10);

function sportBreakdown(activities: Activity[], value: (a: Activity) => number): SportBreakdown[] {
  const bySport = new Map<string, SportBreakdown>();
  for (const a of activities) {
    const entry = bySport.get(a.sportType) ?? { sportType: a.sportType, total: 0, count: 0 };
    entry.total += value(a);
    entry.count++;
    bySport.set(a.sportType, entry);
  }
  return [...bySport.values()].map((s) => ({ ...s, total: round(s.total) })).sort((a, b) => b.total - a.total);
}

/** One row per configured member (also those without activities), best first. */
function memberDetails(activities: Activity[], config: ChallengeConfig, value: (a: Activity) => number): MemberDetail[] {
  return config.members
    .map((member) => {
      const own = activities.filter((a) => a.athleteId === member.athleteId);
      return {
        athleteId: member.athleteId,
        name: member.name,
        total: round(own.reduce((sum, a) => sum + value(a), 0)),
        count: own.length,
        activeDays: new Set(own.map((a) => dayKey(a.startDate))).size,
        best: round(Math.max(0, ...own.map(value))),
      };
    })
    .sort((a, b) => b.total - a.total);
}

/** Pure function: everything shown on a challenge's detail page. */
export function buildDetail(
  activities: Activity[],
  config: ChallengeConfig,
  challenge: ChallengeDefinition,
  nowMs: number,
): ChallengeDetail {
  const summary = aggregate(activities, config).find((r) => r.id === challenge.id);
  if (!summary) throw new Error(`Challenge "${challenge.id}" is not part of the given config`);

  const memberIds = new Set(config.members.map((m) => m.athleteId));
  const matching = activities
    .filter((a) => memberIds.has(a.athleteId) && isInPeriod(a, config.period) && counts(a, challenge))
    .sort((a, b) => b.startDate.localeCompare(a.startDate));
  const names = new Map(config.members.map((m) => [m.athleteId, m.name]));
  const value = (a: Activity): number => metricValue(a, challenge.metric);
  const view = (a: Activity): ActivityView => toActivityView(a, names.get(a.athleteId) ?? `Athlete ${a.athleteId}`, value(a));

  const range = periodBounds(config.period);
  const biggest = matching.reduce<Activity | null>((best, a) => (!best || value(a) > value(best) ? a : best), null);

  let projectedTotal: number | undefined;
  if (challenge.goal) {
    const elapsed = Math.min(Math.max(nowMs - range.startMs, DAY_MS), range.endMs - range.startMs);
    projectedTotal = round((summary.total / elapsed) * (range.endMs - range.startMs), 1);
  }

  return {
    summary,
    period: config.period,
    weekly: weeklySeries(matching, value, range, nowMs),
    weekdays: weekdayTotals(matching, value),
    bySport: sportBreakdown(matching, value),
    members: memberDetails(matching, config, value),
    recent: matching.slice(0, 10).map(view),
    biggest: biggest ? view(biggest) : null,
    activeDays: new Set(matching.map((a) => dayKey(a.startDate))).size,
    avgPerActivity: matching.length ? round(summary.total / matching.length) : 0,
    projectedTotal,
  };
}

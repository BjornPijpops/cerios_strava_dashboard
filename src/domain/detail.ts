import { Activity, ChallengeConfig, ChallengeDefinition, ChallengeResult } from './types';
import { aggregate, counts, isInPeriod, metricValue, periodBounds } from './aggregate';

const DAY_MS = 24 * 3600 * 1000;
const round = (v: number, d = 2): number => Math.round(v * 10 ** d) / 10 ** d;

export interface WeekPoint {
  /** Monday of the week, YYYY-MM-DD (UTC). */
  weekStart: string;
  total: number;
  cumulative: number;
}

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

export interface ActivityView {
  name: string;
  member: string;
  sportType: string;
  date: string;
  value: number;
  hours: number;
  km: number;
  /** False for sports where distance is meaningless (badminton, weights...). */
  hasDistance: boolean;
  /** min/km for on-foot sports, km/h for cycling; undefined without distance. */
  pace?: { value: number; unit: 'min/km' | 'km/h' };
  elevationGainM?: number;
  averageHeartrate?: number;
}

const DISTANCE_SPORTS = new Set([
  'Run', 'TrailRun', 'VirtualRun', 'Walk', 'Hike',
  'Ride', 'MountainBikeRide', 'GravelRide', 'EBikeRide', 'EMountainBikeRide', 'VirtualRide', 'Velomobile', 'Handcycle',
  'Swim', 'Rowing', 'Canoeing', 'Kayaking', 'NordicSki', 'AlpineSki', 'Snowshoe', 'InlineSkate', 'IceSkate', 'Skateboard', 'StandUpPaddling', 'Surfing', 'Sail', 'Wheelchair',
]);
const ON_FOOT = new Set(['Run', 'TrailRun', 'VirtualRun', 'Walk', 'Hike', 'Snowshoe']);

function paceOf(a: Activity): ActivityView['pace'] {
  if (!DISTANCE_SPORTS.has(a.sportType) || a.distanceM <= 0 || a.movingTimeSec <= 0) return undefined;
  const km = a.distanceM / 1000;
  return ON_FOOT.has(a.sportType)
    ? { value: round(a.movingTimeSec / 60 / km), unit: 'min/km' }
    : { value: round(km / (a.movingTimeSec / 3600), 1), unit: 'km/h' };
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

function mondayOf(ms: number): number {
  const d = new Date(ms);
  const sinceMonday = (d.getUTCDay() + 6) % 7;
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - sinceMonday * DAY_MS;
}

/** Pure function: everything shown on a challenge's detail page. */
export function buildDetail(
  activities: Activity[],
  config: ChallengeConfig,
  challenge: ChallengeDefinition,
  nowMs: number,
): ChallengeDetail {
  const summary = aggregate(activities, config).find((r) => r.id === challenge.id)!;
  const memberIds = new Set(config.members.map((m) => m.athleteId));
  const matching = activities
    .filter((a) => memberIds.has(a.athleteId) && isInPeriod(a, config.period) && counts(a, challenge))
    .sort((a, b) => b.startDate.localeCompare(a.startDate));
  const names = new Map(config.members.map((m) => [m.athleteId, m.name]));
  const nameOf = (id: number): string => names.get(id) ?? `Athlete ${id}`;
  const value = (a: Activity): number => metricValue(a, challenge.metric);

  const view = (a: Activity): ActivityView => ({
    name: a.name,
    member: nameOf(a.athleteId),
    sportType: a.sportType,
    date: a.startDate,
    value: round(value(a)),
    hours: round(a.movingTimeSec / 3600),
    km: round(a.distanceM / 1000),
    hasDistance: DISTANCE_SPORTS.has(a.sportType) && a.distanceM > 0,
    pace: paceOf(a),
    elevationGainM: a.elevationGainM ? Math.round(a.elevationGainM) : undefined,
    averageHeartrate: a.averageHeartrate ? Math.round(a.averageHeartrate) : undefined,
  });

  // Weekly series from the period start up to the current week (or period end).
  const { startMs, endMs } = periodBounds(config.period);
  const byWeek = new Map<number, number>();
  for (const a of matching) {
    const w = mondayOf(Date.parse(a.startDate));
    byWeek.set(w, (byWeek.get(w) ?? 0) + value(a));
  }
  const weekly: WeekPoint[] = [];
  let cumulative = 0;
  for (let w = mondayOf(startMs); w < Math.min(nowMs, endMs); w += 7 * DAY_MS) {
    const total = byWeek.get(w) ?? 0;
    cumulative += total;
    weekly.push({ weekStart: new Date(w).toISOString().slice(0, 10), total: round(total), cumulative: round(cumulative) });
  }

  const weekdays = Array<number>(7).fill(0);
  const sports = new Map<string, SportBreakdown>();
  const perMember = new Map<number, { total: number; count: number; days: Set<string>; best: number }>();
  const allDays = new Set<string>();
  for (const a of matching) {
    const v = value(a);
    weekdays[(new Date(a.startDate).getUTCDay() + 6) % 7] += v;
    const s = sports.get(a.sportType) ?? { sportType: a.sportType, total: 0, count: 0 };
    s.total += v;
    s.count++;
    sports.set(a.sportType, s);
    const m = perMember.get(a.athleteId) ?? { total: 0, count: 0, days: new Set<string>(), best: 0 };
    m.total += v;
    m.count++;
    m.days.add(dayKey(a.startDate));
    m.best = Math.max(m.best, v);
    perMember.set(a.athleteId, m);
    allDays.add(dayKey(a.startDate));
  }

  const members: MemberDetail[] = config.members
    .map((m) => {
      const s = perMember.get(m.athleteId);
      return {
        athleteId: m.athleteId,
        name: m.name,
        total: round(s?.total ?? 0),
        count: s?.count ?? 0,
        activeDays: s?.days.size ?? 0,
        best: round(s?.best ?? 0),
      };
    })
    .sort((a, b) => b.total - a.total);

  const biggest = matching.reduce<Activity | null>((best, a) => (!best || value(a) > value(best) ? a : best), null);

  let projectedTotal: number | undefined;
  if (challenge.goal) {
    const elapsed = Math.min(Math.max(nowMs - startMs, DAY_MS), endMs - startMs);
    projectedTotal = round((summary.total / elapsed) * (endMs - startMs), 1);
  }

  return {
    summary,
    period: config.period,
    weekly,
    weekdays: weekdays.map((v) => round(v)),
    bySport: [...sports.values()].map((s) => ({ ...s, total: round(s.total) })).sort((a, b) => b.total - a.total),
    members,
    recent: matching.slice(0, 10).map(view),
    biggest: biggest ? view(biggest) : null,
    activeDays: allDays.size,
    avgPerActivity: matching.length ? round(summary.total / matching.length) : 0,
    projectedTotal,
  };
}

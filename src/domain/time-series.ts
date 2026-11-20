import { Activity } from './types';
import { DAY_MS, round } from './units';

export interface WeekPoint {
  /** Monday of the week, YYYY-MM-DD (UTC). */
  weekStart: string;
  total: number;
  cumulative: number;
}

/** Monday 00:00 UTC of the week containing `ms`. */
function mondayOf(ms: number): number {
  const d = new Date(ms);
  const daysSinceMonday = (d.getUTCDay() + 6) % 7;
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - daysSinceMonday * DAY_MS;
}

/**
 * Weekly totals and a running total, from the week the period starts in up to the current week
 * (or the period end, whichever comes first).
 */
export function weeklySeries(
  activities: Activity[],
  value: (a: Activity) => number,
  range: { startMs: number; endMs: number },
  nowMs: number,
): WeekPoint[] {
  const totalByWeek = new Map<number, number>();
  for (const a of activities) {
    const week = mondayOf(Date.parse(a.startDate));
    totalByWeek.set(week, (totalByWeek.get(week) ?? 0) + value(a));
  }
  const series: WeekPoint[] = [];
  let cumulative = 0;
  for (let week = mondayOf(range.startMs); week < Math.min(nowMs, range.endMs); week += 7 * DAY_MS) {
    const total = totalByWeek.get(week) ?? 0;
    cumulative += total;
    series.push({ weekStart: new Date(week).toISOString().slice(0, 10), total: round(total), cumulative: round(cumulative) });
  }
  return series;
}

/** Totals per weekday, Monday first. */
export function weekdayTotals(activities: Activity[], value: (a: Activity) => number): number[] {
  const totals = Array<number>(7).fill(0);
  for (const a of activities) totals[(new Date(a.startDate).getUTCDay() + 6) % 7] += value(a);
  return totals.map((total) => round(total));
}

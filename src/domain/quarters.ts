import { ChallengeConfig, ChallengeFile, Member, QuarterInfo } from './types';

const QUARTER_RE = /^(\d{4})-Q([1-4])$/;

export function isQuarterId(id: string): boolean {
  return QUARTER_RE.test(id);
}

/** A quarter without the "is it the current one" flag, which is the only part that depends on the clock. */
export type QuarterBounds = Omit<QuarterInfo, 'current'>;

/** Calendar quarter (UTC) with inclusive start/end dates. Throws a descriptive error for an invalid id. */
export function quarterBounds(id: string): QuarterBounds {
  const m = QUARTER_RE.exec(id);
  if (!m) throw new Error(`Invalid quarter "${id}", expected e.g. "2026-Q4"`);
  const year = Number(m[1]);
  const month = (Number(m[2]) - 1) * 3;
  const startMs = Date.UTC(year, month, 1);
  const lastDayMs = Date.UTC(year, month + 3, 0);
  return {
    id,
    label: `${year} Q${m[2]}`,
    start: new Date(startMs).toISOString().slice(0, 10),
    end: new Date(lastDayMs).toISOString().slice(0, 10),
  };
}

/** Like `quarterBounds`, and flags whether `nowMs` falls inside the quarter. */
export function parseQuarter(id: string, nowMs: number): QuarterInfo {
  return { ...quarterBounds(id), current: quarterIdOf(nowMs) === id };
}

export function quarterIdOf(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-Q${Math.floor(d.getUTCMonth() / 3) + 1}`;
}

/** Quarters from `firstQuarter` up to and including the current one, newest first. */
export function listQuarters(firstQuarter: string, nowMs: number): QuarterInfo[] {
  const first = parseQuarter(firstQuarter, nowMs);
  const result: QuarterInfo[] = [];
  let [year, q] = [Number(first.id.slice(0, 4)), Number(first.id.slice(6))];
  const currentId = quarterIdOf(nowMs);
  for (;;) {
    const id = `${year}-Q${q}`;
    if (id > currentId) break; // lexicographic order equals chronological order
    result.unshift(parseQuarter(id, nowMs));
    if (++q > 4) [year, q] = [year + 1, 1];
  }
  return result;
}

/** Start of the whole tracked range (first day of `firstQuarter`), epoch ms. */
export function trackingStartMs(file: Pick<ChallengeFile, 'firstQuarter'>): number {
  return Date.parse(`${quarterBounds(file.firstQuarter).start}T00:00:00Z`);
}

/** Whether a member takes part in the given quarter (quarter ids compare chronologically as strings). */
export function isMemberActive(member: Member, quarterId: string): boolean {
  return (!member.joinedQuarter || member.joinedQuarter <= quarterId) && (!member.leftQuarter || quarterId <= member.leftQuarter);
}

/** Resolves the file config to a single quarter: applies per-quarter goals and only that quarter's members. */
export function resolveConfig(file: ChallengeFile, quarter: QuarterInfo): ChallengeConfig {
  return {
    period: { start: quarter.start, end: quarter.end },
    members: file.members.filter((m) => isMemberActive(m, quarter.id)),
    challenges: file.challenges.map(({ goalByQuarter, ...challenge }) => ({
      ...challenge,
      goal: goalByQuarter?.[quarter.id] ?? challenge.goal,
    })),
  };
}

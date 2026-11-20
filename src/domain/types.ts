/** Normalised activity, independent of the Strava wire format. */
export interface Activity {
  id: number;
  athleteId: number;
  name: string;
  sportType: string;
  /** ISO-8601 UTC start time. */
  startDate: string;
  movingTimeSec: number;
  elapsedTimeSec: number;
  distanceM: number;
  elevationGainM?: number;
  /** Only present when the activity was recorded with a heart-rate sensor. */
  averageHeartrate?: number;
}

export interface Member {
  athleteId: number;
  name: string;
  /** First quarter this member takes part in, e.g. "2026-Q4". Omitted = from the beginning. */
  joinedQuarter?: string;
  /** Last quarter this member takes part in (inclusive). Omitted = still active. */
  leftQuarter?: string;
}

export type Metric = 'movingTime' | 'elapsedTime' | 'distance';

export interface ChallengeDefinition {
  id: string;
  name: string;
  metric: Metric;
  /** Strava sport types counted by this challenge, or "*" for all. */
  sportTypes: string[] | '*';
  /** Target in the metric's display unit (hours or km). */
  goal?: number;
  /** Overrides `goal` for specific quarters, keyed like "2026-Q3". */
  goalByQuarter?: Record<string, number>;
}

/** A period resolved for aggregation (one quarter). */
export interface ChallengeConfig {
  /** Inclusive dates, YYYY-MM-DD (UTC). */
  period: { start: string; end: string };
  members: Member[];
  challenges: ChallengeDefinition[];
}

/** Shape of config/challenge.json. Quarters are derived from the calendar. */
export interface ChallengeFile {
  title: string;
  /** First quarter to track, e.g. "2026-Q3". Everything from then until now is synced and browsable. */
  firstQuarter: string;
  members: Member[];
  challenges: ChallengeDefinition[];
}

export interface QuarterInfo {
  /** e.g. "2026-Q4" */
  id: string;
  /** e.g. "2026 Q4" */
  label: string;
  start: string;
  end: string;
  current: boolean;
}

export interface LeaderboardEntry {
  athleteId: number;
  name: string;
  total: number;
}

export interface ChallengeResult {
  id: string;
  name: string;
  metric: Metric;
  unit: 'h' | 'km';
  goal?: number;
  total: number;
  /** Ratio of total to goal; may exceed 1. Undefined when there is no goal. */
  progress?: number;
  activityCount: number;
  leaderboard: LeaderboardEntry[];
}

export interface DashboardData {
  title: string;
  quarter: QuarterInfo;
  /** All browsable quarters, newest first. */
  quarters: QuarterInfo[];
  period: ChallengeConfig['period'];
  generatedAt: string;
  lastSyncedAt: string | null;
  challenges: ChallengeResult[];
}

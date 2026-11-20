import { Activity } from '../domain/types';
import { CredentialStore, StravaCredentials } from './credential-store';
import { RateLimitError, RateLimitGuard, RateLimitRegistry } from './rate-limit';
import { TokenSet, TokenStore } from './token-store';

const API = 'https://www.strava.com/api/v3';
const OAUTH = 'https://www.strava.com/oauth/token';
/** Refresh slightly early to avoid using a token that expires mid-request. */
const EXPIRY_MARGIN_SEC = 120;
export const PAGE_SIZE = 200;

/** Subset of Strava's SummaryActivity that we use. */
interface StravaSummaryActivity {
  id: number;
  name: string;
  sport_type?: string;
  type: string;
  start_date: string;
  moving_time: number;
  elapsed_time: number;
  distance: number;
  total_elevation_gain?: number;
  average_heartrate?: number;
}

/** Port the sync service depends on; lets tests use a fake. */
export interface ActivitySource {
  fetchActivities(athleteId: number, afterEpochSec: number, beforeEpochSec: number): Promise<Activity[]>;
}

export class StravaClient implements ActivitySource {
  constructor(
    private readonly credentials: CredentialStore,
    private readonly tokens: TokenStore,
    private readonly rateLimits: RateLimitRegistry,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  /** Lists all activities in (after, before) for the athlete who owns the stored token. */
  async fetchActivities(athleteId: number, afterEpochSec: number, beforeEpochSec: number): Promise<Activity[]> {
    const result: Activity[] = [];
    for (let page = 1; ; page++) {
      const query = new URLSearchParams({
        after: String(afterEpochSec),
        before: String(beforeEpochSec),
        page: String(page),
        per_page: String(PAGE_SIZE),
      });
      const batch = await this.get<StravaSummaryActivity[]>(athleteId, `/athlete/activities?${query}`);
      result.push(...batch.map((a) => toActivity(a, athleteId)));
      if (batch.length < PAGE_SIZE) return result;
    }
  }

  /**
   * One-time exchange of an OAuth authorization code for tokens. The athlete is only known after the
   * exchange, so credentials are stored under the returned athlete id.
   */
  async exchangeCode(credentials: StravaCredentials, code: string): Promise<{ athleteId: number; tokens: TokenSet }> {
    const res = await this.fetchFn(OAUTH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: credentials.clientId,
        client_secret: credentials.clientSecret,
        grant_type: 'authorization_code',
        code,
      }),
    });
    if (!res.ok) throw new Error(`Code exchange failed ${res.status}: ${await res.text()}`);
    const body = (await res.json()) as {
      access_token: string;
      refresh_token: string;
      expires_at: number;
      athlete: { id: number };
    };
    const tokens = { accessToken: body.access_token, refreshToken: body.refresh_token, expiresAt: body.expires_at };
    this.credentials.set(body.athlete.id, credentials);
    this.tokens.set(body.athlete.id, tokens);
    return { athleteId: body.athlete.id, tokens };
  }

  private async get<T>(athleteId: number, pathAndQuery: string): Promise<T> {
    const guard = this.guardFor(athleteId);
    const token = await this.accessToken(athleteId, guard);
    guard.assertCanRequest();
    const res = await this.fetchFn(`${API}${pathAndQuery}`, { headers: { Authorization: `Bearer ${token}` } });
    guard.record(res.headers);
    if (res.status === 429) throw new RateLimitError('Strava returned 429 Too Many Requests');
    if (!res.ok) throw new Error(`Strava API ${res.status}: ${await res.text()}`);
    return (await res.json()) as T;
  }

  private guardFor(athleteId: number): RateLimitGuard {
    const credentials = this.credentials.get(athleteId);
    if (!credentials) throw new Error(`No Strava app credentials stored for athlete ${athleteId}`);
    return this.rateLimits.forApp(credentials.clientId);
  }

  private async accessToken(athleteId: number, guard: RateLimitGuard): Promise<string> {
    const current = this.tokens.get(athleteId);
    if (!current) throw new Error(`No Strava tokens stored for athlete ${athleteId}`);
    if (current.expiresAt - EXPIRY_MARGIN_SEC > Date.now() / 1000) return current.accessToken;
    const credentials = this.credentials.get(athleteId);
    if (!credentials) throw new Error(`No Strava app credentials stored for athlete ${athleteId}`);

    guard.assertCanRequest();
    const res = await this.fetchFn(OAUTH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: credentials.clientId,
        client_secret: credentials.clientSecret,
        grant_type: 'refresh_token',
        refresh_token: current.refreshToken,
      }),
    });
    if (!res.ok) throw new Error(`Strava token refresh failed ${res.status}: ${await res.text()}`);
    const body = (await res.json()) as { access_token: string; refresh_token: string; expires_at: number };
    const next: TokenSet = {
      accessToken: body.access_token,
      refreshToken: body.refresh_token,
      expiresAt: body.expires_at,
    };
    this.tokens.set(athleteId, next);
    return next.accessToken;
  }
}

export function toActivity(a: StravaSummaryActivity, athleteId: number): Activity {
  return {
    id: a.id,
    athleteId,
    name: a.name,
    sportType: a.sport_type ?? a.type,
    startDate: a.start_date,
    movingTimeSec: a.moving_time,
    elapsedTimeSec: a.elapsed_time,
    distanceM: a.distance,
    elevationGainM: a.total_elevation_gain,
    averageHeartrate: a.average_heartrate,
  };
}

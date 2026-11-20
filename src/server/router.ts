import { DashboardService } from '../services/dashboard-service';

export interface HttpResponse {
  status: number;
  contentType: string;
  body: string | Buffer;
}

export interface RouterDeps {
  dashboard: Pick<DashboardService, 'quarters' | 'build' | 'detail'>;
  /** Fetches new activities; resolves with one result per member. */
  syncAll(): Promise<Array<{ athleteId: number; error?: string }>>;
  syncTtlMs: number;
  readIndexHtml(): string | Buffer;
  now(): number;
  warn(message: string): void;
}

const CHALLENGE_PREFIX = '/api/challenge/';

const json = (status: number, body: unknown): HttpResponse => ({
  status,
  contentType: 'application/json',
  body: JSON.stringify(body),
});

/**
 * Maps a request URL to a response. Kept free of `node:http` so it can be tested without a socket.
 * Page views read the local store; a sync happens at most once per TTL and never concurrently, so
 * refreshing the page cannot burn the API budget.
 */
export function createRouter(deps: RouterDeps): (rawUrl: string) => Promise<HttpResponse> {
  let lastAttempt = 0;
  let syncing: Promise<unknown> | null = null;

  async function syncIfStale(): Promise<void> {
    if (syncing || deps.now() - lastAttempt < deps.syncTtlMs) return;
    lastAttempt = deps.now();
    syncing = deps
      .syncAll()
      .then((results) => results.filter((r) => r.error).forEach((r) => deps.warn(`sync ${r.athleteId}: ${r.error}`)))
      .finally(() => (syncing = null));
    await syncing;
  }

  async function route(rawUrl: string): Promise<HttpResponse> {
    const url = new URL(rawUrl, 'http://localhost');
    const quarter = url.searchParams.get('quarter') ?? undefined;

    if (url.pathname === '/api/dashboard') {
      // Past quarters never change, so only the current one is worth a sync.
      if (!quarter || quarter === deps.dashboard.quarters()[0].id) await syncIfStale();
      const data = deps.dashboard.build(quarter);
      return data ? json(200, data) : json(404, { error: 'Unknown quarter' });
    }
    if (url.pathname.startsWith(CHALLENGE_PREFIX)) {
      const challengeId = decodeURIComponent(url.pathname.slice(CHALLENGE_PREFIX.length));
      const detail = deps.dashboard.detail(challengeId, quarter);
      return detail ? json(200, detail) : json(404, { error: 'Unknown challenge or quarter' });
    }
    if (url.pathname === '/' || url.pathname === '/index.html') {
      return { status: 200, contentType: 'text/html; charset=utf-8', body: deps.readIndexHtml() };
    }
    return { status: 404, contentType: 'text/plain', body: 'Not found' };
  }

  return async (rawUrl) => {
    try {
      return await route(rawUrl);
    } catch (error) {
      return json(500, { error: (error as Error).message });
    }
  };
}

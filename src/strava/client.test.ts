import assert from 'node:assert/strict';
import { test } from 'node:test';
import { tempDir } from '../testing/fixtures';
import { JsonCredentialStore } from './credential-store';
import { PAGE_SIZE, StravaClient, toActivity } from './client';
import { RateLimitError, RateLimitRegistry } from './rate-limit';
import { JsonTokenStore } from './token-store';

const NOW_MS = Date.parse('2026-11-20T10:00:00Z');
const NOW_SEC = NOW_MS / 1000;

interface Call {
  url: string;
  init?: RequestInit;
}

/** Builds a client over temp stores with a scripted fetch; every call is recorded. */
function setup(responses: Array<Response | (() => Response)>, tokens?: { expiresAt: number }) {
  const dir = tempDir('client-');
  const credentials = new JsonCredentialStore(dir);
  const tokenStore = new JsonTokenStore(dir);
  credentials.set(1, { clientId: '10', clientSecret: 'secret' });
  if (tokens) tokenStore.set(1, { accessToken: 'old-access', refreshToken: 'old-refresh', expiresAt: tokens.expiresAt });

  const calls: Call[] = [];
  const queue = [...responses];
  const fetchFn = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const next = queue.shift();
    if (!next) throw new Error('unexpected extra fetch');
    return typeof next === 'function' ? next() : next;
  }) as unknown as typeof fetch;

  const client = new StravaClient(credentials, tokenStore, new RateLimitRegistry(() => NOW_MS), () => NOW_MS, fetchFn);
  return { client, calls, tokenStore, credentials };
}

const FRESH = { expiresAt: NOW_SEC + 3600 };
const EXPIRED = { expiresAt: NOW_SEC - 1 };

const wire = (id: number) => ({
  id,
  name: `a${id}`,
  type: 'Run',
  sport_type: 'TrailRun',
  start_date: '2026-11-10T08:00:00Z',
  moving_time: 100,
  elapsed_time: 120,
  distance: 1000,
  total_elevation_gain: 5,
  average_heartrate: 140,
});
const ok = (body: unknown, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status: 200, headers });
const authHeader = (call: Call) => (call.init?.headers as Record<string, string>).Authorization;

test('maps Strava activities to our model, preferring sport_type over type', async () => {
  const { client } = setup([ok([wire(5)])], FRESH);
  const [result] = await client.fetchActivities(1, 100, 200);
  assert.deepEqual(result, {
    id: 5, athleteId: 1, name: 'a5', sportType: 'TrailRun', startDate: '2026-11-10T08:00:00Z',
    movingTimeSec: 100, elapsedTimeSec: 120, distanceM: 1000, elevationGainM: 5, averageHeartrate: 140,
  });
  assert.equal(toActivity({ ...wire(6), sport_type: undefined }, 1).sportType, 'Run');
});

test('requests the window with the access token and stops after a short page', async () => {
  const { client, calls } = setup([ok([wire(1)])], FRESH);
  await client.fetchActivities(1, 100, 200);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /after=100&before=200&page=1&per_page=200$/);
  assert.equal(authHeader(calls[0]), 'Bearer old-access');
});

test('keeps paging while pages are full', async () => {
  const fullPage = Array.from({ length: PAGE_SIZE }, (_, i) => wire(i));
  const { client, calls } = setup([ok(fullPage), ok([wire(999)])], FRESH);
  const result = await client.fetchActivities(1, 0, 1);
  assert.equal(result.length, PAGE_SIZE + 1);
  assert.match(calls[1].url, /page=2/);
});

test('refreshes an expired token, stores the rotated refresh token and uses the new access token', async () => {
  const refreshed = ok({ access_token: 'new-access', refresh_token: 'new-refresh', expires_at: 4_100_000_000 });
  const { client, calls, tokenStore } = setup([refreshed, ok([])], EXPIRED);
  await client.fetchActivities(1, 0, 1);
  assert.match(calls[0].url, /oauth\/token$/);
  const body = String(calls[0].init?.body);
  assert.match(body, /grant_type=refresh_token/);
  assert.match(body, /refresh_token=old-refresh/);
  assert.deepEqual(tokenStore.get(1), { accessToken: 'new-access', refreshToken: 'new-refresh', expiresAt: 4_100_000_000 });
  assert.equal(authHeader(calls[1]), 'Bearer new-access');
});

test('a failed refresh explains the problem and keeps the stored tokens', async () => {
  const { client, tokenStore } = setup([new Response('bad', { status: 401 })], EXPIRED);
  await assert.rejects(() => client.fetchActivities(1, 0, 1), /token refresh failed 401/);
  assert.equal(tokenStore.get(1)?.refreshToken, 'old-refresh');
});

test('missing credentials or tokens fail with a clear message before any request', async () => {
  const noTokens = setup([]);
  await assert.rejects(() => noTokens.client.fetchActivities(1, 0, 1), /No Strava tokens stored for athlete 1/);
  assert.equal(noTokens.calls.length, 0);
  await assert.rejects(() => noTokens.client.fetchActivities(99, 0, 1), /No Strava app credentials stored for athlete 99/);
});

test('HTTP 429 becomes a RateLimitError and other errors keep their status', async () => {
  const limited = setup([new Response('', { status: 429 })], FRESH);
  await assert.rejects(() => limited.client.fetchActivities(1, 0, 1), RateLimitError);
  const broken = setup([new Response('nope', { status: 500 })], FRESH);
  await assert.rejects(() => broken.client.fetchActivities(1, 0, 1), /Strava API 500: nope/);
});

test('stops before sending when the app budget is exhausted', async () => {
  const { client, calls } = setup(
    [ok([], { 'x-ratelimit-limit': '100,1000', 'x-ratelimit-usage': '99,10' })],
    FRESH,
  );
  await client.fetchActivities(1, 0, 1);
  await assert.rejects(() => client.fetchActivities(1, 0, 1), RateLimitError);
  assert.equal(calls.length, 1);
});

test('exchanging a code stores credentials and tokens under the returned athlete', async () => {
  const exchanged = ok({ access_token: 'a', refresh_token: 'r', expires_at: 5, athlete: { id: 77 } });
  const { client, calls, tokenStore, credentials } = setup([exchanged]);
  const result = await client.exchangeCode({ clientId: '10', clientSecret: 'secret' }, 'the-code');
  assert.equal(result.athleteId, 77);
  assert.match(String(calls[0].init?.body), /grant_type=authorization_code/);
  assert.match(String(calls[0].init?.body), /code=the-code/);
  assert.deepEqual(tokenStore.get(77), { accessToken: 'a', refreshToken: 'r', expiresAt: 5 });
  assert.deepEqual(credentials.get(77), { clientId: '10', clientSecret: 'secret' });
});

test('a rejected code exchange stores nothing', async () => {
  const { client, tokenStore } = setup([new Response('invalid', { status: 400 })]);
  await assert.rejects(() => client.exchangeCode({ clientId: '10', clientSecret: 's' }, 'bad'), /Code exchange failed 400/);
  assert.equal(tokenStore.get(77), undefined);
});

test('a token that expires within the safety margin is refreshed before use', async () => {
  const refreshed = ok({ access_token: 'new-access', refresh_token: 'new-refresh', expires_at: NOW_SEC + 21_600 });
  const { client, calls } = setup([refreshed, ok([])], { expiresAt: NOW_SEC + 60 });
  await client.fetchActivities(1, 0, 1);
  assert.match(calls[0].url, /oauth\/token$/);
});

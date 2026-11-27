# Strava Challenge Dashboard

Dashboard for a company-wide quarterly sport challenge. Strava's API has no "challenge" endpoint, so this
project pulls each member's activities for a date range, stores them locally and aggregates them into
configurable challenges (e.g. a 700 h group goal plus biking / walking / running / fitness leaderboards).

Zero runtime dependencies: Node.js ≥ 22 and TypeScript only.

## Quick start

```powershell
npm install
copy .env.example .env      # local use only; in CI secrets come from the encrypted state branch (docs/deployment.md)
npm run auth                # prints the consent URL (activity:read_all: private activities too; add --public for activity:read)
npm run auth -- <clientId> <clientSecret> <code>   # local-only: store a member's tokens in data/
npm run init-state           # admin, once: create the shared encrypted state from your own account
npm run add-member          # admin: guided, adds a member to the shared encrypted state (see docs/deployment.md)
npm run members             # admin: shows who has authorized and with which scope
npm run sync                # fetch activities (incremental)
npm run report              # console summary
npm start                   # dashboard on http://localhost:3000
npm run build; node dist/cli.js export site/data   # static JSON export used for GitHub Pages
npm test
```

### Strava authentication in 30 seconds
- Access tokens last **6 hours**; refresh tokens don't expire but **rotate** on each refresh. The app refreshes
  automatically and persists the newest refresh token in `data/tokens.json`.
- Reading activities needs scope `activity:read` (public activities only) or `activity:read_all` (also private
  ones). Both are accepted; `npm run members` shows which one each member granted. A token without either
  fails with `401 activity:read_permission missing` – re-run `npm run auth`.
- The authorization `code` is single-use; the access token printed on the API settings page has only `read` scope.
- **Each member needs their own Strava API app**: new apps are limited to 1 connected athlete (the owner).
  Send members [instructions.md](instructions.md); credentials and tokens are stored per athlete.

## Configuration
`config/challenge.json` defines the `title`, the `firstQuarter` to track, the members and the challenges.
A challenge has a `metric` (`movingTime` → hours, `elapsedTime` → hours, `distance` → km), the Strava
`sportTypes` it counts (or `"*"`), an optional `goal`, and an optional `goalByQuarter` (e.g.
`{ "2026-Q3": 500 }`) to override the goal for a specific quarter. Adding a challenge is a JSON-only change
(see `.github/skills/add-challenge`).

### Quarters
Quarters are calendar quarters (UTC) derived automatically: the dashboard shows the **current** quarter and a
dropdown lets you browse every quarter back to `firstQuarter`. Nothing needs to be done when a quarter ends –
the next quarter appears by itself and the finished one stays browsable (marked "Completed"). All activities
are kept in `data/activities.json`; quarters are only a view over them. Moving `firstQuarter` earlier
backfills the missing history automatically on the next sync. Deep links: `#/2026-Q3`, `#/2026-Q3/challenge/running`.
CLI: `npm run report -- 2026-Q3`.

### Goals per quarter
Each quarter can have a different target. Set `goal` as the default and override it per quarter:
```json
{ "id": "group", "name": "Group goal", "goal": 700,
  "goalByQuarter": { "2026-Q1": 600, "2026-Q2": 650, "2026-Q3": 700 } }
```
Add a new entry at the start of each quarter; quarters without an entry use `goal`.

### Members joining and leaving
Every member can have an optional, inclusive tenure:
```json
{ "athleteId": 123, "name": "Sofie", "joinedQuarter": "2027-Q1", "leftQuarter": "2027-Q3" }
```
- No `joinedQuarter` = member from the start; no `leftQuarter` = still active.
- A member only counts (totals, leaderboards, detail pages) in quarters inside their tenure, so finished
  quarters keep their original results when someone leaves, and a newcomer doesn't affect earlier quarters.
- Sync only fetches a joiner from their first quarter, and stops calling Strava for a leaver once their last
  quarter is fully synced (saving rate limit).
- To remove someone, set `leftQuarter` instead of deleting them, otherwise past quarters change.
- `leftQuarter` before `joinedQuarter` is rejected at startup.

## Rate limits
Strava applies its limits (100 requests / 15 min and 1000 / day by default; your app's real values are in the
`X-RateLimit-*` response headers) **per API application**. Because every member uses their own Strava app,
each member has an independent budget and the members never compete for it. A normal sync uses only a few
requests per member, so the limits are practically never reached. Safeguards, in case they are:
1. `RateLimitRegistry` keeps one `RateLimitGuard` per app (client id). A guard reads the headers and stops
   that app's requests when fewer than 5 remain. A limited member is skipped; the others still sync.
2. Syncs are incremental (last sync − 1 day), 200 activities per request. Once a day per member the whole current
   quarter is fetched again and replaces the stored copy, so edits and deletions made in Strava are corrected
   (in the first 7 days of a quarter the previous quarter is refreshed too). Anything older than that is not
   re-checked, and nothing here touches tokens.
3. The web server syncs at most once per `SYNC_TTL_MINUTES` and never concurrently.
4. Per member a sync costs about one request per ~200 new activities plus one token refresh every 6 hours.
   The first sync of a long history costs a bit more, which is still far below the limit.

## Architecture
See [docs/architecture.md](docs/architecture.md).

## Hosting
The recommended production setup is GitHub Actions + GitHub Pages: a scheduled workflow syncs Strava and
publishes a static site. Credentials and tokens are stored encrypted on a `state` branch; the only secret you
manage is `STATE_KEY`. The state is created once with `npm run init-state`; members are added with `npm run add-member` (which also starts the workflow) and checked with `npm run members`.
See [docs/deployment.md](docs/deployment.md). `.env` is only for running locally.

## Security
Secrets never go in plain text into the repository: in git they exist only AES-256-GCM encrypted (`state` branch),
the key `STATE_KEY` lives in Actions secrets and your local `.env`; `.env` and `data/` are git-ignored. The
published site contains only aggregated activity data.

# Architecture

```
src/
  domain/      Pure business logic: types, quarters (calendar quarter maths), aggregate() (totals) and buildDetail() (per-challenge insights). No I/O. Fully unit-tested.
  strava/      Strava adapter: StravaClient (ActivitySource), TokenStore, RateLimitGuard.
  infra/       Config loading, JSON-file persistence (ActivityRepository).
  services/    Use cases: SyncService (fetch → store), DashboardService (store → view model).
  server/      HTTP entrypoint (/api/dashboard, /api/challenge/:id, both with ?quarter=YYYY-Qn; static page with #/[quarter/]challenge/:id routes).
  app.ts       Composition root – the only place concrete classes are wired.
  cli.ts       auth | sync | report
public/        Static dashboard (vanilla HTML/JS, no build step).
config/        challenge.json – declarative challenge definitions.
```

## Principles
- **Dependency inversion**: services depend on ports (`ActivitySource`, `ActivityRepository`, `TokenStore`);
  Strava and JSON files are adapters. Swap in SQLite or another provider without touching services.
- **Pure core**: `aggregate(activities, config)` is a pure function; challenges are data, not code.
- **Local store as source of truth**: the UI never calls Strava directly, so page views cost 0 API requests.
- **Incremental, budget-aware sync**: see README "Rate limits".
- **Idempotent**: activities are upserted by id; re-syncing never double counts.
- **Static hosting**: `exportStatic` renders every quarter/challenge view to JSON; the UI falls back from
  `api/...` to `data/...` when no server answers. Credentials and tokens are one `StateBundle`
  (`strava/state-bundle.ts`), encrypted with `state-crypto.ts` into `state.enc` on the `state` git branch.
  `admin/members.ts` holds the guided `add-member`/`members` commands (works on a throwaway clone, never on
  local `data/`); `mergeBundles` makes concurrent saves (CI token rotation vs. add-member) safe.
  See `docs/deployment.md`.
: all activities are stored; `resolveConfig` picks the goal and the members active in a
  quarter (`joinedQuarter`/`leftQuarter`), and `aggregate`/`buildDetail` ignore everyone else. `SyncService`
  uses the same tenure to bound each member's fetch window.

## Extending
- New challenge → edit `config/challenge.json`.
- New metric → add to `Metric`, `metricValue` and `UNIT` in `domain/`.
- New data source → implement `ActivitySource`.
- New storage → implement `ActivityRepository`.

# Architecture

```
src/
  domain/      Pure business logic: types, quarters (calendar quarter maths), aggregate() (totals), buildDetail() (per-challenge insights, built from activity-view.ts, time-series.ts and units.ts). No I/O. Fully unit-tested.
  strava/      Strava adapter: StravaClient (ActivitySource), TokenStore, RateLimitRegistry (one RateLimitGuard per Strava app).
  infra/       Config loading, JSON-file persistence (ActivityRepository), JsonFolderWriter (OutputWriter adapter).
  services/    Use cases: SyncService (fetch → store), DashboardService (store → view model), exportStatic (view model → OutputWriter port).
  server/      HTTP entrypoint: router.ts maps a URL to a response (testable without a socket; /api/dashboard, /api/challenge/:id, both with ?quarter=YYYY-Qn; static page with #/[quarter/]challenge/:id routes), main.ts wires it to node:http.
  testing/     Shared test builders (fixtures.ts): temp folders, activities, challenge files, an in-memory repository.
  app.ts       Composition root – the only place concrete classes are wired.
  commands/    CLI as a Command registry (Command pattern): data-commands.ts, state-commands.ts, index.ts lists them all.
  admin/       Admin use cases with injected dependencies: onboarding.ts (init-state, add-member, members), StateWorkspace
               (throwaway clone of the `state` branch), github-actions.ts (start workflow), member-input.ts (validation), git.ts.
  cli.ts       Thin entry point: looks the command up in the registry and runs it.
public/        Static dashboard (vanilla HTML/JS, no build step).
config/        challenge.json – declarative challenge definitions.
```

## Principles
- **Dependency inversion**: services depend on ports;
  Strava and JSON files are adapters. Swap in SQLite or another provider without touching services.
- **Pure core**: `aggregate(activities, config)` is a pure function; challenges are data, not code.
- **Injected clock**: nothing outside the composition roots (`app.ts`, `commands/*-commands.ts`, `server/main.ts`) reads `Date.now`.
  `RateLimitGuard`, `StravaClient`, the services and `parseQuarter`/`listQuarters` receive time as a parameter, so tests control it.
- **Local store as source of truth**: the UI never calls Strava directly, so page views cost 0 API requests.
- **Incremental, per-app budget-aware sync**: see README "Rate limits".
- **Idempotent**: activities are upserted by id; re-syncing never double counts.
- **Static hosting**: `exportStatic` renders every quarter/challenge view to JSON; the UI falls back from
  `api/...` to `data/...` when no server answers. Credentials and tokens are one `StateBundle`
  (`strava/state-bundle.ts`), encrypted with `state-crypto.ts` into `state.enc` on the `state` git branch.
  `admin/onboarding.ts` holds the guided `add-member`/`members` use cases (they work on a StateWorkspace,
  a throwaway clone, never on local `data/`); `mergeBundles` makes concurrent saves (CI token rotation vs. add-member) safe.
  See `docs/deployment.md`.
- **Tenure-aware history**: all activities are stored; `resolveConfig` picks the goal and the members active in a
  quarter (`joinedQuarter`/`leftQuarter`), and `aggregate`/`buildDetail` ignore everyone else. `SyncService`
  uses the same tenure to bound each member's fetch window.

## Quality gates
Changes are reviewed by the read-only agents in `.github/agents/`: `architecture-guardian`, `code-reviewer`,
`test-reviewer`, `docs-reviewer` and `security-reviewer`; `dashboard-maintainer` runs them before finishing.

## Extending
- New CLI command → write a `Command`, add it to `src/commands/index.ts` (a test checks every npm script maps to one).
- New challenge → edit `config/challenge.json`.
- New metric → add to `Metric`, `metricValue` and `UNIT` in `domain/`.
- New data source → implement `ActivitySource`.
- New storage → implement `ActivityRepository`.

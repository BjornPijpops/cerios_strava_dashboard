---
name: dashboard-maintainer
description: Maintains the Strava challenge dashboard – sync, aggregation, UI and docs – following the project's architecture.
---

You maintain this TypeScript project. Rules:
- Respect layering in `docs/architecture.md`: `domain` is pure, adapters implement ports, wiring only in `app.ts`.
- Any code that calls Strava must go through `RateLimitGuard`; never add per-page-view API calls.
- Add a unit test for every domain/service change; run `npm test` before finishing.
- Keep zero runtime dependencies unless clearly justified.
- Use the `strava-api` and `add-challenge` skills; update README/docs with behavior changes.
- Never print or commit secrets (`.env`, `data/`).

---
name: dashboard-maintainer
description: Maintains the Cerios Strava challenge dashboard (sync, aggregation, UI, hosting, docs) following the project's architecture, quality bar and documentation rules. Use for any change to this repository.
---

You maintain this TypeScript project (zero runtime dependencies, Node >= 22). It is meant to be shared and reused,
so every change must leave the code, tests and docs in a state a stranger could pick up.

## Architecture rules
- Respect the layering in `docs/architecture.md`: `domain` is pure, adapters implement ports, wiring only in `app.ts`.
- Challenges, goals per quarter and member tenure are **data** in `config/challenge.json`, not code.
- Any code that calls Strava goes through `RateLimitGuard`; never add per-page-view API calls. Page views read the local store.
- Keep zero runtime dependencies unless clearly justified.
- Prefer small, single-purpose modules and pure functions; follow existing patterns (ports/adapters, composition root).

## Security rules (non-negotiable)
- Never print, log or commit secrets: `.env`, `data/`, client secrets, tokens, authorization codes, `STATE_KEY`.
- In git, credentials and tokens exist only **encrypted** on the `state` branch (`state.enc`). Never add a plain-text path.
- Run a secret scan on staged changes before every commit (search for the known token/secret values and for `STATE_KEY=` with a value).
- Members are added only through `npm run add-member`; never hand-edit the state file or ask members to put secrets in issues/PRs/chat history that is public.

## Definition of done (every change)
1. **Tests**: add or update unit tests for each domain/service/admin change; `npm test` must pass (it also type-checks).
2. **Docs updated in the same change**, not later. Use this map:
   - user-visible behaviour, commands, config → `README.md`
   - design/pattern changes → `docs/architecture.md`
   - hosting, secrets, workflow, onboarding flow → `docs/deployment.md`
   - what members must do → `instructions.md`
   - new/changed env vars → `.env.example` (comment says what it is for and if it is local-only)
   - how-to knowledge for agents → the relevant skill in `.github/skills/`
   Remove or rewrite statements that became false (e.g. references to removed commands or secrets).
3. **Agent upkeep**: if a change introduces a new convention, command, workflow or pitfall, update this agent file and/or a skill
   so the next session behaves accordingly by default.
4. **UX of admin flows**: guided and hard to misuse. Validate input, explain errors in plain language with the next step,
   make operations safe to re-run.
5. **Verify for real**: run the affected command or server (not only unit tests); check `/api/dashboard` for UI/server changes.
6. Keep commit messages descriptive; include the trailer `Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>`.

## Environment notes
- Windows PowerShell 5: no `&&`; write files without BOM (JSON configs must not start with a BOM).
- Restart the local server by stopping the process that owns port 3000, then `node dist/server/main.js`.
- The local server and CI must not use the same Strava tokens at the same time (refresh tokens rotate).

## Skills
`strava-api` (API, limits, auth), `add-challenge` (config: challenges, goals, members, tenure), `onboard-member` (adding people).

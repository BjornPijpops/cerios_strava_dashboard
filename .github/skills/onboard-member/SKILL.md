---
name: onboard-member
description: Add, re-authorize or check a member of the Strava challenge. Use when someone sends their Strava client id/secret/redirect URL, or when asked who is connected.
---

# Onboarding a member

Facts: new Strava apps allow one athlete, so each member creates their own Strava API app (see `instructions.md`).
Credentials and tokens live encrypted on the `state` branch; `STATE_KEY` (in `.env` and as Actions secret) is the key.

## Steps
1. Member sends: **Client ID**, **Client Secret**, **full redirect URL** (`http://localhost/?state=&code=...&scope=...`).
2. Ensure they are in `config/challenge.json` (`athleteId`, `name`; optional `joinedQuarter`/`leftQuarter`); commit and push.
3. Run `npm run add-member` and paste the three values. It parses the code, verifies scope `activity:read_all`,
   exchanges the code, encrypts, pushes to `state` and triggers the workflow (falls back to printing the Actions link). It never touches local `data/`. The very first time, run `npm run init-state` instead (creates `state` from the admin's own data/).
4. Run `npm run members` to confirm ✔. The workflow it started syncs them within about a minute.

## Pitfalls
- Codes are single-use and short-lived (Strava does not document the lifetime; assume a few minutes): run `add-member` immediately, ask for a fresh URL on failure, and don't test a code anywhere else first.
- Re-running `add-member` for the same person replaces their credentials (fix for revoked access / failed exchange).
- Push rejected → state changed meanwhile; run again (safe).
- Never run a local sync with the tokens CI uses: refresh tokens rotate, so the second one to run holds an invalid token. Recover with `npm run add-member`.
- Wrong `STATE_KEY` → "Cannot decrypt"; never regenerate the key unless all members will re-authorize.
- Never paste secrets into issues, PRs or committed files.

See `docs/deployment.md` for the full flow and troubleshooting table.

---
name: strava-api
description: Strava API facts for this project (auth, tokens, scopes, activities endpoint, rate limits). Use when touching src/strava or debugging 401/429 errors.
---

# Strava API reference

- Token refresh: `POST https://www.strava.com/oauth/token` (`grant_type=refresh_token`). Access token lives 6 h; the refresh token **rotates** – always persist the new one.
- Code exchange: same URL, `grant_type=authorization_code&code=...`. Codes are single-use.
- Consent URL needs `scope=read,activity:read_all`. 401 `activity:read_permission missing` = wrong scope.
- Activities: `GET /api/v3/athlete/activities?after=&before=&page=&per_page=200` (epoch seconds, max 200/page). Only returns the token owner's activities. Use `sport_type` (newer) over `type`.
- Rate limit headers: `X-RateLimit-Limit` / `X-RateLimit-Usage` = `15min,day`. 429 when exceeded. Limits are **per Strava app**, and every member has their own app, so budgets are per member (`RateLimitRegistry`), never shared.
- There is no public challenges API – totals are computed locally.
- Never log or commit tokens; `.env` and `data/` are git-ignored. In git they exist only encrypted on the `state` branch (key: `STATE_KEY`); see `docs/deployment.md`.

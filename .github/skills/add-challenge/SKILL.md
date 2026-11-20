---
name: add-challenge
description: Add or change a challenge, member or period in the Strava dashboard. Use when asked to add a sport category, member, goal or new quarter.
---

# Adding a challenge

1. Edit `config/challenge.json`:
   - `title` / `firstQuarter` – dashboard name and the first calendar quarter to track (`"2026-Q3"`). Quarters are derived automatically; changing `firstQuarter` backfills history on the next sync.
   - `members` – `{ athleteId, name, joinedQuarter?, leftQuarter? }`; quarters are inclusive (`"2026-Q4"`). Never delete a leaver, set `leftQuarter` so past quarters stay intact. Each member must also authorize the app (`npm run auth`).
   - `challenges` – `{ id (unique), name, metric: movingTime|elapsedTime|distance, sportTypes: [...]|"*", goal?, goalByQuarter? }`.
2. Valid sport types: Strava `SportType` enum (Run, TrailRun, Ride, GravelRide, Walk, Hike, WeightTraining, Workout, Yoga…).
3. Run `npm test` and `npm run report` to verify. No code change is needed for new categories.

# Hosting on GitHub Pages (GitHub Actions)

GitHub Pages only serves static files, so the Node server does not run there. Instead, a scheduled workflow
(`.github/workflows/publish.yml`, hourly + on every push to `main`) does the work and publishes the result:

```
Actions secrets ──► state-import ──► sync (Strava) ──► state-export ──► gh secret set STRAVA_STATE
                                        │
                                        └──► export (JSON per quarter/challenge) ──► GitHub Pages
```

**No secret ever lands in the repository or the published site.** Credentials and tokens exist only as an
Actions secret; the site contains only the aggregated JSON under `data/` plus `index.html`.
`.env` and `data/` stay git-ignored and are only for local use.

## One-time setup

### 1. Enable Pages
Repository → **Settings → Pages → Build and deployment → Source: GitHub Actions**.

### 2. Create the `STRAVA_STATE` secret
Locally, after every member has authorized (see [instructions.md](../instructions.md)) and `npm run sync` works:

```powershell
npm run build
node dist/cli.js state-export | gh secret set STRAVA_STATE
```
(or copy it to the clipboard with `node dist/cli.js state-export | clip` and paste it into **Settings → Secrets and variables → Actions →
New repository secret**, name `STRAVA_STATE`). It is one JSON document with every member's Strava app
credentials and tokens.

### 3. Create `SECRETS_ADMIN_TOKEN`
Strava **rotates refresh tokens**, so after each run the workflow must save the new ones back into
`STRAVA_STATE`. The built-in `GITHUB_TOKEN` cannot write secrets, so create a fine-grained personal access token:

- GitHub → **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate**
- Repository access: **only this repository**; Permissions → Repository → **Secrets: Read and write**
- Add it as Actions secret `SECRETS_ADMIN_TOKEN`.

Without it, the workflow still publishes but warns, and the next run fails once the old refresh token is replaced.

### 4. Run it
**Actions → Sync and publish dashboard → Run workflow**. The site URL is shown on the `deploy` job.

## Day-to-day
- **Adding a member:** member authorizes ([instructions.md](../instructions.md)); admin runs `npm run auth -- ...`
  locally, then re-exports `STRAVA_STATE` (step 2) and adds the member to `config/challenge.json`.
- **Changing config** (members, goals, tenure): edit `config/challenge.json` and push – this triggers a publish.
- **Activities cache:** `data/activities.json` is kept in the Actions cache between runs. If it is evicted the next
  run simply re-syncs the history from `firstQuarter` (a few requests per member).
- **Local tokens vs. CI tokens:** because refresh tokens rotate, don't sync locally and in CI with the same
  tokens at the same time; the older copy becomes invalid. Re-run `state-export` after local auth, or use
  local runs only for testing with your own app.

## Privacy
The published JSON contains member names, activity names, sport types, heart rate and elevation. GitHub Pages
sites are **public** on free plans (even for private repos). If that is a problem, use a plan with private Pages,
or trim the exported data in `src/services/static-export.ts`.

## Troubleshooting
| Symptom | Cause |
|---|---|
| `STRAVA_STATE is not set` | Secret missing (step 2). |
| `401` / `Token refresh failed` for everyone | Rotated tokens weren't saved (step 3) or a local sync rotated them. Re-export the state. |
| One member `no tokens configured` | They are not in `STRAVA_STATE` yet; the others still publish. |
| Site shows "Unexpected token" / empty | The workflow hasn't deployed yet, or Pages source isn't "GitHub Actions". |

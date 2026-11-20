# Hosting on GitHub Pages (GitHub Actions)

GitHub Pages only serves static files, so the Node server does not run there. Instead a scheduled workflow
(`.github/workflows/publish.yml`, hourly + on every push to `main`) syncs Strava and publishes the result:

```
branch `state` (encrypted) ──► decrypt ──► sync (Strava) ──► re-encrypt rotated tokens ──► branch `state`
                                              └──► export JSON per quarter/challenge ──► GitHub Pages
```

## How secrets are handled
- Members' Strava credentials and tokens are stored **AES-256-GCM encrypted** in one file (`state.enc`) on a
  separate git branch called `state`. The `main` branch never contains them.
- The only secret you manage is the encryption password `STATE_KEY`, stored as a GitHub Actions secret and
  in your local `.env`. Without it `state.enc` is unreadable.
- Strava **rotates refresh tokens**. After each sync the workflow encrypts the new ones back to the `state`
  branch itself (using the built-in `GITHUB_TOKEN`; no personal access token needed).
- The published site contains only aggregated activity data (see Privacy).

> Use a **private repository** if you can. Encrypted data is safe as long as `STATE_KEY` stays secret and is
> long and random (`npm run state-key` generates one), but a private repo adds a second layer.

## One-time setup (admin)

1. **Create the key.**
   ```powershell
   npm run state-key
   ```
   Copy the output. Add it to `.env` as `STATE_KEY=<value>` and as a GitHub secret named `STATE_KEY`
   (Settings → Secrets and variables → Actions → New repository secret). Store it in your password manager too.
   If you lose it, every member has to authorize again.
2. **Create the encrypted state** from your own account (no colleague needed). Stop any locally running dashboard first
   (it would rotate your tokens behind the workflow's back), then:
   ```powershell
   npm run init-state
   ```
   This creates the `state` branch from your local `data/` and starts the workflow.
3. **Enable Pages**: Settings → Pages → Source: **GitHub Actions**.
4. **Check the result**: Actions tab → *Sync and publish dashboard*. The site URL is shown on the deploy job.

## Adding a member (idiot-proof checklist)
1. Send the member [instructions.md](../instructions.md). They send you back exactly these **three values**:

   | # | Value | Where the member finds it |
   |---|---|---|
   | 1 | **Client ID** | A number on their Strava API page, https://www.strava.com/settings/api |
   | 2 | **Client Secret** | On the same page, hidden behind "Show" |
   | 3 | **Redirect URL** | The full address from their browser's address bar after clicking "Authorize". The page shows an error, that is expected. It looks like `http://localhost/?state=&code=abc123...&scope=read,activity:read_all` |

   You do **not** need their athlete ID (the command works it out). The redirect URL works once and expires
   within minutes, so add the member soon after receiving it.
2. Make sure the member is in `config/challenge.json` (`athleteId` + `name`), commit and push.
3. Run the command and paste the three values one by one when asked (in the order of the table):
   ```powershell
   npm run add-member
   ```
   The command extracts the code from the URL, checks the permission scope, exchanges the code with Strava,
   encrypts, pushes to the `state` branch and **starts the workflow** for you. It tells you whether it worked and if the member is missing
   in `config/challenge.json`. Nothing on your computer is modified, so you can do this at any moment and in
   any order, even while the workflow runs. If a push is rejected, just run it again.
4. Check who is connected:
   ```powershell
   npm run members
   ```
   Shows ✔ / ✘ for each member in `config/challenge.json`. The next hourly run picks up new members, or
   trigger it from the Actions tab.

Authorization codes are single-use and expire within minutes: add the member soon after receiving the URL.
Re-running `add-member` for the same person simply replaces their credentials (use this when someone revokes
access or you get "Code exchange failed").

## Day-to-day
- **Changing config** (members, goals, tenure): edit `config/challenge.json` and push; this triggers a publish.
- **Activities cache:** `data/activities.json` is kept in the Actions cache. If it is evicted the next run
  simply re-syncs the history from `firstQuarter` (a few requests per member).
- **Local testing:** `npm run sync` locally uses your local `data/`. Do not run a local server/sync with the same
  accounts that CI uses; whichever runs second finds an outdated refresh token. Use `npm run add-member` for
  admin tasks (it never touches local `data/`).

## Privacy
The published JSON contains member names, activity names, sport types, heart rate and elevation. GitHub Pages
sites are **public** on free plans (even for private repos). If that is a problem, use a plan with private Pages,
or trim the exported data in `src/services/static-export.ts`.

## Troubleshooting
| Symptom | Cause |
|---|---|
| `Secret STATE_KEY is missing` | Step 1: add it as an Actions secret. |
| `Branch 'state' does not exist yet` | Step 2: run `npm run init-state` once. |
| `Cannot decrypt ... wrong STATE_KEY` | The `.env` / secret key differs from the one that created the state. |
| `STATE_KEY is not set` locally | Add `STATE_KEY=...` to `.env`. |
| `Code exchange failed` | Code expired/used, or wrong client id/secret. Ask the member for a fresh URL. |
| `did not grant activity:read_all` | Member unticked the private-activities box. Authorize again. |
| `401` / `Token refresh failed` for one member | They revoked the app or the state was overwritten. Run `add-member` again. |
| Member shows `no tokens configured` in the sync log | Not in the state yet: run `npm run members`. |

# Join the Strava challenge – instructions for members

New Strava API apps can only connect **one** athlete (their owner). So to let the dashboard read *your*
activities, you create your own small Strava API app (5 minutes, one time) and send three values to the
challenge admin.

You do **not** need to install anything or write code.

## What the dashboard gets
- Read access to your activities (`activity:read_all`): sport type, date, duration and distance.
- It only counts activities between the challenge start and end dates, and stores them in the dashboard's data store (the hosted workflow's cache, or `data/` locally).
- You can revoke access any time at <https://www.strava.com/settings/apps>.

## Step 1 – Create your Strava API app
1. Log in to Strava and open <https://www.strava.com/settings/api>.
2. Fill in the form **exactly** like this:

   | Field | Value |
   |---|---|
   | Application Name | `Company Challenge` (anything you like) |
   | Category | `Data Importer` |
   | Club | *leave empty* |
   | Website | `http://localhost` |
   | Application Description | `Company sport challenge dashboard` |
   | Authorization Callback Domain | `localhost` |
   | Application icon | any image (Strava requires one) |

3. Save. You now see **Client ID** (a number) and **Client Secret** (a long hex string).

## Step 2 – Authorize the app for your account
1. Take this URL and replace `YOUR_CLIENT_ID` with your Client ID:

   ```
   https://www.strava.com/oauth/authorize?client_id=YOUR_CLIENT_ID&response_type=code&redirect_uri=http://localhost&approval_prompt=force&scope=read,activity:read_all
   ```

2. Open it in your browser and click **Authorize**. Keep `View data about your activities` checked,
   otherwise the dashboard cannot read them.
3. Your browser goes to a page that **fails to load** (`This site can't be reached`). That is expected.
   Copy the **full address** from the address bar. It looks like:

   ```
   http://localhost/?state=&code=abc123...&scope=read,activity:read_all
   ```

   The `code` is single-use and short-lived (Strava does not say how long, so assume a few minutes). Send the
   address to the admin right away. If the admin says it failed, just repeat this step and send the new address.

## Step 3 – Send the admin these three things
1. Client ID
2. Client Secret
3. The full `http://localhost/?...code=...` address from step 2

> ⚠️ The Client Secret is a password for your app. Send it privately (direct message, not a public channel).
> Never share the *Your Access Token* / *Your Refresh Token* shown on the API page either; they are not needed.

You're done. If you ever want to stop participating, click **Revoke access** in your Strava settings.

---

## For the admin
Adding a member takes three steps (details and troubleshooting in [docs/deployment.md](docs/deployment.md)):

1. Add `{ "athleteId": <id>, "name": "<name>" }` to `config/challenge.json` (the athlete id is the number in
   the member's profile URL, `strava.com/athletes/<id>`), commit and push.
2. Run `npm run add-member` and paste the member's **Client ID**, **Client Secret** and **redirect URL**.
   It extracts the code, checks the permissions, exchanges it with Strava, stores everything encrypted and starts the dashboard update.
3. Run `npm run members` to see ✔ / ✘ for every member.

When someone joins mid-year add `"joinedQuarter": "2027-Q1"`; when someone leaves add `"leftQuarter": "2026-Q4"`
(the last quarter they count in) instead of deleting them. Add the new quarter's goal to `goalByQuarter`. See the
README sections "Goals per quarter" and "Members joining and leaving".

Tokens refresh automatically. If a member's code expired ("Code exchange failed"), ask them to repeat step 2
above and send a new redirect URL; run `add-member` again with it.

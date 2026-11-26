import * as path from 'node:path';
import { SCOPE_ALL, SCOPE_PUBLIC } from '../admin/member-input';
import { JsonFolderWriter } from '../infra/json-folder-writer';
import { exportStatic } from '../services/static-export';
import { Command } from './command';

/** Commands that read or fetch the dashboard data held in `data/`. */

const authorizeUrl = (clientId: string, scope: string): string =>
  `https://www.strava.com/oauth/authorize?client_id=${clientId}&response_type=code&redirect_uri=http://localhost&approval_prompt=force&scope=${scope}`;

export const auth: Command = {
  name: 'auth',
  usage: '[--public] [clientId clientSecret code]',
  description: "Local only: print the consent URL (--public: public activities only), or store a member's tokens in data/. Admins use add-member instead.",
  async run({ args: rawArgs, config, app }) {
    const publicOnly = rawArgs.includes('--public');
    const args = rawArgs.filter((a) => a !== '--public');
    const [clientId, clientSecret, code] = args;
    if (clientId && clientSecret && code) {
      const { athleteId } = await app().client.exchangeCode({ clientId, clientSecret }, code);
      console.log(`Credentials and tokens stored for athlete ${athleteId}. Now run: npm run sync`);
      return;
    }
    const url = authorizeUrl(clientId ?? config.clientId ?? '<CLIENT_ID>', publicOnly ? `read,${SCOPE_PUBLIC}` : `read,${SCOPE_ALL}`);
    console.log(`1. Open:\n   ${url}\n2. Approve, then copy the "code" parameter from the (failing) localhost redirect URL.\n3. Run: npm run auth -- <clientId> <clientSecret> <code>`);
  },
};

export const sync: Command = {
  name: 'sync',
  description: 'Fetch new activities from Strava. Hosted setups let the workflow do this; do not run it locally with shared tokens.',
  async run({ app }) {
    const { sync: syncService, rateLimit } = app();
    const results = await syncService.syncAll();
    for (const r of results) {
      console.log(`athlete ${r.athleteId}: ${r.error ? `FAILED - ${r.error}` : `${r.fetched} activities fetched`}`);
    }
    const usage = rateLimit.busiest();
    console.log(`rate limit usage (busiest app): ${usage.usage15}/${usage.limit15} (15 min), ${usage.usageDay}/${usage.limitDay} (day)`);
    if (results.some((r) => r.error)) process.exitCode = 1;
  },
};

export const report: Command = {
  name: 'report',
  usage: '[quarter e.g. 2026-Q3]',
  description: 'Print a console summary of a quarter from local data (no API calls).',
  run({ args, app }) {
    const data = app().dashboard.build(args[0]);
    if (!data) throw new Error(`Unknown quarter "${args[0]}"`);
    console.log(`${data.title} - ${data.quarter.label}: ${data.period.start} -> ${data.period.end} (last sync: ${data.lastSyncedAt ?? 'never'})`);
    for (const c of data.challenges) {
      const goal = c.goal ? ` / ${c.goal}${c.unit} (${Math.round((c.progress ?? 0) * 100)}%)` : '';
      console.log(`\n${c.name}: ${c.total}${c.unit}${goal} - ${c.activityCount} activities`);
      for (const [i, e] of c.leaderboard.entries()) console.log(`  ${i + 1}. ${e.name}: ${e.total}${c.unit}`);
    }
  },
};

export const exportSite: Command = {
  name: 'export',
  usage: '[dir]',
  description: 'Write the static JSON used by the hosted site (default site/data).',
  run({ args, app, config }) {
    const outDir = path.resolve(args[0] ?? 'site/data');
    const files = exportStatic(app().dashboard, config.challenge, new JsonFolderWriter(outDir));
    console.log(`Exported ${files} files to ${outDir}`);
  },
};

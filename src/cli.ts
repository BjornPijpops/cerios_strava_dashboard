import * as path from 'node:path';
import { createApp } from './app';
import { exportStatic } from './services/static-export';
import { exportState, importState } from './strava/state-bundle';

async function main(): Promise<void> {
  const command = process.argv[2];

  // Must run before createApp(), which reads the stores from disk.
  if (command === 'state-import') {
    const json = process.env.STRAVA_STATE;
    if (!json) throw new Error('STRAVA_STATE is not set');
    importState(path.join(process.cwd(), 'data'), json);
    console.log('Credentials and tokens imported from STRAVA_STATE.');
    return;
  }

  const app = createApp();

  if (command === 'auth') {
    const [clientId, clientSecret, code] = process.argv.slice(3);
    if (clientId && clientSecret && code) {
      const { athleteId } = await app.client.exchangeCode({ clientId, clientSecret }, code);
      console.log(`Credentials and tokens stored for athlete ${athleteId}. Now run: npm run sync`);
    } else {
      const id = clientId ?? app.config.clientId ?? '<CLIENT_ID>';
      const url = `https://www.strava.com/oauth/authorize?client_id=${id}&response_type=code&redirect_uri=http://localhost&approval_prompt=force&scope=read,activity:read_all`;
      console.log(`1. Open:\n   ${url}\n2. Approve, then copy the "code" parameter from the (failing) localhost redirect URL.\n3. Run: npm run auth -- <clientId> <clientSecret> <code>`);
    }
  } else if (command === 'sync') {
    const results = await app.sync.syncAll();
    for (const r of results) {
      console.log(`athlete ${r.athleteId}: ${r.error ? `FAILED - ${r.error}` : `${r.fetched} activities fetched`}`);
    }
    const rl = app.rateLimit.snapshot();
    console.log(`rate limit usage: ${rl.usage15}/${rl.limit15} (15 min), ${rl.usageDay}/${rl.limitDay} (day)`);
    if (results.some((r) => r.error)) process.exitCode = 1;
  } else if (command === 'state-export') {
    // Prints secrets on purpose: pipe it, e.g. `| gh secret set STRAVA_STATE`.
    process.stdout.write(exportState(app.config.dataDir));
  } else if (command === 'export') {
    const outDir = path.resolve(process.argv[3] ?? 'site/data');
    const files = exportStatic(app.dashboard, app.config.challenge, outDir);
    console.log(`Exported ${files} files to ${outDir}`);
  } else if (command === 'report') {
    const data = app.dashboard.build(process.argv[3]);
    if (!data) throw new Error(`Unknown quarter "${process.argv[3]}"`);
    console.log(`${data.title} - ${data.quarter.label}: ${data.period.start} -> ${data.period.end} (last sync: ${data.lastSyncedAt ?? 'never'})`);
    for (const c of data.challenges) {
      const goal = c.goal ? ` / ${c.goal}${c.unit} (${Math.round((c.progress ?? 0) * 100)}%)` : '';
      console.log(`\n${c.name}: ${c.total}${c.unit}${goal} - ${c.activityCount} activities`);
      for (const [i, e] of c.leaderboard.entries()) console.log(`  ${i + 1}. ${e.name}: ${e.total}${c.unit}`);
    }
  } else {
    console.log('Usage: node dist/cli.js <auth [clientId clientSecret code]|sync|report [quarter e.g. 2026-Q3]|export [dir]|state-export|state-import>');
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error((e as Error).message);
  process.exit(1);
});

import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as readline from 'node:readline/promises';
import { AppConfig } from '../infra/config';
import { StravaClient } from '../strava/client';
import { JsonCredentialStore } from '../strava/credential-store';
import { RateLimitGuard } from '../strava/rate-limit';
import { loadEncrypted, mergeBundles, readBundle, saveEncrypted, StateBundle, writeBundle } from '../strava/state-bundle';
import { JsonTokenStore } from '../strava/token-store';

const BRANCH = 'state';
export const STATE_FILE = 'state.enc';
const REQUIRED_SCOPE = 'activity:read_all';

const git = (cwd: string, ...args: string[]): string =>
  execFileSync('git', ['-c', 'user.name=strava-dashboard', '-c', 'user.email=noreply@users.noreply.github.com', ...args], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();

export function requireStateKey(): string {
  const key = process.env.STATE_KEY;
  if (!key) throw new Error('STATE_KEY is not set. Add it to your .env file (see docs/deployment.md, step 1).');
  return key;
}

/** Extracts the authorization code from the URL the member copied from their browser (also accepts a bare code). */
export function parseRedirect(input: string): { code: string; scope?: string } {
  const trimmed = input.trim();
  if (!trimmed.includes('=')) return { code: trimmed };
  try {
    const url = new URL(trimmed);
    const code = url.searchParams.get('code');
    if (!code) throw new Error();
    return { code, scope: url.searchParams.get('scope') ?? undefined };
  } catch {
    throw new Error('That does not look like the redirect URL. It should look like http://localhost/?state=&code=...&scope=...');
  }
}

/** A throwaway clone of the `state` branch, so the working copy and local data/ are never touched. */
class StateWorkspace {
  readonly dir: string;
  readonly file: string;
  readonly dataDir: string;
  private readonly isNew: boolean;

  constructor(remoteUrl: string) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'strava-state-'));
    this.dir = path.join(root, 'repo');
    this.dataDir = path.join(root, 'data');
    this.file = path.join(this.dir, STATE_FILE);
    fs.mkdirSync(this.dataDir);
    try {
      execFileSync('git', ['clone', '--quiet', '--branch', BRANCH, '--single-branch', remoteUrl, this.dir], { stdio: 'pipe' });
      this.isNew = false;
    } catch {
      fs.mkdirSync(this.dir);
      git(this.dir, 'init', '--quiet');
      git(this.dir, 'checkout', '--quiet', '--orphan', BRANCH);
      git(this.dir, 'remote', 'add', 'origin', remoteUrl);
      this.isNew = true;
    }
  }

  /** Loads the remote state into this workspace's data dir. A brand-new branch is seeded from `seedDataDir`. */
  load(key: string, seedDataDir: string): StateBundle {
    const bundle = this.isNew ? readBundle(seedDataDir) : loadEncrypted(this.file, key);
    writeBundle(this.dataDir, bundle);
    return bundle;
  }

  get created(): boolean {
    return this.isNew;
  }

  publish(key: string, message: string): void {
    saveEncrypted(this.file, key, readBundle(this.dataDir));
    git(this.dir, 'add', STATE_FILE);
    git(this.dir, 'commit', '--quiet', '-m', message);
    try {
      git(this.dir, 'push', '--quiet', 'origin', BRANCH);
    } catch {
      throw new Error('Pushing failed (the state changed in the meantime, or you have no push access). Nothing was lost, just run the command again.');
    }
  }

  dispose(): void {
    fs.rmSync(path.dirname(this.dir), { recursive: true, force: true });
  }
}

const remoteUrl = (root: string): string => git(root, 'remote', 'get-url', 'origin');

export function parseRepo(url: string): { owner: string; repo: string } {
  const m = /github\.com[/:]([^/]+)\/([^/]+?)(?:\.git)?\/?$/.exec(url.trim());
  if (!m) throw new Error(`Cannot read the GitHub owner/repo from remote "${url}"`);
  return { owner: m[1], repo: m[2] };
}

/**
 * Starts the publish workflow with the credentials Git already has for github.com (no extra token to manage).
 * Best effort: never throws, tells the admin what to do instead when it cannot.
 */
export async function triggerWorkflow(root: string): Promise<void> {
  const { owner, repo } = parseRepo(remoteUrl(root));
  const actionsUrl = `https://github.com/${owner}/${repo}/actions`;
  try {
    const creds = execFileSync('git', ['credential', 'fill'], {
      cwd: root,
      encoding: 'utf8',
      input: 'protocol=https\nhost=github.com\n\n',
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    const token = /^password=(.+)$/m.exec(creds)?.[1];
    if (!token) throw new Error('no stored GitHub login');
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/actions/workflows/publish.yml/dispatches`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'strava-dashboard' },
      body: JSON.stringify({ ref: 'main' }),
    });
    if (res.status !== 204) throw new Error(`GitHub answered ${res.status}`);
    console.log(`▶ Workflow started: ${actionsUrl} (the dashboard updates in about a minute)`);
  } catch {
    console.log(`ℹ Could not start the workflow automatically. Start it manually: ${actionsUrl} → "Sync and publish dashboard" → "Run workflow".`);
  }
}

/** Creates the shared state from this machine's own data/ (the admin's account). No colleague needed. */
export async function initState(config: AppConfig): Promise<void> {
  const key = requireStateKey();
  const ws = new StateWorkspace(remoteUrl(config.root));
  try {
    if (!ws.created) {
      console.log('The shared state already exists. Use "npm run add-member" to add people.');
      return;
    }
    const state = ws.load(key, config.dataDir);
    if (!Object.keys(state.tokens).length) throw new Error('data/ has no tokens yet. Authorize your own account first (npm run auth).');
    ws.publish(key, 'Initialize state');
    console.log(`✔ Shared state created with ${Object.keys(state.tokens).length} account(s). Do not run a local sync/server with these accounts from now on.`);
  } finally {
    ws.dispose();
  }
  await triggerWorkflow(config.root);
}

/** Guided flow: paste the member's three values, everything else (exchange, encrypt, commit, push) is automatic. */
export async function addMember(config: AppConfig): Promise<void> {
  const key = requireStateKey();
  const ws = new StateWorkspace(remoteUrl(config.root));
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    if (ws.created) console.log('No shared state yet: creating it from your local data/ folder (your own account).');
    const before = ws.load(key, config.dataDir);

    const clientId = (await rl.question("Member's Client ID: ")).trim();
    const clientSecret = (await rl.question("Member's Client Secret: ")).trim();
    const redirect = parseRedirect(await rl.question('The full redirect URL (http://localhost/?...code=...): '));
    if (!/^\d+$/.test(clientId) || !clientSecret) throw new Error('Client ID must be a number and the Client Secret must not be empty.');
    if (redirect.scope && !redirect.scope.includes(REQUIRED_SCOPE)) {
      throw new Error(`The member did not grant "${REQUIRED_SCOPE}". Ask them to authorize again and tick "View data about your private activities".`);
    }

    const client = new StravaClient(new JsonCredentialStore(ws.dataDir), new JsonTokenStore(ws.dataDir), new RateLimitGuard());
    const { athleteId } = await client.exchangeCode({ clientId, clientSecret }, redirect.code);

    const known = config.challenge.members.find((m) => m.athleteId === athleteId);
    const replaced = String(athleteId) in before.credentials;
    ws.publish(key, `${replaced ? 'Update' : 'Add'} athlete ${athleteId}`);

    console.log(`\n✔ ${known ? known.name : `Athlete ${athleteId}`} is ${replaced ? 're-authorized' : 'added'}. The next scheduled run picks them up (or start it manually from the Actions tab).`);
    if (!known) {
      console.log(`⚠ Athlete ${athleteId} is not in config/challenge.json yet. Add this to "members" and push:\n  { "athleteId": ${athleteId}, "name": "<first name>" }`);
    }
  } finally {
    rl.close();
    ws.dispose();
  }
  await triggerWorkflow(config.root);
}

/** Shows which configured members have authorized, based on the shared state. */
export function memberStatus(config: AppConfig): void {
  const key = requireStateKey();
  const ws = new StateWorkspace(remoteUrl(config.root));
  try {
    if (ws.created) throw new Error('No shared state exists yet. Run: npm run add-member');
    const state = ws.load(key, config.dataDir);
    for (const m of config.challenge.members) {
      const ok = String(m.athleteId) in state.tokens && String(m.athleteId) in state.credentials;
      console.log(`${ok ? '✔' : '✘'} ${m.name} (${m.athleteId})${ok ? '' : '  - not authorized yet'}`);
    }
    const configured = new Set(config.challenge.members.map((m) => String(m.athleteId)));
    for (const id of Object.keys(state.tokens).filter((id) => !configured.has(id))) {
      console.log(`? athlete ${id} has tokens but is not in config/challenge.json`);
    }
  } finally {
    ws.dispose();
  }
}

/** CI helper: decrypts the state file into `dataDir`. */
export function decryptInto(file: string, dataDir: string, key: string): void {
  writeBundle(dataDir, loadEncrypted(file, key));
}

/** CI helper: re-encrypts `dataDir` into `file`, keeping members that were added to the file meanwhile. */
export function saveFrom(file: string, dataDir: string, key: string): void {
  const base = fs.existsSync(file) ? loadEncrypted(file, key) : { credentials: {}, tokens: {} };
  saveEncrypted(file, key, mergeBundles(base, readBundle(dataDir)));
}

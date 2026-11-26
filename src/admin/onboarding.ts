import { ChallengeFile } from '../domain/types';
import { readBundle, StateBundle } from '../strava/state-bundle';
import { WorkflowStart } from './github-actions';
import { accessFromScope, ActivityAccess, validateMemberInput } from './member-input';
import { SharedState } from './state-workspace';

/** Console interaction, injected so the use cases can be tested without a terminal. */
export interface Io {
  ask(question: string): Promise<string>;
  log(message: string): void;
}

/** Exchanges a member's authorization code and stores the resulting credentials + tokens in `dataDir`. */
export type Authorizer = (
  dataDir: string,
  credentials: { clientId: string; clientSecret: string },
  code: string,
  scope?: string,
) => Promise<{ athleteId: number }>;

export interface OnboardingDeps {
  remoteUrl: string;
  /** Opens the shared state; the caller must dispose it. */
  openState: () => SharedState;
  /** Encrypts/decrypts the shared state. */
  stateKey: string;
  members: ChallengeFile['members'];
  /** The admin's own `data/`, used only to seed a brand-new state. */
  localDataDir: string;
  io: Io;
  authorize: Authorizer;
  startWorkflow: (remoteUrl: string) => Promise<WorkflowStart>;
}

/** Tells the admin whether the workflow started, or where to start it by hand. */
async function startAndReport(deps: OnboardingDeps): Promise<void> {
  const { started, actionsUrl } = await deps.startWorkflow(deps.remoteUrl);
  deps.io.log(
    started
      ? `▶ Workflow started: ${actionsUrl} (the dashboard updates in about a minute)`
      : `ℹ Could not start the workflow automatically. Start it manually: ${actionsUrl} → "Sync and publish dashboard" → "Run workflow".`,
  );
}

/** Adds (or re-authorizes) one member in the shared encrypted state, then starts the workflow. */
export async function addMember(deps: OnboardingDeps): Promise<void> {
  const workspace = deps.openState();
  try {
    if (workspace.isNew) deps.io.log('No shared state yet: creating it from your local data/ folder (your own account).');
    const before = workspace.load(deps.stateKey, readBundle(deps.localDataDir));

    const input = validateMemberInput(
      await deps.io.ask("Member's Client ID: "),
      await deps.io.ask("Member's Client Secret: "),
      await deps.io.ask('The full redirect URL (http://localhost/?...code=...): '),
    );
    const { athleteId } = await deps.authorize(workspace.dataDir, input, input.code, input.scope);

    const known = deps.members.find((m) => m.athleteId === athleteId);
    const replaced = String(athleteId) in before.credentials;
    workspace.publish(deps.stateKey, `${replaced ? 'Update' : 'Add'} athlete ${athleteId}`);

    deps.io.log(`\n✔ ${known ? known.name : `Athlete ${athleteId}`} is ${replaced ? 're-authorized' : 'added'}.`);
    if (accessFromScope(input.scope) === 'public') {
      deps.io.log('ℹ Public-only access: private activities are not counted. To include them the member must authorize again with "View data about your private activities" ticked.');
    }
    if (!known) {
      deps.io.log(`⚠ Athlete ${athleteId} is not in config/challenge.json yet. Add this to "members" and push:\n  { "athleteId": ${athleteId}, "name": "<first name>" }`);
    }
  } finally {
    workspace.dispose();
  }
  await startAndReport(deps);
}

/** Creates the shared state from the admin's own local `data/`. Does nothing when it already exists. */
export async function initState(deps: OnboardingDeps): Promise<void> {
  const workspace = deps.openState();
  try {
    if (!workspace.isNew) {
      deps.io.log('The shared state already exists. Use "npm run add-member" to add people.');
      return;
    }
    const seed = readBundle(deps.localDataDir);
    const accounts = Object.keys(seed.tokens).length;
    if (!accounts) throw new Error('data/ has no tokens yet. Authorize your own account first (npm run auth).');
    workspace.load(deps.stateKey, seed);
    workspace.publish(deps.stateKey, 'Initialize state');
    deps.io.log(`✔ Shared state created with ${accounts} account(s). Do not run a local sync/server with these accounts from now on.`);
  } finally {
    workspace.dispose();
  }
  await startAndReport(deps);
}

export interface MemberStatus {
  name: string;
  athleteId: number;
  authorized: boolean;
  /** Which activities the token can read; undefined when unknown (token stored before scopes were tracked). */
  access?: ActivityAccess;
}

/** Pure: which configured members have both credentials and tokens in the state, and which tokens are unknown. */
export function evaluateMembers(members: ChallengeFile['members'], state: StateBundle): { members: MemberStatus[]; unknownIds: string[] } {
  const configured = new Set(members.map((m) => String(m.athleteId)));
  return {
    members: members.map((m) => ({
      name: m.name,
      athleteId: m.athleteId,
      authorized: String(m.athleteId) in state.tokens && String(m.athleteId) in state.credentials,
      access: accessFromScope(state.tokens[String(m.athleteId)]?.scope),
    })),
    unknownIds: Object.keys(state.tokens).filter((id) => !configured.has(id)),
  };
}

const accessLabel = (access: ActivityAccess | undefined): string =>
  access === 'all' ? '  - all activities' : access === 'public' ? '  - public activities only' : '  - access unknown (re-authorize to record it)';

/** Prints who has authorized, based on the shared state. */
export function memberStatus(deps: Pick<OnboardingDeps, 'openState' | 'stateKey' | 'members' | 'localDataDir' | 'io'>): void {
  const workspace = deps.openState();
  try {
    if (workspace.isNew) throw new Error('No shared state exists yet. Run: npm run init-state');
    const { members, unknownIds } = evaluateMembers(deps.members, workspace.load(deps.stateKey, readBundle(deps.localDataDir)));
    for (const m of members) deps.io.log(`${m.authorized ? '✔' : '✘'} ${m.name} (${m.athleteId})${m.authorized ? accessLabel(m.access) : '  - not authorized yet'}`);
    for (const id of unknownIds) deps.io.log(`? athlete ${id} has tokens but is not in config/challenge.json`);
  } finally {
    workspace.dispose();
  }
}

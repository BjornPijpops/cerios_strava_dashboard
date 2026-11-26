import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { JsonCredentialStore } from '../strava/credential-store';
import { JsonTokenStore } from '../strava/token-store';
import { git } from './git';
import { addMember, evaluateMembers, initState, memberStatus, OnboardingDeps } from './onboarding';
import { SharedState, StateWorkspace } from './state-workspace';

const KEY = 'test-key';

function setup(answers: string[], athleteId = 7) {
  const remote = fs.mkdtempSync(path.join(os.tmpdir(), 'remote-'));
  git(remote, 'init', '--quiet', '--bare');
  const localDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'local-'));
  new JsonCredentialStore(localDataDir).set(1, { clientId: '10', clientSecret: 'admin-secret' });
  new JsonTokenStore(localDataDir).set(1, { accessToken: 'a', refreshToken: 'r', expiresAt: 1 });

  const log: string[] = [];
  const queue = [...answers];
  const deps: OnboardingDeps = {
    remoteUrl: remote,
    openState: () => StateWorkspace.open(remote),
    stateKey: KEY,
    members: [
      { athleteId: 1, name: 'Admin' },
      { athleteId, name: 'Sofie' },
      { athleteId: 99, name: 'Waiting' },
    ],
    localDataDir,
    io: { ask: async () => queue.shift() ?? '', log: (m) => log.push(m) },
    authorize: async (dataDir, credentials, _code, scope) => {
      new JsonCredentialStore(dataDir).set(athleteId, credentials);
      new JsonTokenStore(dataDir).set(athleteId, { accessToken: 'x', refreshToken: 'member-refresh', expiresAt: 2, ...(scope ? { scope } : {}) });
      return { athleteId };
    },
    startWorkflow: async () => ({ started: true, actionsUrl: 'https://example/actions' }),
  };
  return { deps, log, remote };
}

const MEMBER_ANSWERS = ['123', 'member-secret', 'http://localhost/?code=c1&scope=read,activity:read_all'];

function storedState(remote: string) {
  const ws = StateWorkspace.open(remote);
  try {
    return ws.load(KEY, { credentials: {}, tokens: {} });
  } finally {
    ws.dispose();
  }
}

test('init-state creates the state from the local account and starts the workflow', async () => {
  const { deps, log, remote } = setup([]);
  await initState(deps);
  assert.deepEqual(Object.keys(storedState(remote).tokens), ['1']);
  assert.ok(log.some((l) => l.includes('Workflow started')));
});

test('init-state refuses to overwrite an existing state', async () => {
  const { deps, log } = setup([]);
  await initState(deps);
  await initState(deps);
  assert.ok(log.some((l) => l.includes('already exists')));
});

test('init-state needs local tokens', async () => {
  const { deps } = setup([]);
  deps.localDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'empty-'));
  await assert.rejects(() => initState(deps), /no tokens yet/);
});

test('add-member stores the member next to existing ones and names them in the confirmation', async () => {
  const { deps, log, remote } = setup(MEMBER_ANSWERS);
  await initState(deps);
  await addMember(deps);

  const state = storedState(remote);
  assert.deepEqual(Object.keys(state.tokens).sort(), ['1', '7']);
  assert.equal(state.credentials['7'].clientSecret, 'member-secret');
  assert.ok(log.some((l) => l.includes('✔ Sofie is added')));
});

test('add-member on the very first run seeds the state with the admin account', async () => {
  const { deps, remote } = setup(MEMBER_ANSWERS);
  await addMember(deps);
  assert.deepEqual(Object.keys(storedState(remote).tokens).sort(), ['1', '7']);
});

test('add-member re-authorizes an existing member and warns about athletes missing in the config', async () => {
  const first = setup(MEMBER_ANSWERS, 7);
  await addMember(first.deps);
  const again = { ...first.deps, io: { ...first.deps.io, ask: async () => '' } };
  const answers = [...MEMBER_ANSWERS];
  again.io.ask = async () => answers.shift() ?? '';
  await addMember(again);
  assert.ok(first.log.some((l) => l.includes('re-authorized')));

  const stranger = setup(MEMBER_ANSWERS, 555);
  stranger.deps.members = [{ athleteId: 1, name: 'Admin' }];
  await addMember(stranger.deps);
  assert.ok(stranger.log.some((l) => l.includes('not in config/challenge.json yet')));
});

test('add-member rejects invalid input before touching Strava or the remote', async () => {
  const { deps, remote } = setup(['not-a-number', 's', 'http://localhost/?code=c']);
  await assert.rejects(() => addMember(deps), /Client ID must be a number/);
  assert.equal(StateWorkspace.open(remote).isNew, true);
});

test('add-member tells the admin where to start the workflow when it cannot start it', async () => {
  const { deps, log } = setup(MEMBER_ANSWERS);
  deps.startWorkflow = async () => ({ started: false, actionsUrl: 'https://example/actions' });
  await addMember(deps);
  assert.ok(log.some((l) => l.includes('Start it manually')));
});

test('evaluateMembers separates authorized, waiting and unknown athletes', () => {
  const state = {
    credentials: { '1': { clientId: '1', clientSecret: 's' }, '5': { clientId: '5', clientSecret: 's' } },
    tokens: { '1': { accessToken: '', refreshToken: 'r', expiresAt: 0 }, '5': { accessToken: '', refreshToken: 'r', expiresAt: 0 } },
  };
  const result = evaluateMembers([{ athleteId: 1, name: 'A' }, { athleteId: 2, name: 'B' }], state);
  assert.deepEqual(result.members.map((m) => m.authorized), [true, false]);
  assert.deepEqual(result.unknownIds, ['5']);
});

test('members reports a missing state with the next step', () => {
  const { deps } = setup([]);
  assert.throws(() => memberStatus(deps), /npm run init-state/);
});

test('members prints a line per configured member', async () => {
  const { deps, log } = setup(MEMBER_ANSWERS);
  await addMember(deps);
  log.length = 0;
  memberStatus(deps);
  assert.deepEqual(log, ['✔ Admin (1)  - access unknown (re-authorize to record it)', '✔ Sofie (7)  - all activities', '✘ Waiting (99)  - not authorized yet']);
});

test('add-member accepts a public-only grant, says what is missing and members shows it', async () => {
  const { deps, log } = setup(['123', 'member-secret', 'http://localhost/?code=c1&scope=read,activity:read']);
  await addMember(deps);
  assert.ok(log.some((l) => l.includes('Public-only access')));
  log.length = 0;
  memberStatus(deps);
  assert.ok(log.includes('✔ Sofie (7)  - public activities only'));
});

function fakeState(isNew: boolean) {
  const calls: string[] = [];
  const state: SharedState = {
    isNew,
    dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'fake-state-')),
    load: (_key, seed) => {
      calls.push('load');
      return seed;
    },
    publish: () => calls.push('publish'),
    dispose: () => calls.push('dispose'),
  };
  return { state, calls };
}

test('add-member disposes the state and publishes nothing when authorization fails', async () => {
  const { deps } = setup(MEMBER_ANSWERS);
  const { state, calls } = fakeState(false);
  deps.openState = () => state;
  deps.authorize = async () => {
    throw new Error('Strava said no');
  };
  await assert.rejects(addMember(deps), /Strava said no/);
  assert.deepEqual(calls, ['load', 'dispose']);
});

test('member-status disposes the state even when there is none yet', () => {
  const { deps } = setup([]);
  const { state, calls } = fakeState(true);
  deps.openState = () => state;
  assert.throws(() => memberStatus(deps), /npm run init-state/);
  assert.deepEqual(calls, ['dispose']);
});

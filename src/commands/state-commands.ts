import * as readline from 'node:readline/promises';
import { remoteUrlOf, startPublishWorkflow, tokenFromGitCredentials } from '../admin/github-actions';
import { StateWorkspace } from '../admin/state-workspace';
import { addMember, initState, memberStatus, OnboardingDeps } from '../admin/onboarding';
import { AppConfig } from '../infra/config';
import { StravaClient } from '../strava/client';
import { JsonCredentialStore } from '../strava/credential-store';
import { RateLimitRegistry } from '../strava/rate-limit';
import { decryptStateFile, updateStateFile } from '../strava/state-bundle';
import { generateKey } from '../strava/state-crypto';
import { JsonTokenStore } from '../strava/token-store';
import { Command } from './command';

/** Commands that manage the shared, encrypted state (credentials + tokens). None of them need `createApp()`. */

function requireStateKey(): string {
  const key = process.env.STATE_KEY;
  if (!key) throw new Error('STATE_KEY is not set. Add it to your .env file (see docs/deployment.md, step 1).');
  return key;
}

function requireFileArg(args: string[], command: string): string {
  if (!args[0]) throw new Error(`Usage: ${command} <state.enc>`);
  return args[0];
}

/** Production wiring of the onboarding use cases: real terminal, real Strava, real GitHub. */
function onboardingDeps(config: AppConfig, rl?: readline.Interface): OnboardingDeps {
  const remoteUrl = remoteUrlOf(config.root);
  return {
    remoteUrl,
    openState: () => StateWorkspace.open(remoteUrl),
    stateKey: requireStateKey(),
    members: config.challenge.members,
    localDataDir: config.dataDir,
    io: { ask: (q) => (rl ? rl.question(q) : Promise.reject(new Error('No terminal available'))), log: console.log },
    authorize: (dataDir, credentials, code) =>
      new StravaClient(new JsonCredentialStore(dataDir), new JsonTokenStore(dataDir), new RateLimitRegistry(Date.now), Date.now).exchangeCode(credentials, code),
    startWorkflow: (url) => startPublishWorkflow(url, { getToken: () => tokenFromGitCredentials(config.root), fetchFn: fetch }),
  };
}

/** Runs `action` with an interactive prompt and always closes it. */
async function withTerminal<T>(action: (rl: readline.Interface) => Promise<T>): Promise<T> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    return await action(rl);
  } finally {
    rl.close();
  }
}

export const stateKey: Command = {
  name: 'state-key',
  description: 'Generate a new random STATE_KEY.',
  run: () => console.log(generateKey()),
};

export const initStateCommand: Command = {
  name: 'init-state',
  description: 'Admin, once: create the shared encrypted state from your own local account.',
  run: ({ config }) => initState(onboardingDeps(config)),
};

export const addMemberCommand: Command = {
  name: 'add-member',
  description: 'Admin: guided. Add or re-authorize a member (Client ID, Client Secret, redirect URL), then start the workflow.',
  run: ({ config }) => withTerminal((rl) => addMember(onboardingDeps(config, rl))),
};

export const members: Command = {
  name: 'members',
  description: 'Admin: show which configured members have authorized.',
  run: ({ config }) => memberStatus(onboardingDeps(config)),
};

export const stateDecrypt: Command = {
  name: 'state-decrypt',
  usage: '<file>',
  description: 'CI: decrypt the state file into data/.',
  run: ({ args, config }) => {
    decryptStateFile(requireFileArg(args, 'state-decrypt'), config.dataDir, requireStateKey());
    console.log('Credentials and tokens decrypted into data/.');
  },
};

export const stateSave: Command = {
  name: 'state-save',
  usage: '<file>',
  description: 'CI: encrypt data/ back into the state file, keeping members added meanwhile.',
  run: ({ args, config }) => {
    updateStateFile(requireFileArg(args, 'state-save'), config.dataDir, requireStateKey());
    console.log('Credentials and tokens encrypted.');
  },
};

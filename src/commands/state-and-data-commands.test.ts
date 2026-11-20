import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { createApp } from '../app';
import { AppConfig } from '../infra/config';
import { saveEncrypted, readBundle, writeBundle } from '../strava/state-bundle';
import { activity, challengeFile, tempDir } from '../testing/fixtures';
import { Command } from './command';
import { exportSite, report } from './data-commands';
import { stateDecrypt, stateSave } from './state-commands';

function context(args: string[] = []) {
  const root = tempDir('cmd-');
  const config: AppConfig = { root, port: 0, syncTtlMinutes: 30, dataDir: path.join(root, 'data'), challenge: challengeFile() };
  fs.mkdirSync(config.dataDir);
  fs.writeFileSync(path.join(config.dataDir, 'activities.json'), JSON.stringify({ syncedAt: {}, activities: { 1: activity() } }));
  return { args, config, app: () => createApp(config), root };
}

/** Captures console.log while a command runs. */
async function output(command: Command, ctx: ReturnType<typeof context>): Promise<string> {
  const lines: string[] = [];
  const original = console.log;
  console.log = (...a) => void lines.push(a.join(' '));
  try {
    await command.run(ctx);
  } finally {
    console.log = original;
  }
  return lines.join('\n');
}

async function withStateKey<T>(key: string | undefined, body: () => T | Promise<T>): Promise<T> {
  const saved = process.env.STATE_KEY;
  key === undefined ? delete process.env.STATE_KEY : (process.env.STATE_KEY = key);
  try {
    return await body();
  } finally {
    saved === undefined ? delete process.env.STATE_KEY : (process.env.STATE_KEY = saved);
  }
}

test('report prints the title, period and leaderboards from local data', async () => {
  const text = await output(report, context());
  assert.match(text, /Test Challenge/);
  assert.match(text, /Group goal/);
  assert.match(text, /Anna/);
});

test('report rejects an unknown quarter', () => {
  assert.throws(() => report.run(context(['1999-Q1'])), /Unknown quarter "1999-Q1"/);
});

test('export writes the static files to the given folder', async () => {
  const outDir = path.join(tempDir('out-'), 'site');
  const text = await output(exportSite, context([outDir]));
  assert.match(text, /Exported \d+ files/);
  assert.ok(fs.existsSync(path.join(outDir, 'dashboard', 'current.json')));
});

test('state commands need STATE_KEY and a file argument', async () => {
  await withStateKey(undefined, () => {
    assert.throws(() => stateDecrypt.run(context(['x'])), /STATE_KEY is not set/);
    assert.throws(() => stateSave.run(context(['x'])), /STATE_KEY is not set/);
  });
  await withStateKey('k', () => {
    assert.throws(() => stateDecrypt.run(context([])), /Usage: state-decrypt/);
    assert.throws(() => stateSave.run(context([])), /Usage: state-save/);
  });
});

test('state-decrypt then state-save round-trips the rotated tokens', async () => {
  const ctx = context();
  const stateFile = path.join(ctx.root, 'state.enc');
  const bundle = {
    credentials: { '1': { clientId: '10', clientSecret: 's' } },
    tokens: { '1': { accessToken: 'a', refreshToken: 'old', expiresAt: 1 } },
  };
  saveEncrypted(stateFile, 'k', bundle);
  await withStateKey('k', async () => {
    await output(stateDecrypt, { ...ctx, args: [stateFile] });
    writeBundle(ctx.config.dataDir, { ...bundle, tokens: { '1': { ...bundle.tokens['1'], refreshToken: 'rotated' } } });
    await output(stateSave, { ...ctx, args: [stateFile] });
  });
  assert.equal(readBundle(ctx.config.dataDir).tokens['1'].refreshToken, 'rotated');
});

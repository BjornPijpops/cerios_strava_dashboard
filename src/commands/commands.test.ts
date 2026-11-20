import assert from 'node:assert/strict';
import { test } from 'node:test';
import { commands, usage } from './index';

test('command names are unique and documented', () => {
  const names = commands.map((c) => c.name);
  assert.equal(new Set(names).size, names.length);
  for (const c of commands) assert.ok(c.description.length > 10, `${c.name} needs a description`);
});

test('every command is listed in the usage text', () => {
  for (const c of commands) assert.ok(usage().includes(c.name));
});

test('every npm script that calls the CLI maps to a registered command', async () => {
  const { readFileSync } = await import('node:fs');
  const scripts = JSON.parse(readFileSync('package.json', 'utf8')).scripts as Record<string, string>;
  const known = new Set(commands.map((c) => c.name));
  for (const [script, cmd] of Object.entries(scripts)) {
    const m = /node dist\/cli\.js (\S+)/.exec(cmd);
    if (m) assert.ok(known.has(m[1]), `npm run ${script} calls unknown command "${m[1]}"`);
  }
});

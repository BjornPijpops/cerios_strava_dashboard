import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { JsonFolderWriter } from '../infra/json-folder-writer';
import { activity, challengeFile, memoryRepo, tempDir } from '../testing/fixtures';
import { DashboardService } from './dashboard-service';
import { exportStatic, OutputWriter } from './static-export';

const NOW = Date.parse('2026-11-20T10:00:00Z');

/** Collects documents in memory instead of writing files. */
function memoryOutput(): OutputWriter & { documents: Map<string, unknown> } {
  const documents = new Map<string, unknown>();
  return { documents, write: (relativePath, body) => void documents.set(relativePath, JSON.parse(JSON.stringify(body))) };
}

function exportToMemory() {
  const repo = memoryRepo();
  repo.upsertMany([activity({ startDate: '2026-11-10T08:00:00Z' })]);
  const file = challengeFile();
  const output = memoryOutput();
  const count = exportStatic(new DashboardService(repo, file, () => NOW), file, output);
  return { count, documents: output.documents };
}

test('writes an overview and a detail per challenge for every quarter, plus the current alias', () => {
  const { count, documents } = exportToMemory();
  // 2 quarters x (1 overview + 2 details) + 3 alias documents for the current quarter
  assert.equal(count, 9);
  assert.deepEqual([...documents.keys()].sort(), [
    'challenge/2026-Q3/group.json',
    'challenge/2026-Q3/running.json',
    'challenge/2026-Q4/group.json',
    'challenge/2026-Q4/running.json',
    'challenge/current/group.json',
    'challenge/current/running.json',
    'dashboard/2026-Q3.json',
    'dashboard/2026-Q4.json',
    'dashboard/current.json',
  ]);
});

test('the current alias holds the same content as the current quarter', () => {
  const { documents } = exportToMemory();
  assert.deepEqual(documents.get('dashboard/current.json'), documents.get('dashboard/2026-Q4.json'));
  assert.equal((documents.get('dashboard/2026-Q3.json') as { quarter: { id: string } }).quarter.id, '2026-Q3');
});

test('the folder writer creates nested files as JSON and overwrites on a second run', () => {
  const folder = tempDir('export-');
  const writer = new JsonFolderWriter(folder);
  writer.write('a/b/c.json', { n: 1 });
  writer.write('a/b/c.json', { n: 2 });
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(folder, 'a', 'b', 'c.json'), 'utf8')), { n: 2 });
});

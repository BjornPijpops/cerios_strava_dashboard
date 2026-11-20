import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { activity, challengeFile, memoryRepo, tempDir } from '../testing/fixtures';
import { DashboardService } from './dashboard-service';
import { exportStatic } from './static-export';

const NOW = Date.parse('2026-11-20T10:00:00Z');

function exportToTemp() {
  const repo = memoryRepo();
  repo.upsertMany([activity({ startDate: '2026-11-10T08:00:00Z' })]);
  const file = challengeFile();
  const outDir = tempDir('export-');
  const count = exportStatic(new DashboardService(repo, file, () => NOW), file, outDir);
  return { count, outDir };
}

const read = (outDir: string, rel: string) => JSON.parse(fs.readFileSync(path.join(outDir, rel), 'utf8'));

test('writes an overview and a detail per challenge for every quarter, plus the current alias', () => {
  const { count, outDir } = exportToTemp();
  // 2 quarters x (1 overview + 2 details) + 3 alias files for the current quarter
  assert.equal(count, 9);
  for (const rel of ['dashboard/2026-Q4.json', 'dashboard/2026-Q3.json', 'dashboard/current.json', 'challenge/2026-Q4/group.json', 'challenge/current/running.json']) {
    assert.ok(fs.existsSync(path.join(outDir, rel)), `${rel} should exist`);
  }
});

test('the current alias holds the same content as the current quarter', () => {
  const { outDir } = exportToTemp();
  assert.deepEqual(read(outDir, 'dashboard/current.json'), read(outDir, 'dashboard/2026-Q4.json'));
  assert.equal(read(outDir, 'dashboard/2026-Q3.json').quarter.id, '2026-Q3');
});

test('running it twice overwrites instead of failing', () => {
  const repo = memoryRepo();
  const file = challengeFile();
  const outDir = tempDir('export-');
  const service = new DashboardService(repo, file, () => NOW);
  assert.equal(exportStatic(service, file, outDir), exportStatic(service, file, outDir));
});

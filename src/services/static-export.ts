import * as fs from 'node:fs';
import * as path from 'node:path';
import { ChallengeFile } from '../domain/types';
import { DashboardService } from './dashboard-service';

/**
 * Writes every dashboard view as a JSON file so the UI can be hosted statically (GitHub Pages):
 *   dashboard/<quarter>.json            challenge/<quarter>/<challengeId>.json
 * `current` is an alias for the running quarter. Returns the number of files written.
 */
export function exportStatic(service: DashboardService, file: ChallengeFile, outDir: string): number {
  let count = 0;
  const write = (rel: string, body: unknown): void => {
    const target = path.join(outDir, rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, JSON.stringify(body));
    count++;
  };

  const quarters = service.quarters();
  for (const q of quarters) {
    const aliases = q.id === quarters[0].id ? [q.id, 'current'] : [q.id];
    const overview = service.build(q.id);
    for (const alias of aliases) write(`dashboard/${alias}.json`, overview);
    for (const c of file.challenges) {
      const detail = service.detail(c.id, q.id);
      if (!detail) continue;
      for (const alias of aliases) write(`challenge/${alias}/${c.id}.json`, detail);
    }
  }
  return count;
}

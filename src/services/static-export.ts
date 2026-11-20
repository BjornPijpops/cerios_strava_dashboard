import { ChallengeFile } from '../domain/types';
import { DashboardService } from './dashboard-service';

/** Port for where exported documents go (a folder today; could be a bucket or an in-memory map). */
export interface OutputWriter {
  write(relativePath: string, body: unknown): void;
}

/**
 * Writes every dashboard view as a JSON document so the UI can be hosted statically (GitHub Pages):
 *   dashboard/<quarter>.json            challenge/<quarter>/<challengeId>.json
 * `current` is an alias for the running quarter. Returns the number of documents written.
 */
export function exportStatic(service: DashboardService, file: ChallengeFile, output: OutputWriter): number {
  let count = 0;
  const write = (relativePath: string, body: unknown): void => {
    output.write(relativePath, body);
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

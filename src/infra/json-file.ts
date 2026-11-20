import * as fs from 'node:fs';
import * as path from 'node:path';

/** Reads a JSON file, returning `fallback` if it does not exist. */
export function readJson<T>(file: string, fallback: T): T {
  if (!fs.existsSync(file)) return fallback;
  return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
}

/** Writes atomically (temp file + rename) so a crash never leaves a half-written file. */
export function writeJson(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
  fs.renameSync(tmp, file);
}

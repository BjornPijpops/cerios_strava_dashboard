import * as fs from 'node:fs';
import * as path from 'node:path';
import { OutputWriter } from '../services/static-export';

/** Writes each document as a JSON file below a folder, creating sub-folders as needed. */
export class JsonFolderWriter implements OutputWriter {
  constructor(private readonly folder: string) {}

  write(relativePath: string, body: unknown): void {
    const target = path.join(this.folder, relativePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, JSON.stringify(body));
  }
}

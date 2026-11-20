import { Command } from './command';
import { auth, exportSite, report, sync } from './data-commands';
import { addMemberCommand, initStateCommand, members, stateDecrypt, stateKey, stateSave } from './state-commands';

/** The single list of CLI commands. Adding a command = write it, add it here; the usage text follows. */
export const commands: Command[] = [auth, sync, report, exportSite, initStateCommand, addMemberCommand, members, stateKey, stateDecrypt, stateSave];

export function usage(): string {
  const lines = commands.map((c) => `  ${`${c.name} ${c.usage ?? ''}`.trim().padEnd(28)} ${c.description}`);
  return `Usage: node dist/cli.js <command>\n\n${lines.join('\n')}`;
}

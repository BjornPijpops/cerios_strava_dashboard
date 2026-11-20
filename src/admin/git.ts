import { execFileSync } from 'node:child_process';

/** Fixed identity so commits work on machines (and CI runners) without a configured git user. */
const IDENTITY = ['-c', 'user.name=strava-dashboard', '-c', 'user.email=noreply@users.noreply.github.com'];

/** Runs a git command and returns its trimmed stdout. Throws with git's stderr on failure. */
export function git(cwd: string, ...args: string[]): string {
  return run(cwd, undefined, args);
}

/** Like `git()`, but feeds `input` to stdin (needed by e.g. `git credential fill`). */
export function gitWithInput(cwd: string, input: string, ...args: string[]): string {
  return run(cwd, input, args);
}

function run(cwd: string, input: string | undefined, args: string[]): string {
  return execFileSync('git', [...IDENTITY, ...args], {
    cwd,
    input,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  }).trim();
}

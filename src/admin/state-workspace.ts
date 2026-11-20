import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { readBundle, StateBundle, writeBundle, loadEncrypted, saveEncrypted } from '../strava/state-bundle';
import { git } from './git';

/** Orphan branch that holds nothing but the encrypted state file. */
export const STATE_BRANCH = 'state';
export const STATE_FILE = 'state.enc';

/**
 * A throwaway clone of the `state` branch.
 *
 * Admin commands change the shared state in here instead of in the project's own working copy, so they
 * never touch the local `data/` folder and cannot disturb a running dashboard. Lifecycle:
 * `open` -> `load` -> (modify files in `dataDir`) -> `publish` -> `dispose`.
 */
export class StateWorkspace {
  /** Scratch folder with `credentials.json` / `tokens.json`, in the same layout the app uses for `data/`. */
  readonly dataDir: string;

  private constructor(
    private readonly root: string,
    private readonly repoDir: string,
    /** True when the remote has no `state` branch yet. */
    readonly isNew: boolean,
  ) {
    this.dataDir = path.join(root, 'data');
    fs.mkdirSync(this.dataDir);
  }

  /** Clones the `state` branch, or prepares a fresh orphan branch when the remote does not have one yet. */
  static open(remoteUrl: string): StateWorkspace {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'strava-state-'));
    const repoDir = path.join(root, 'repo');
    try {
      git(root, 'clone', '--quiet', '--branch', STATE_BRANCH, '--single-branch', remoteUrl, repoDir);
      return new StateWorkspace(root, repoDir, false);
    } catch {
      fs.mkdirSync(repoDir);
      git(repoDir, 'init', '--quiet');
      git(repoDir, 'checkout', '--quiet', '--orphan', STATE_BRANCH);
      git(repoDir, 'remote', 'add', 'origin', remoteUrl);
      return new StateWorkspace(root, repoDir, true);
    }
  }

  /**
   * Decrypts the stored state into `dataDir` and returns it. For a brand-new branch there is nothing to
   * decrypt, so `seed` is used instead.
   */
  load(key: string, seed: StateBundle): StateBundle {
    const bundle = this.isNew ? seed : loadEncrypted(this.stateFile, key);
    writeBundle(this.dataDir, bundle);
    return bundle;
  }

  /** Encrypts whatever is in `dataDir` and pushes it. Fails without losing anything when the push is rejected. */
  publish(key: string, message: string): void {
    saveEncrypted(this.stateFile, key, readBundle(this.dataDir));
    git(this.repoDir, 'add', STATE_FILE);
    git(this.repoDir, 'commit', '--quiet', '-m', message);
    try {
      git(this.repoDir, 'push', '--quiet', 'origin', STATE_BRANCH);
    } catch {
      throw new Error('Pushing failed (the state changed in the meantime, or you have no push access). Nothing was lost, just run the command again.');
    }
  }

  dispose(): void {
    fs.rmSync(this.root, { recursive: true, force: true });
  }

  private get stateFile(): string {
    return path.join(this.repoDir, STATE_FILE);
  }
}

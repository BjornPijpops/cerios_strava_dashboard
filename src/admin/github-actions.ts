import { git, gitWithInput } from './git';

export interface RepoRef {
  owner: string;
  repo: string;
}

export interface WorkflowStart {
  started: boolean;
  /** Where the admin can see (or manually start) the workflow. */
  actionsUrl: string;
}

export interface WorkflowTriggerDeps {
  /** Returns a GitHub token, or undefined when none is available. */
  getToken: () => string | undefined;
  fetchFn: typeof fetch;
}

/** Reads owner/repo from an https or ssh GitHub remote URL. */
export function parseRepo(remoteUrl: string): RepoRef {
  const match = /github\.com[/:]([^/]+)\/([^/]+?)(?:\.git)?\/?$/.exec(remoteUrl.trim());
  if (!match) throw new Error(`Cannot read the GitHub owner/repo from remote "${remoteUrl}"`);
  return { owner: match[1], repo: match[2] };
}

export const remoteUrlOf = (cwd: string): string => git(cwd, 'remote', 'get-url', 'origin');

/** Uses the login Git already stores for github.com (Git Credential Manager etc.), so no extra token is needed. */
export function tokenFromGitCredentials(cwd: string): string | undefined {
  try {
    const answer = gitWithInput(cwd, 'protocol=https\nhost=github.com\n\n', 'credential', 'fill');
    return /^password=(.+)$/m.exec(answer)?.[1];
  } catch {
    return undefined;
  }
}

/** Starts the publish workflow on `main`. Never throws: the caller tells the admin what to do when `started` is false. */
export async function startPublishWorkflow(remoteUrl: string, deps: WorkflowTriggerDeps): Promise<WorkflowStart> {
  const { owner, repo } = parseRepo(remoteUrl);
  const actionsUrl = `https://github.com/${owner}/${repo}/actions`;
  const token = deps.getToken();
  if (!token) return { started: false, actionsUrl };
  try {
    const res = await deps.fetchFn(`https://api.github.com/repos/${owner}/${repo}/actions/workflows/publish.yml/dispatches`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'strava-dashboard' },
      body: JSON.stringify({ ref: 'main' }),
    });
    return { started: res.status === 204, actionsUrl };
  } catch {
    return { started: false, actionsUrl };
  }
}

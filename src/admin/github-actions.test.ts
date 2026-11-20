import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseRepo, startPublishWorkflow } from './github-actions';

const REMOTE = 'https://github.com/owner/repo.git';

test('reads owner and repo from https and ssh remotes', () => {
  assert.deepEqual(parseRepo(REMOTE), { owner: 'owner', repo: 'repo' });
  assert.deepEqual(parseRepo('git@github.com:a/b'), { owner: 'a', repo: 'b' });
  assert.throws(() => parseRepo('https://example.com/x'), /owner\/repo/);
});

test('starts the workflow with the token and reports success on 204', async () => {
  let call: { url: string; auth: string } | undefined;
  const fetchFn = (async (url: string, init: RequestInit) => {
    call = { url, auth: (init.headers as Record<string, string>).Authorization };
    return new Response(null, { status: 204 });
  }) as unknown as typeof fetch;
  const result = await startPublishWorkflow(REMOTE, { getToken: () => 'tok', fetchFn });
  assert.equal(result.started, true);
  assert.match(call!.url, /repos\/owner\/repo\/actions\/workflows\/publish\.yml\/dispatches$/);
  assert.equal(call!.auth, 'Bearer tok');
});

test('falls back to the manual link without a token, on an API error and on a network error', async () => {
  const status = (code: number) => (async () => new Response(null, { status: code })) as unknown as typeof fetch;
  const offline = (async () => { throw new Error('offline'); }) as unknown as typeof fetch;
  const expectedUrl = 'https://github.com/owner/repo/actions';
  for (const deps of [
    { getToken: () => undefined, fetchFn: status(204) },
    { getToken: () => 'tok', fetchFn: status(403) },
    { getToken: () => 'tok', fetchFn: offline },
  ]) {
    assert.deepEqual(await startPublishWorkflow(REMOTE, deps), { started: false, actionsUrl: expectedUrl });
  }
});

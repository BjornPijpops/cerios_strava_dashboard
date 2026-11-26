/** The page a member lands on after authorizing is expected to fail to load; they copy its address. */
export interface ParsedRedirect {
  code: string;
  /** Comma separated scopes the member actually granted, when present in the URL. */
  scope?: string;
}

export const SCOPE_ALL = 'activity:read_all';
export const SCOPE_PUBLIC = 'activity:read';

/** `all` also sees private activities, `public` only the public ones. */
export type ActivityAccess = 'all' | 'public';

/** Maps a granted scope string to the access it gives; undefined when it grants no activity access. */
export function accessFromScope(scope: string | undefined): ActivityAccess | undefined {
  const granted = (scope ?? '').split(/[,\s]+/);
  if (granted.includes(SCOPE_ALL)) return 'all';
  if (granted.includes(SCOPE_PUBLIC)) return 'public';
  return undefined;
}

/** Extracts the authorization code from the pasted redirect URL. A bare code is accepted too. */
export function parseRedirect(input: string): ParsedRedirect {
  const trimmed = input.trim();
  if (!trimmed.includes('=')) return { code: trimmed };
  try {
    const url = new URL(trimmed);
    const code = url.searchParams.get('code');
    if (!code) throw new Error('missing code');
    return { code, scope: url.searchParams.get('scope') ?? undefined };
  } catch {
    throw new Error('That does not look like the redirect URL. It should look like http://localhost/?state=&code=...&scope=...');
  }
}

export interface MemberInput {
  clientId: string;
  clientSecret: string;
  code: string;
  /** Granted scope as found in the redirect URL; absent when only a bare code was pasted. */
  scope?: string;
}

/** Validates the three values an admin receives from a member, with errors that say what to do next. */
export function validateMemberInput(clientId: string, clientSecret: string, redirectUrl: string): MemberInput {
  const id = clientId.trim();
  const secret = clientSecret.trim();
  if (!/^\d+$/.test(id)) throw new Error('The Client ID must be a number (shown on https://www.strava.com/settings/api).');
  if (!secret) throw new Error('The Client Secret must not be empty.');
  const { code, scope } = parseRedirect(redirectUrl);
  if (scope && !accessFromScope(scope)) {
    throw new Error(`The member granted neither "${SCOPE_ALL}" nor "${SCOPE_PUBLIC}". Ask them to authorize again and keep "View data about your activities" ticked.`);
  }
  return { clientId: id, clientSecret: secret, code, ...(scope ? { scope } : {}) };
}

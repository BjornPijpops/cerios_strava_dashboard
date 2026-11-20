/** The page a member lands on after authorizing is expected to fail to load; they copy its address. */
export interface ParsedRedirect {
  code: string;
  /** Comma separated scopes the member actually granted, when present in the URL. */
  scope?: string;
}

export const REQUIRED_SCOPE = 'activity:read_all';

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
}

/** Validates the three values an admin receives from a member, with errors that say what to do next. */
export function validateMemberInput(clientId: string, clientSecret: string, redirectUrl: string): MemberInput {
  const id = clientId.trim();
  const secret = clientSecret.trim();
  if (!/^\d+$/.test(id)) throw new Error('The Client ID must be a number (shown on https://www.strava.com/settings/api).');
  if (!secret) throw new Error('The Client Secret must not be empty.');
  const { code, scope } = parseRedirect(redirectUrl);
  if (scope && !scope.includes(REQUIRED_SCOPE)) {
    throw new Error(`The member did not grant "${REQUIRED_SCOPE}". Ask them to authorize again and tick "View data about your private activities".`);
  }
  return { clientId: id, clientSecret: secret, code };
}

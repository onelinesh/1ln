/**
 * Pure GitHub OAuth helpers. All network calls take a `fetch` arg so tests can
 * inject a deterministic fake — DO NOT import the global fetch directly.
 *
 * Scope: read:user only. We resolve the numeric GitHub user id, then discard
 * the access token — we never store it. (Data-minimization constraint.)
 */

export type BuildAuthorizeUrlInput = {
  clientId: string;
  redirectUri: string;
  state: string;
};

export function buildAuthorizeUrl(input: BuildAuthorizeUrlInput): string {
  const u = new URL("https://github.com/login/oauth/authorize");
  u.searchParams.set("client_id", input.clientId);
  u.searchParams.set("redirect_uri", input.redirectUri);
  u.searchParams.set("scope", "read:user");
  u.searchParams.set("state", input.state);
  u.searchParams.set("allow_signup", "true");
  return u.toString();
}

export type ExchangeCodeInput = {
  clientId: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
  fetch: typeof fetch;
};

export async function exchangeCode(input: ExchangeCodeInput): Promise<string> {
  const body = new URLSearchParams({
    client_id: input.clientId,
    client_secret: input.clientSecret,
    code: input.code,
    redirect_uri: input.redirectUri,
  }).toString();
  const res = await input.fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/x-www-form-urlencoded",
      "user-agent": "1ln.sh",
    },
    body,
  });
  if (res.status !== 200) {
    throw new Error(`github exchange failed: ${res.status}`);
  }
  const json: any = await res.json();
  if (json.error) {
    throw new Error(`github exchange error: ${json.error}`);
  }
  if (typeof json.access_token !== "string") {
    throw new Error("github exchange: missing access_token");
  }
  return json.access_token;
}

export type FetchGithubUserIdInput = {
  accessToken: string;
  fetch: typeof fetch;
};

export async function fetchGithubUserId(
  input: FetchGithubUserIdInput
): Promise<string> {
  const res = await input.fetch("https://api.github.com/user", {
    headers: {
      authorization: `Bearer ${input.accessToken}`,
      accept: "application/vnd.github+json",
      "user-agent": "1ln.sh",
    },
  });
  if (res.status !== 200) {
    throw new Error(`github /user failed: ${res.status}`);
  }
  const json: any = await res.json();
  if (typeof json.id !== "number") {
    throw new Error("github /user: no id in response");
  }
  return String(json.id);
}

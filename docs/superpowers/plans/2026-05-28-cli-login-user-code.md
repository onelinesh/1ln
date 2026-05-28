# Device-flow user-code confirmation for `1ln login`

**Status:** Spec / not yet planned in detail. Follow-up to Plan 2 (`2026-05-28-github-auth-cli-ownership.md`).

**Why now:** Plan 2 ships a CLI login flow (init → browser GitHub OAuth → CLI poll) where the only binding between "CLI that initiated the session" and "user who completed GitHub auth" is the `session_id`. An attacker can:

1. Run `1ln login` on their machine and capture `session_id` from the printed URL.
2. Send the victim a phishing link `https://1ln.sh/auth/cli/login?session=<attacker_session>`.
3. Victim authenticates with their own GitHub.
4. Worker mints a token bound to the **victim's** GitHub id, stashed under the **attacker's** session.
5. Attacker's CLI polls and receives a bearer token authorized as the victim — can read/edit/delete the victim's owned scripts, and (worst case) edit a victim-owned script that the victim later `curl | sh`'s on their servers.

This is a known weakness of OAuth flows that don't include a user-mediated confirmation step. The standard mitigation is **RFC 8628 OAuth 2.0 Device Authorization Grant**, adapted: we don't need real RFC 8628 (which is GitHub-app-side) — we implement an equivalent confirmation step inside our own Worker callback.

## Goal

The user must visually confirm in the browser that the code shown there matches the code printed in their terminal **before** the API token is minted and exposed via `/auth/cli/poll`.

## Sketch

### Worker

- **`POST /auth/cli/init`** — change response to include a short, human-readable `user_code` (e.g. `4 chars - 4 chars`, base32 or word-list). Store the user_code in the session: `{status: "pending", user_code}`. Don't expose the user_code via `/auth/cli/poll`.
- **`GET /auth/cli/login?session=…`** — unchanged (still 302s to GitHub OAuth authorize).
- **`GET /auth/github/callback?code=…&state=…`** — change so that on successful GitHub exchange + user-id resolution, the handler does NOT immediately mint the API token. Instead, it stashes `{status: "awaiting_confirm", user_code, github_id}` and renders a **confirmation page** that displays the `user_code` and a single button: "Yes, this matches my terminal." The button POSTs to `/auth/cli/confirm?session=…`.
- **`POST /auth/cli/confirm?session=…`** — only valid when the session status is `awaiting_confirm`. Mints the API token via `createApiToken` and updates the session to `{status: "complete", token}`. Renders the existing "you can close this window" success page.
- **`GET /auth/cli/poll?session=…`** — unchanged. Returns `complete` only after `/confirm` has run.

The confirmation page is a stateful checkpoint: the GitHub OAuth `state`-vs-session binding is preserved, but the **token mint** is gated on a click from a user who has seen the user_code from their own terminal. The attacker can't see the victim's terminal, so they can't satisfy this check.

### CLI

- `1ln login` prints the `user_code` from the init response and instructs the user: "Open the URL below in your browser. After authenticating with GitHub, verify that the code shown is: **XXXX-XXXX**, then click confirm."
- Polling logic unchanged.

### Session states

```
pending  →  (callback succeeds)  →  awaiting_confirm  →  (POST /confirm)  →  complete
                                       │
                                       └→  (session expires)  →  KV TTL eviction
```

## Test plan

- `init` returns `user_code` of the expected shape.
- `callback` does not mint a token when invoked successfully — it transitions to `awaiting_confirm` and renders a page that contains the user_code.
- `poll` still returns `pending` when status is `awaiting_confirm`.
- `confirm` mints the token only when status is `awaiting_confirm`; 409 / 400 otherwise.
- The success-only confirm transitions the session to `complete` and `poll` returns the token.
- E2E: full attack scenario — attacker's session_id is used in callback. Even after GitHub auth succeeds, polling stays `pending` until confirm fires. The attacker has no way to fire confirm without victim interaction.

## Out of scope

- Real RFC 8628 device flow with GitHub. GitHub's device flow targets device clients without browsers, not our use case.
- WebAuthn / passkey-bound confirmations. Overkill for this attack model.

## Estimate

~6–8 implementation tasks, similar shape to Plan 2 Tasks 6–8. Plan to be written in detail before execution.

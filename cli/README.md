# 1ln CLI

Publish shell scripts to [1ln.sh](https://1ln.sh) and get a `curl 1ln.sh/<slug> | sh` one-liner.

## Install

```sh
curl 1ln.sh/install | sh
```

Pin a specific version:

```sh
ONELN_VERSION=v0.1.0 curl 1ln.sh/install | sh
```

Or build from source:

```sh
go install github.com/onelinesh/1ln/cli@latest
# binary lands in $(go env GOPATH)/bin, rename to `1ln` if needed
```

## Usage

```
1ln push [--public] [--expires DURATION] [--name NAME] [<file>]
1ln ls
1ln rm <slug>
1ln version
```

### Push

```sh
1ln push deploy.sh                          # private (22-char slug), no TTL
1ln push --public install.sh                # public 4-6 char slug
1ln push --expires 1run rotate-secret.sh    # single-use URL
echo "echo hi" | 1ln push                   # stdin
```

`push` prints exactly one line — the one-liner you paste on the target server — and caches `{slug, delete_token}` in `~/.config/1ln/tokens.json` so you can `rm` it later.

### List and remove

```sh
1ln ls
1ln rm abc
```

`ls` only shows scripts pushed from **this machine** (until Plan 2 ships OAuth + dashboard). `rm` requires the cached delete token, so it works for any script you pushed from here.

## Logged-in usage

`1ln` works anonymously by default — `1ln push` gets a 7-day-TTL URL with a
local delete token. To attach scripts to your GitHub account (no TTL, larger
size cap, manageable from any machine), run:

```sh
1ln login
```

This opens a browser to authenticate with GitHub. After login:

```sh
1ln ls                  # list YOUR scripts (server-authoritative)
1ln push file.sh        # owner-attached, never expires
1ln edit <slug>         # opens $EDITOR (private scripts only)
1ln rename <slug> <new-name>
1ln rm <slug>           # bearer ownership — no delete token needed
1ln logout              # revoke the token
```

We store only your numeric GitHub user id. No email, no username, no avatar.

### Known limitation: don't click unsolicited login URLs

The login flow currently has no out-of-band binding between the CLI that started a session and the GitHub user who completes it. If someone sends you a `https://1ln.sh/auth/cli/login?session=…` URL that **you did not generate yourself**, do **not** open it — completing GitHub auth would mint a token authorized as you into the sender's terminal session.

The safe pattern is: run `1ln login` in your own terminal, then click the URL it prints. A device-flow user-code confirmation step is planned to close this gap (see [`docs/superpowers/plans/2026-05-28-cli-login-user-code.md`](../docs/superpowers/plans/2026-05-28-cli-login-user-code.md)).

## Environment

| Variable | Default | Purpose |
| --- | --- | --- |
| `ONELN_BASE_URL` | `https://1ln.sh` | Target a different deployment (e.g. local `wrangler dev`). |
| `ONELN_STORE` | `$XDG_CONFIG_HOME/1ln/tokens.json` | Override the local delete-token cache. |
| `ONELN_VERSION` | (pinned in installer) | Force a specific release on `curl 1ln.sh/install`. |

## Cutting a release

1. Bump anything internal you need.
2. Tag: `git tag cli-v0.1.0 && git push origin cli-v0.1.0`.
3. GitHub Actions builds darwin/linux × amd64/arm64 binaries and attaches them to the release.
4. Update `LATEST_TAG` in `src/views/install.ts` and deploy the Worker so `curl 1ln.sh/install | sh` picks up the new pinned default.

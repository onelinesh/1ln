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
go install github.com/YairEtzion/1ln/cli@latest
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

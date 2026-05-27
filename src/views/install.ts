export const LATEST_TAG = "cli-v0.1.0";

const TEMPLATE = `#!/bin/sh
# 1ln CLI installer — https://1ln.sh
# Pin a specific version with: ONELN_VERSION=v0.1.0 curl 1ln.sh/install | sh
set -eu

RAW="\${ONELN_VERSION:-__LATEST_TAG__}"
case "$RAW" in
  cli-*) TAG="$RAW" ;;
  *) TAG="cli-$RAW" ;;
esac
VERSION="\${TAG#cli-}"

case "$(uname -s)" in
  Darwin) OS=darwin ;;
  Linux)  OS=linux ;;
  *) echo "unsupported OS: $(uname -s)" >&2; exit 1 ;;
esac

case "$(uname -m)" in
  x86_64|amd64) ARCH=amd64 ;;
  arm64|aarch64) ARCH=arm64 ;;
  *) echo "unsupported arch: $(uname -m)" >&2; exit 1 ;;
esac

PREFIX="\${PREFIX:-/usr/local}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

URL="https://github.com/onelinesh/1ln/releases/download/$TAG/1ln-$OS-$ARCH.tar.gz"
echo "downloading 1ln $VERSION for $OS/$ARCH"
curl -fsSL "$URL" -o "$TMP/1ln.tar.gz"
tar -xzf "$TMP/1ln.tar.gz" -C "$TMP"

DEST="$PREFIX/bin/1ln"
if [ -w "$PREFIX/bin" ]; then
  mv "$TMP/1ln" "$DEST"
else
  echo "$PREFIX/bin is not writable — using sudo"
  sudo mv "$TMP/1ln" "$DEST"
fi
chmod +x "$DEST"
echo "installed: $($DEST version)"
`;

export function renderInstall(): string {
  return TEMPLATE.replace("__LATEST_TAG__", LATEST_TAG);
}

#!/usr/bin/env bash
set -euo pipefail

BASE_DIR="${1:-/tmp/ctf-web-cli/sessions}"

if [[ "$BASE_DIR" != /tmp/ctf-web-cli/sessions* ]]; then
  echo "Refusing to clean unexpected path: $BASE_DIR" >&2
  exit 1
fi

mkdir -p "$BASE_DIR"
find "$BASE_DIR" -mindepth 1 -maxdepth 1 -type d -mmin +360 -print -exec rm -rf -- {} +

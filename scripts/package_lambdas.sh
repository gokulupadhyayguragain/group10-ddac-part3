#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="$ROOT_DIR/build/lambdas"

rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR"

package_lambda() {
  local name="$1"
  local src="$ROOT_DIR/lambdas/$name"
  local out="$OUT_DIR/$name.zip"

  echo "Packaging $name..."
  cd "$src"
  if [ -d node_modules ]; then
    rm -rf node_modules 2>/dev/null || {
      if command -v docker >/dev/null 2>&1; then
        docker run --rm -v "$src:/work" alpine sh -lc 'rm -rf /work/node_modules'
      elif command -v sudo >/dev/null 2>&1; then
        sudo rm -rf node_modules
      else
        echo "Cannot remove $src/node_modules. Fix ownership, then rerun." >&2
        exit 1
      fi
    }
  fi
  if command -v npm >/dev/null 2>&1; then
    if [ -f package-lock.json ]; then
      npm ci --omit=dev
    else
      npm install --omit=dev
    fi
  elif command -v docker >/dev/null 2>&1; then
    docker run --rm \
      -u "$(id -u):$(id -g)" \
      -e npm_config_cache=/tmp/.npm \
      -v "$src:/work" \
      -w /work \
      node:20-alpine \
      sh -lc 'if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi'
  else
    echo "npm or docker is required to install Lambda dependencies." >&2
    exit 1
  fi

  local files=(index.mjs package.json node_modules)
  if [ -f package-lock.json ]; then
    files+=(package-lock.json)
  fi

  python3 - "$out" "${files[@]}" <<'PY'
import os
import sys
import zipfile

out = sys.argv[1]
paths = sys.argv[2:]

with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as archive:
    for path in paths:
        if os.path.isdir(path):
            for root, _, files in os.walk(path):
                for name in files:
                    full = os.path.join(root, name)
                    archive.write(full, os.path.relpath(full, "."))
        elif os.path.exists(path):
            archive.write(path, path)
PY
  echo "Created $out"
}

package_lambda "alert-dispatcher"
package_lambda "serverless-api"

if [ "${INCLUDE_LEGACY_INGEST:-false}" = "true" ]; then
  package_lambda "sighting-ingest"
fi

echo "Lambda packages ready in $OUT_DIR"

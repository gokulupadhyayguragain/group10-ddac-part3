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
  if [ -f package-lock.json ]; then
    npm ci --omit=dev
  else
    npm install --omit=dev
  fi

  local files=(index.mjs package.json node_modules)
  if [ -f package-lock.json ]; then
    files+=(package-lock.json)
  fi

  zip -qr "$out" "${files[@]}"
  echo "Created $out"
}

package_lambda "sighting-ingest"
package_lambda "alert-dispatcher"

echo "Lambda packages ready in $OUT_DIR"

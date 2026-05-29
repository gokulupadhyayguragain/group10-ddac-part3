#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FRONTEND_DIR="$ROOT_DIR/frontend_next"
BUCKET="${1:-}"

cd "$FRONTEND_DIR"
if command -v npm >/dev/null 2>&1; then
  npm ci
  npm run build:serverless
elif command -v docker >/dev/null 2>&1; then
  docker run --rm \
    -u "$(id -u):$(id -g)" \
    -e npm_config_cache=/tmp/.npm \
    -e NEXT_PUBLIC_API_BASE_URL="${NEXT_PUBLIC_API_BASE_URL:-}" \
    -e SAFETRACE_STATIC_EXPORT=true \
    -v "$FRONTEND_DIR:/work" \
    -w /work \
    node:20-alpine \
    sh -lc 'npm ci && npm run build:serverless'
else
  echo "npm or docker is required to build the frontend." >&2
  exit 1
fi

echo "Static frontend exported to $FRONTEND_DIR/out"

if [ -n "$BUCKET" ]; then
  aws s3 sync "$FRONTEND_DIR/out/" "s3://$BUCKET/" --delete --region "${AWS_REGION:-us-east-1}"
  echo "Uploaded static frontend to s3://$BUCKET"
fi

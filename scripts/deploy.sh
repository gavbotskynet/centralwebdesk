#!/bin/bash
# Deploy centralwebdesk to Cloudflare Pages
# Usage: ./scripts/deploy.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Load env vars if .env exists
if [ -f "$PROJECT_DIR/.env" ]; then
  export $(grep -v '^#' "$PROJECT_DIR/.env" | xargs)
fi

cd "$PROJECT_DIR"

# Build ID is set by vite.config.ts via git rev-parse
echo "Building..."
npm run build

echo "Deploying..."
npx wrangler pages deploy .svelte-kit/cloudflare \
  --project-name=centralwebdesk \
  --branch=main \
  --commit-hash="$BUILD_ID"

echo "Done!"

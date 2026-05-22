#!/usr/bin/env bash
# One-command Fly.io deploy.
# Usage:  scripts/deploy-fly.sh [app-name]
#
# Idempotent: creates the Fly app on first run, deploys on subsequent runs.
set -euo pipefail

APP_NAME="${1:-blackout-protocol}"

if ! command -v flyctl >/dev/null 2>&1; then
  echo "✗ flyctl is not installed."
  echo "  Install:  curl -L https://fly.io/install.sh | sh"
  echo "  Then:     fly auth signup    (or 'fly auth login')"
  exit 1
fi

if ! flyctl auth whoami >/dev/null 2>&1; then
  echo "✗ Not logged in to Fly. Run:  flyctl auth login"
  exit 1
fi

cd "$(dirname "$0")/.."

# Create the app if it doesn't exist yet.
if ! flyctl apps list 2>/dev/null | grep -q "^${APP_NAME}\b"; then
  echo "→ Creating Fly app: ${APP_NAME}"
  flyctl apps create "${APP_NAME}"
fi

# Patch fly.toml to use the chosen app name in case the caller overrode it.
sed -i.bak "s/^app = .*/app = \"${APP_NAME}\"/" fly.toml && rm -f fly.toml.bak

echo "→ Deploying ${APP_NAME}..."
flyctl deploy --remote-only

echo ""
echo "✓ Deployed."
echo ""
HOST="$(flyctl status --app "${APP_NAME}" -j 2>/dev/null | grep -oE '"Hostname"\s*:\s*"[^"]+' | head -1 | sed 's/.*"//')"
HOST="${HOST:-${APP_NAME}.fly.dev}"
echo "  Server URL: https://${HOST}"
echo "  WebSocket : wss://${HOST}"
echo ""
echo "Next: bake this URL into your client:"
echo "  echo \"VITE_SERVER_URL=wss://${HOST}\" > client/.env.local"
echo "  npm run build:client && (cd client && npm run cap:sync)"

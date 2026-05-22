#!/usr/bin/env bash
# Write client/.env.local with your Mac's LAN IP so phones can reach the game server.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${ROOT}/client/.env.local"

pick_ip() {
  local ip=""
  for iface in en0 en1 bridge0; do
    ip="$(ipconfig getifaddr "$iface" 2>/dev/null || true)"
    if [[ -n "$ip" ]]; then
      echo "$ip"
      return 0
    fi
  done
  # Linux fallback
  ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
  if [[ -n "$ip" ]]; then
    echo "$ip"
    return 0
  fi
  return 1
}

IP="$(pick_ip || true)"
if [[ -z "$IP" ]]; then
  echo "✗ Could not detect LAN IP. Set it manually:"
  echo "  echo 'VITE_SERVER_URL=ws://YOUR_IP:2567' > client/.env.local"
  exit 1
fi

cat > "$OUT" <<EOF
# Auto-generated for local device testing (same Wi‑Fi as this machine).
# Re-run: npm run mobile:env
VITE_SERVER_URL=ws://${IP}:2567
EOF

echo "✓ Wrote ${OUT}"
echo "  VITE_SERVER_URL=ws://${IP}:2567"
echo ""
echo "Next:"
echo "  1. npm run dev:server          # or: npm run dev"
echo "  2. npm run mobile:build        # rebuild client + cap sync"
echo "  3. npm run mobile:open:android # or mobile:open:ios"

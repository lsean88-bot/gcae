#!/usr/bin/env bash
# Starts Meridian on this laptop only: http://127.0.0.1:3000 (not reachable from other computers).
set -euo pipefail
APP="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP"
[ -f .env ] || { echo "No .env found. Run ./laptop/setup.sh first." >&2; exit 1; }
[ -f .next/BUILD_ID ] || { echo "The app is not built. Run ./laptop/setup.sh first." >&2; exit 1; }
# Bind to this machine only: both -H and HOSTNAME, since "next start" listens on all interfaces by default.
export HOSTNAME=127.0.0.1 PORT=3000
echo "Meridian is starting at http://127.0.0.1:3000  (press Ctrl+C to stop)"
exec npm run start -- -H 127.0.0.1 -p 3000

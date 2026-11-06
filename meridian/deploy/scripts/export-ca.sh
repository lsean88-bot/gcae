#!/usr/bin/env bash
# Export Caddy's root CA for staff devices and print its SHA-256 fingerprint for verification.
set -euo pipefail
cd "$(dirname "$0")/.."
OUT="meridian-root-ca.crt"
docker compose --env-file .env cp caddy:/data/caddy/pki/authorities/local/root.crt "$OUT"
echo "Exported deploy/$OUT"
openssl x509 -in "$OUT" -noout -subject -enddate -fingerprint -sha256
echo "Give staff the file AND this fingerprint through a separate channel. They must compare before installing."
echo "Send only the .crt (public certificate). Never copy root.key."

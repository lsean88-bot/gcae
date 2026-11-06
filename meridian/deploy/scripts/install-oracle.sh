#!/usr/bin/env bash
# Idempotent host prep for Ubuntu (arm64 or amd64): Docker Engine + compose plugin, swap, notes. Run with sudo.
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "Run with sudo"; exit 1; }
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y ca-certificates curl gnupg gpg git
if ! command -v docker >/dev/null || ! docker compose version >/dev/null 2>&1; then
  install -m 0755 -d /etc/apt/keyrings
  [ -f /etc/apt/keyrings/docker.asc ] || curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" > /etc/apt/sources.list.d/docker.list
  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
systemctl enable --now docker
if [ -n "${SUDO_USER:-}" ]; then usermod -aG docker "$SUDO_USER" && echo "User $SUDO_USER added to docker group (log out and in again)."; fi
if ! swapon --show | grep -q .; then
  [ -f /swapfile ] || { fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile; }
  swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi
cat <<'N'

Network notes:
- No inbound port besides SSH (22) is needed: Cloudflare Tunnel connects outbound. Do NOT add Oracle security-list rules for 80/443/3000/5432.
- Docker publishes app only on 127.0.0.1:3000 and Postgres on no port. Docker edits iptables itself, so ufw rules do not restrict published ports; the safe control is to never publish ports on 0.0.0.0.
- (UNVERIFIED) Oracle Ubuntu images are reported to ship iptables rules allowing SSH only; check with `sudo iptables -L INPUT` and leave them as is.
Idle reclamation (UNVERIFIED, verify on Oracle docs): Oracle may reclaim Always Free instances idle for 7 days (95th-percentile CPU below 20%). Upgrading to Pay-As-You-Go is reported to remove this while staying within Always Free limits. This script does not generate artificial load.
N

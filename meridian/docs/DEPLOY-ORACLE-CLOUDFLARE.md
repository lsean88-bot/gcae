# Deploy Meridian on Oracle Cloud Free + Cloudflare (free tier)

Target: one small Oracle VM running Meridian and PostgreSQL in Docker. Cloudflare Tunnel connects the VM outward (no open ports) and Cloudflare Access asks each person for an emailed one-time code. Fallback: an office PC running the same stack (skip Part 1-2, do Part 3 onward on the PC; install Docker Desktop or Docker Engine yourself).

Third-party screens change often. Every click path below for Oracle and Cloudflare is from general knowledge, not verified against today's screens: **screens may differ**. Free-tier limits and prices must be confirmed on the vendors' own pages before you rely on them.

## Decisions for the GCAE and DPO before you start
- **Data location.** Meridian holds audit working data. Choosing the Oracle region is a data-residency decision for the DPO. Singapore (ap-singapore-1) is the closest to Malaysia; Cloudflare also processes traffic globally. The home region cannot be changed after sign-up.
- **Free allowance.** Ampere A1 allowance was 4 OCPU / 24 GB; it may now be 2 OCPU / 12 GB. Verify on Oracle's Always Free page.
- **Idle reclamation (unverified, verify on Oracle docs).** Oracle may reclaim Always Free instances that stay idle (reported: 95th-percentile CPU under 20% over 7 days). Upgrading the account to Pay-As-You-Go is reported to remove this while staying free within Always Free limits, but it needs a card. This package does not burn CPU to avoid it. Keep off-box backups so a reclaimed VM is recoverable.

## Part 1. Oracle account and VM
1. Go to oracle.com/cloud/free and click **Start for free**. Use a company email, choose the home region (see above), complete card verification (a verification hold, not a charge).
2. In the console open **Compute > Instances > Create instance**.
3. Image: **Canonical Ubuntu 24.04**. Shape: **Change shape > Ampere > VM.Standard.A1.Flex**, 2 OCPU, 12 GB (or the maximum your account shows).
4. Networking: keep the default public IP. Add SSH keys: choose **Generate a key pair** and download the private key; keep it safe.
5. Click **Create**. If you see "Out of capacity", retry later (hours or days) or use the office PC fallback. Do not use VM.Standard.E2.1.Micro: 1 GB RAM is too small to build the image.
6. Do not open any extra ports in the security list. Only SSH (22) is needed.

## Part 2. Connect and install
1. From your PC: `ssh -i <downloaded-key> ubuntu@<public-ip>`
2. `git clone <your repo URL> && cd <repo>/meridian/deploy`
3. `sudo ./scripts/install-oracle.sh` (installs Docker, adds 4 GB swap if none). Log out and back in so the docker group applies.

## Part 3. Configure
1. `cp .env.example .env && chmod 600 .env`
2. Fill every blank using the generation commands in the file (`openssl rand -base64 48` for APP_SECRET and BACKUP_PASSPHRASE). Save BACKUP_PASSPHRASE and APP_SECRET in a password manager off the server.
3. Leave TUNNEL_TOKEN for Part 4.

## Part 4. Cloudflare Tunnel and Access
1. Create a free Cloudflare account; open **Zero Trust** (choose the Free plan; a card may be requested).
2. **Networks > Tunnels > Create a tunnel > Cloudflared**. Name it `meridian`. On the install screen copy only the **token** (the long string after `--token`) into `TUNNEL_TOKEN` in `.env`.
3. **Public hostname**: needs a domain on your Cloudflare account (a domain is not free; if you have none, ask IT to add a subdomain). Service type **HTTP**, URL `app:3000`.
4. **Access > Applications > Add an application > Self-hosted**. Set the hostname from step 3. Add a policy: Action **Allow**, include **Emails** and list each named person. Login method: **One-time PIN**.
5. Test later from a private browser window: only listed emails should receive a code.

## Part 5. Start
```
docker compose --env-file .env build
docker compose --env-file .env up -d db
docker compose --env-file .env --profile setup run --rm migrate
docker compose --env-file .env --profile setup run --rm migrate npm run setup:passwords
docker compose --env-file .env up -d
curl -s http://127.0.0.1:3000/api/health      # expect {"ok":true}
```
`setup:passwords` prints initial passwords once; record them securely. Open your hostname, pass the Access code screen, sign in, open **UAT evidence** and click **Run UAT again** (expect 32 passed, 0 failed). Or: `docker compose --env-file .env --profile setup run --rm migrate npm run uat`.

## Part 6. Backups and restore test
1. Run once: `./scripts/backup-now.sh` (writes encrypted file into `deploy/backups/`, keeps 14).
2. Nightly: `crontab -e` and add `15 2 * * * /home/ubuntu/<repo>/meridian/deploy/scripts/backup-now.sh >> /home/ubuntu/backup.log 2>&1`.
3. Off-box copy: set `RCLONE_REMOTE` after configuring rclone (`rclone config`), or copy the backups folder to another machine regularly. A backup that exists only on the VM is lost with the VM.
4. Test a restore now: `./scripts/restore.sh backups/<file>.sql.gz.gpg` restores into a separate database `meridian_restore`, never over the live one. Check with `docker compose --env-file .env exec db psql -U meridian_app -d meridian_restore -c '\dt'`.

## Updates
`./scripts/update.sh` (backs up, pulls, rebuilds, migrates, restarts, health-checks, runs UAT).

## Troubleshooting
| Symptom | Likely cause / action |
|---|---|
| Compose says "set APP_SECRET / TUNNEL_TOKEN" | Blank value in `deploy/.env`. |
| `permission denied` on docker | Log out and in after install, or prefix `sudo`. |
| Build killed / out of memory | Check `free -h` (swap present?). Use the A1 shape, not E2.1.Micro. |
| Out of capacity creating VM | Retry later, other availability domain, or office PC. |
| Site shows Cloudflare 502/1033 | `docker compose logs cloudflared app`; confirm hostname service is `http://app:3000`, token correct. |
| Everyone blocked at login code | Email not in the Access policy; check spam. |
| Health returns `{"ok":false}` | Database not ready or password mismatch; `docker compose logs db`. If you changed POSTGRES_PASSWORD after first start, the volume keeps the old one. |
| Restore: bad decrypt | Wrong BACKUP_PASSPHRASE. |
| Instance stopped/reclaimed | See idle reclamation above; restore from off-box backup on a new VM. |

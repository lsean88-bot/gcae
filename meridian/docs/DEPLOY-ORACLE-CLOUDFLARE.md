# Deploy Meridian on Oracle Cloud Free + Cloudflare (free tier)

**No domain needed. Cost: $0.** One small Oracle VM runs Meridian and PostgreSQL in Docker. Cloudflare Tunnel connects the VM outward (no open ports) as a **private network**: there is no public website. Staff install the Cloudflare WARP app, log in with an emailed code (only named emails allowed), and open `https://172.30.0.10`. Caddy provides HTTPS using its own internal certificate authority, which staff devices must trust. Fallback: an office PC running the same stack (skip Part 1-2, do Part 3 onward on the PC; install Docker Desktop or Docker Engine yourself).

Third-party screens change often. Every click path below for Oracle and Cloudflare is from general knowledge, not verified against today's screens: **screens may differ**. Free-tier limits and prices must be confirmed on the vendors' own pages before you rely on them.

## Decisions for the GCAE and DPO before you start
- **Data location.** Meridian holds audit working data. Choosing the Oracle region is a data-residency decision for the DPO. Singapore (ap-singapore-1) is the closest to Malaysia; Cloudflare also processes traffic globally. The home region cannot be changed after sign-up.
- **Free allowance.** Ampere A1 allowance was 4 OCPU / 24 GB; it may now be 2 OCPU / 12 GB. Verify on Oracle's Always Free page.
- **No free-for-life guarantee.** No provider (Oracle, Cloudflare) guarantees these free tiers will last. Exit plan: run the same compose stack on an office PC; cloudflared works the same there. Keep off-box backups.
- **Zero Trust seats.** The Cloudflare Zero Trust free plan is reportedly limited to 50 users (third-party sources; verify on Cloudflare's pricing page).
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

## Part 4. Cloudflare private network (screens may differ throughout)
1. Create a free Cloudflare account. Open **Zero Trust**, choose a **team name** (it becomes `<team>.cloudflareaccess.com`), pick the Free plan (a card may be requested).
2. **Networks > Tunnels > Create a tunnel > Cloudflared**, name it `meridian`. Copy only the **token** into `TUNNEL_TOKEN` in `.env`. Skip the "install connector" commands; Docker runs it.
3. In the tunnel, open the **Private networks** (CIDR) tab and **add `172.30.0.0/24`** (or your MERIDIAN_SUBNET). Do **not** add a public hostname.
4. **Settings > WARP Client > Device enrollment permissions > Manage**: add a rule, Action **Allow**, include **Emails** listing each named person. Under **Login methods** enable **One-time PIN**. Anyone not listed cannot enrol.
5. **Settings > WARP Client > Device settings > (default profile) > Split Tunnels**. The default is **Exclude** mode, which excludes `172.16.0.0/12` (this covers 172.30.x). **Delete that entry**, or switch to **Include** mode and add `172.30.0.0/24`. Otherwise traffic never reaches the tunnel.
6. If Cloudflare shows a setting **Gateway proxy / TCP** (and UDP) under network settings, turn it on. Verify on Cloudflare docs whether it is required for private-network routing.

## Part 5. Start the stack
```
docker compose --env-file .env build
docker compose --env-file .env up -d db
docker compose --env-file .env --profile setup run --rm migrate
docker compose --env-file .env --profile setup run --rm migrate npm run setup:passwords
docker compose --env-file .env up -d
curl -s http://127.0.0.1:3000/api/health      # expect {"ok":true}
./scripts/export-ca.sh                        # writes meridian-root-ca.crt and prints its SHA-256 fingerprint
```
`setup:passwords` prints initial passwords once; record them securely. Send staff `deploy/meridian-root-ca.crt` and, by a **different channel** (phone, chat), the fingerprint. Never send `root.key`.

## Part 5b. Staff steps (each person)
1. Install **Cloudflare WARP** (1.1.1.1 app) for Windows, Mac, iOS or Android from Cloudflare's official download page.
2. WARP settings > **Login to Cloudflare Zero Trust** > enter the team name > enter your email > type the code emailed to you. Only listed emails work.
3. Check the certificate fingerprint matches what the GCAE gave you, then trust the certificate:
   - Windows: double-click the .crt > Install Certificate > Local Machine (or Current User) > place in **Trusted Root Certification Authorities**.  Before installing, check the fingerprint: open Command Prompt and run `certutil -hashfile meridian-root-ca.crt SHA256`; it must match the SHA-256 value the GCAE gives you (ignore spaces and colons). If it differs, do not install.
   - Mac: double-click > Keychain Access > open the certificate > Trust > **Always Trust**. Check: `openssl x509 -in meridian-root-ca.crt -noout -fingerprint -sha256`.
   - iOS: open the file > Settings > Profile Downloaded > Install; then Settings > General > About > Certificate Trust Settings > enable full trust.
   - Android: Settings > Security > Encryption and credentials > Install a certificate > CA certificate (path varies by phone).
   - Firefox keeps its own store; import there too (Settings > Certificates > Authorities) or enable system roots.
4. With WARP connected, open `https://172.30.0.10`, sign in, open **UAT evidence** and click **Run UAT again** (expect 55 passed, 0 failed). Or from the server: `docker compose --env-file .env --profile setup run --rm migrate npm run uat`.

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
| Page does not load at https://172.30.0.10 | WARP not connected; Split Tunnels still excludes 172.16.0.0/12; route CIDR not added to tunnel; `docker compose logs cloudflared caddy`. |
| Browser says certificate not trusted | Root CA not installed/trusted on that device (or Firefox store). |
| Cannot enrol in WARP | Email not in the enrollment rule; check spam for the code. |
| Subnet clashes with office/home network | Change MERIDIAN_SUBNET and MERIDIAN_IP in `.env`, the tunnel route and split tunnels, then `docker compose down && up -d`. |
| Health returns `{"ok":false}` | Database not ready or password mismatch; `docker compose logs db`. If you changed POSTGRES_PASSWORD after first start, the volume keeps the old one. |
| Restore: bad decrypt | Wrong BACKUP_PASSPHRASE. |
| Instance stopped/reclaimed | See idle reclamation above; restore from off-box backup on a new VM. |

## Appendix. If you later have a domain
You can instead publish the app through the tunnel as a **public hostname** (service `http://app:3000`, bypassing Caddy) and protect it with a **Cloudflare Access** self-hosted application (email one-time PIN, named emails). This removes the need for WARP and a private CA on staff devices.


## Notes on this design
- Client IP addresses are not visible to Meridian (all traffic arrives through the tunnel), so `TRUST_PROXY` is 0 and only the per-role sign-in lock applies. Who connected is recorded in Cloudflare Zero Trust logs.
- `backup-now.sh` also saves the Caddy certificate authority (encrypted). To restore it after a rebuild, before first start: `docker volume create meridian_caddy_data`, then decrypt the latest `caddy-ca-*.tar.gz.gpg` and extract it into that volume, for example: `gpg -d FILE | docker run --rm -i -v meridian_caddy_data:/data alpine:3 tar -xzf - -C /data`.

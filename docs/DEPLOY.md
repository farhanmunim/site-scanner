# Deploying on Coolify (behind Cloudflare)

The whole stack runs from one `docker-compose.yml`: `web` (SvelteKit), `worker` (scanner +
Chromium), `postgres`, `redis`. Only `web` is exposed; Cloudflare proxies it and the VPS firewall
accepts web traffic from Cloudflare only.

## 1. Cloudflare

1. Add the hostname (e.g. `scanner.example.com`) as a **proxied** (orange cloud) DNS record pointing at the VPS.
2. SSL/TLS mode: **Full (strict)** (Coolify issues a Let's Encrypt cert on the origin).
3. **Turnstile** (free): create a widget for the hostname → note the *site key* and *secret key*.
4. Optional but recommended, Security → WAF → rate-limiting rule: 30 requests / minute on `/api/scans` and `/` POSTs.
5. Optional: Zero Trust → Access application for `scanner.example.com/admin*` restricted to your email. The app has its own login too; Access adds a second gate.

## 2. VPS firewall (do this — it's what makes "behind Cloudflare" true)

Allow 80/443 **only from Cloudflare's published ranges** so nobody can bypass the proxy and hit the origin directly. With `ufw`:

```bash
for ip in $(curl -s https://www.cloudflare.com/ips-v4) $(curl -s https://www.cloudflare.com/ips-v6); do
  sudo ufw allow proto tcp from "$ip" to any port 80,443 comment cloudflare
done
sudo ufw deny 80/tcp && sudo ufw deny 443/tcp   # default-deny for everyone else (rules above are more specific)
```

Keep the Coolify dashboard (port 8000) closed to the internet (VPN/Tailscale or SSH tunnel only). Postgres and Redis are never published.

Because only Cloudflare can reach the origin, the app trusts `CF-Connecting-IP` for rate limiting (`BEHIND_CLOUDFLARE=true`). If you ever remove the firewall rule, set it to `false`.

## 3. Coolify

1. **Projects → New resource → Docker Compose** (from this Git repository, branch `main`).
2. Set the domain on the `web` service: `https://scanner.example.com` → port `3000`.
3. Environment variables — copy from `.env.example`. Generate secrets:

   ```bash
   openssl rand -hex 32      # SESSION_SECRET
   openssl rand -hex 32      # IP_HASH_SALT
   openssl rand -hex 24      # POSTGRES_PASSWORD
   node scripts/hash-password.mjs 'your long admin password' --totp   # ADMIN_PASSWORD_HASH + ADMIN_TOTP_SECRET
   ```

   Set `OWN_HOSTS=scanner.example.com` and `OWN_IPS=<VPS public IPv4>,<IPv6>` so the scanner can never be pointed at itself or at other services on the same box.
4. Deploy. The worker applies database migrations on start.
5. Open `/health` (expects `{"status":"ok"}`) and `/admin/health` (worker heartbeat present).

### Resources

Defaults in `docker-compose.yml`: web 512 MB, worker 2 GB (Chromium), Postgres 512 MB, Redis 160 MB. A 4 GB VPS runs it comfortably with `SCAN_CONCURRENCY=2`. If memory is tight, set `BROWSER_ENABLED=false` (screenshots then come from PageSpeed Insights instead) and the worker needs ~300 MB.

### Free API keys (optional)

- **Google Cloud → APIs & Services**: enable *PageSpeed Insights API* and *Safe Browsing API*, create an API key restricted to those two → `GOOGLE_API_KEY`. Quotas (25k/day, 10k/day) are far above what a personal tool needs; results are cached in Postgres for 6h/1h.
- WordPress.org, Wordfence Intelligence, RDAP, crt.sh, Team Cymru, Wayback and Green Web Foundation need no keys.

## 4. Operations

- **Kill switch**: Admin → Settings → *Pause all scanning* (or scale the worker to 0 in Coolify).
- **Blocklist / opt-outs**: Admin → Blocklist. Owner opt-outs submitted on `/bot` appear there.
- **Egress reputation**: Admin → Health links the VPS IP to AbuseIPDB / Spamhaus / Talos. Check monthly.
- **Backups**: Coolify → the Postgres service → scheduled backups to S3-compatible storage (daily). Screenshots are disposable.
- **Updates**: `pnpm fingerprints --force` happens on every image build, so a redeploy refreshes the technology database. Renovate keeps dependencies pinned and current.

## 5. Running locally

```bash
pnpm install && pnpm fingerprints
# Postgres + Redis (any way you like), then:
export DATABASE_URL=postgres://scanner:pw@localhost:5432/site_scanner REDIS_URL=redis://localhost:6379
export PUBLIC_SITE_URL=http://localhost:3000 SESSION_SECRET=dev IP_HASH_SALT=dev ADMIN_PASSWORD_HASH=$(node scripts/hash-password.mjs 'devpassword123' | cut -d= -f2-)
pnpm dev:scanner   # worker (applies migrations)
pnpm dev:web       # http://localhost:3000
pnpm scan example.com   # CLI scan without the web app
```

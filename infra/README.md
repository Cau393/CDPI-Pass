# Infrastructure

Live production infrastructure for **cdpipass.com.br**, captured 2026-09-01.

## Topology

```
Browser
  |
  v  HTTPS 443 (TLS 1.2/1.3, HTTP/2, Let's Encrypt ECDSA)
nginx 1.24 on EC2 i-0965a3084c80a2869 (t2.micro, sa-east-1)  56.125.241.168
  |
  v  proxy_pass http://localhost:5003
Node/Express (PM2 process "cdpi-pass")
  |
  +--> Neon Postgres (sa-east-1)
  +--> S3 (QR codes, certificates, event images)
  +--> Lambda (certificate PDF generation)
  +--> SendGrid (email), Asaas (payments)
```

## Canonical host

`www.cdpipass.com.br` is canonical. The apex `cdpipass.com.br` 301-redirects
browser traffic to www.

**Important:** the apex does NOT redirect `/api/`. It proxies it directly.
A 301 on a POST is unreliable, since many clients (including payment gateways)
drop the request body or downgrade to GET on redirect. Asaas payment webhooks
have historically been sent to the apex, so redirecting them would silently
break payment confirmation. Do not "simplify" this into a blanket redirect.

## TLS

- Let's Encrypt DV certificate, ECDSA P-256, SAN: `cdpipass.com.br`, `www.cdpipass.com.br`.
- Renewal: `certbot.timer` (systemd), authenticator = nginx. Verified with `--dry-run`.
- Deploy hook `/etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh` reloads nginx
  after each renewal so the new cert is actually served.
- Watchdog `/usr/local/bin/cert-expiry-check` runs daily at 08:30 via
  `/etc/cron.d/cert-expiry-check` and logs to journal tag `cert-expiry`.
  Check with: `journalctl -t cert-expiry`.
- Port 80 keeps `/.well-known/acme-challenge/` reachable. Never blanket-redirect
  port 80, or renewals will fail.

Certificate lifetimes are shrinking (CA/Browser Forum ballot SC-081v3): 200 days
from 2026-03-15, 100 days from 2027-03-15, 47 days from 2029-03-15. Automation is
mandatory; never plan to renew by hand.

## Network exposure

Security group `sg-07b4756896d70ac93`:

| Port | Source      | Purpose |
|------|-------------|---------|
| 80   | 0.0.0.0/0   | ACME challenge + redirect to HTTPS |
| 443  | 0.0.0.0/0   | HTTPS |
| 22   | single IP   | SSH (restricted) |

Port **5003 is deliberately closed** to the internet. It was previously open to
`0.0.0.0/0`, which served the entire API in cleartext and bypassed TLS entirely.
The app is reachable only through nginx on localhost. Do not reopen it.

Requests arriving by raw IP or an unknown `Host` header get `444` (connection
closed) from the default server block.

## Known drift (not yet resolved)

Production is served by the **PM2 process**, not the Docker container.
`docker ps` shows `cdpi-pass` running, but it has no active port binding and
receives no traffic. This was proven with a canary request that appeared only in
the PM2 log. The CI/CD pipeline in `.github/workflows/deploy.yml` deploys the
Docker container, so **CI deploys do not currently update production**.
The PM2 build on disk dates from 2026-04-30; the container image from 2026-05-20.
This needs to be reconciled. Track in the security/reliability follow-up.

## Files

- `nginx/cdpipass.com.br.conf` - copy of the live nginx site config.
  Backups of previous versions live on the box at `/root/cdpipass.nginx.bak.*`.

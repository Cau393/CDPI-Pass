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

**SSH is pinned to a single IP that is now stale.** As of 2026-09-01 the rule
allows `177.126.10.130/32`, but the office/home address has since changed, so
nobody can currently SSH in. Update it to the current address before any work
that needs the box (checking the live `.env`, the PM2 build, or auditing the
production database):

```bash
MY_IP=$(curl -s https://checkip.amazonaws.com)
aws ec2 authorize-security-group-ingress --region sa-east-1 \
  --group-id sg-07b4756896d70ac93 --protocol tcp --port 22 --cidr "${MY_IP}/32"
# then revoke the stale entry
aws ec2 revoke-security-group-ingress --region sa-east-1 \
  --group-id sg-07b4756896d70ac93 --protocol tcp --port 22 --cidr 177.126.10.130/32
```

SSM Session Manager would remove this whole class of problem (no open port 22,
no IP pinning, and access logged to CloudTrail). It needs an instance profile,
which is also a prerequisite for dropping the static AWS keys from the box.

## Capacity

`t2.micro`: 1 vCPU, 954 MB RAM, 14 GB disk (69% used). CPU credit balance sits
around 30-58, so the instance is not CPU starved at current traffic
(~1.5k requests/day, ~112 unique IPs/day).

Memory is the tight resource. A 2 GB swapfile (`/swapfile`, `vm.swappiness=10`,
persisted in `/etc/fstab`) was added as an OOM safety net, since the box
previously had no swap and only ~250 MB available.

The idle Docker container still holds ~183 MB (19% of RAM) while serving no
traffic. Removing it, or cutting over to it properly, would reclaim that.

## Audit, threat detection and backups

Added 2026-09-01. Before this, the account had no audit trail, no threat
detection, and the production volume had never been backed up.

### CloudTrail

Trail `cdpi-pass-audit` (sa-east-1, multi-region, log file validation on),
delivering to `s3://cdpi-pass-cloudtrail-866605741038`. That bucket blocks all
public access, has AES256 default encryption, versioning (so log files cannot
be silently overwritten), and a policy that denies non-TLS access and scopes
`cloudtrail.amazonaws.com` writes to this trail's ARN only.

```bash
aws cloudtrail get-trail-status --region sa-east-1 --name cdpi-pass-audit
aws cloudtrail lookup-events --region sa-east-1 --max-results 10
```

`lookup-events` is near-real-time and works even before S3 delivery, which
lags ~5-15 minutes.

### GuardDuty

Detector enabled in sa-east-1, findings published every 6 hours. Analyses
CloudTrail management events, VPC flow logs, DNS logs and S3 data events.

```bash
D=$(aws guardduty list-detectors --region sa-east-1 --query 'DetectorIds[0]' --output text)
aws guardduty get-findings --region sa-east-1 --detector-id "$D" \
  --finding-ids $(aws guardduty list-findings --region sa-east-1 --detector-id "$D" --query 'FindingIds[]' --output text)
```

Findings currently go nowhere. Wiring them to email/Slack via EventBridge +
SNS is still open.

### EBS backups

`vol-0d0e72222efe1c22b` (15 GB, root, **unencrypted**) previously had zero
snapshots: no backup, no DR, on a single t2.micro.

- First manual snapshot: `snap-0ecd745712a74fc67`.
- DLM policy `policy-0492d5200b1e4df67`: daily at 07:00 UTC (04:00 local,
  off-peak), 7 snapshots retained.
- The policy targets the tag `Backup=daily`, which is now on the volume. If
  the volume is ever replaced, **re-apply that tag or backups silently stop.**

```bash
aws ec2 describe-snapshots --owner-ids self --region sa-east-1 \
  --query 'sort_by(Snapshots,&StartTime)[-5:].{Id:SnapshotId,Time:StartTime,State:State}' --output table
```

Still open: the volume itself is unencrypted. Encrypting requires a
snapshot -> encrypted copy -> new volume swap, which means downtime, so it is
deliberately not done yet. Neon PITR status is also unconfirmed.

### Cost

GuardDuty ~USD 3-10/mo after the 30-day trial, snapshots ~USD 0.50-1/mo,
CloudTrail first trail free (S3 storage is cents). Nothing else added cost.

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

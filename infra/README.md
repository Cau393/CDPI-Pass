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

## Asaas webhook

`ASAAS_WEBHOOK_TOKEN` **is set in production** and validation works. Verified
2026-09-02 from the PM2 logs: 10 deliveries reached the app and were accepted
("Asaas webhook received and validated": PAYMENT_CREATED, PAYMENT_DELETED,
PAYMENT_OVERDUE, PAYMENT_CHECKOUT_VIEWED). The only 401s in the log are probes
sent deliberately while auditing.

So the queue stalling was **not** a token mismatch on our side. The endpoint
answers correctly on both hosts:

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST \
  https://www.cdpipass.com.br/api/webhooks/asaas \
  -H 'Content-Type: application/json' -d '{"event":"PING"}'   # -> 401, correct
```

Order state is healthy: 551 paid, 22 cancelled, **0 pending**, so no customer
paid without being confirmed. There have been no orders in 30 days and no
upcoming events, so the queue can be re-enabled from the Asaas dashboard
without backfill. If deliveries stall again, check the dashboard's own
delivery log first: the app side is proven working.

Note the app currently accepts webhooks on both the apex and `www`. The apex
must keep proxying `/api/` rather than redirecting, since Asaas has
historically posted there and a 301 on POST drops the body.

## S3 buckets

### cdpi-pass-qr-codes

Despite the name this bucket holds four different things, with different
sensitivity, which is why the access policy is not uniform:

| Prefix | Contents | Access |
|--------|----------|--------|
| `qr-codes/` | 333 ticket QR PNGs | **private** |
| `certificates/` | attendee certificate PDFs (full names) | **private** |
| `certificate-templates/` | admin-uploaded .docx templates | **private** |
| `events/` | event cover images | public read |
| 3 root objects | legacy event banners | public read |

Until 2026-09-02 the policy was a single `PublicReadGetObject` on
`arn:...:cdpi-pass-qr-codes/*`, so **everything above was world-readable**.
Confirmed by unauthenticated fetch: a QR ticket returned 200 with a 5267-byte
PNG and a certificate PDF returned 200 with 83179 bytes. Anonymous *listing*
was denied, so keys were not enumerable, but QR URLs are embedded in every
ticket email.

Two things to know before touching this policy again:

1. **Public read cannot be scoped to `events/*` alone.** The three live events
   reference banners stored at the bucket *root*, not under `events/`. Scoping
   to `events/*` returns 403 for all three and blanks the homepage.
2. **The root banner keys are NFD-normalised** (`DERIVAÇÃO` with combining
   accents). Writing them NFC in the policy JSON does not match and silently
   yields 403. Generate the policy from the exact keys S3 returns:

```bash
aws s3api list-objects-v2 --bucket cdpi-pass-qr-codes --delimiter '/' \
  --query 'Contents[].Key' --output json
```

Public access block is `BlockPublicAcls=true, IgnorePublicAcls=true`, with
`BlockPublicPolicy` and `RestrictPublicBuckets` deliberately **off**: turning
them on revokes the `events/*` public read the site depends on.

Verify the split:

```bash
# must be 403
curl -s -o /dev/null -w '%{http_code}\n' \
  "https://cdpi-pass-qr-codes.s3.sa-east-1.amazonaws.com/qr-codes/<key>"
# must be 200 (all three live banners)
curl -s https://www.cdpipass.com.br/api/events | \
  python3 -c "import json,sys;[print(e['imageUrl']) for e in json.load(sys.stdin) if e.get('imageUrl')]"
```

Certificates are served as 900-second presigned URLs generated per request by
`/api/users/me/certificates` and `/api/certificates/generate`
(`server/utils/presignedUrl.ts`). This is transparent to users because the
client always refetches the URL from the authenticated API.

QR codes needed no equivalent: the app renders them from the base64
`qr_code_data` column, never the S3 URL. The S3 copies only backed historical
emails. Old ticket emails will now show a broken QR image, which is acceptable
because the latest event was 2026-05-20 and there are no upcoming events. If
ticket sales resume, either embed the QR as a data URI or attach it, rather
than re-opening the bucket.

Note the certificate feature is currently unused in production: 0 rows in
`certificates`, 0 events with a template.

### cdpi-pass-frontend-prod

Still fully public with the public access block disabled. It serves a static
frontend build, so public read is expected, but it should get the same
treatment: an explicit read-only policy plus ACL blocks. Not yet done.

## Known drift (RESOLVED 2026-09-02)

Production is served by the **PM2 process** `cdpi-pass`, from a git checkout at
`~/CDPI-Pass`, built in place:

```
~/CDPI-Pass/frontend/dist/index.js   <- PM2 runs this, cwd ~/CDPI-Pass/frontend
~/CDPI-Pass/frontend/.env            <- the live env file
```

Three separate faults meant CI deploys never reached production, so the site
ran the build from 2026-04-30 (commit `872f12a`) for four months, 19 commits
behind, including two security fixes:

1. **Nothing was pushed.** The last 7 commits existed only on the developer's
   laptop. CI triggers on push, so it never ran for them.
2. **CI targeted the wrong path.** The workflow deployed a Docker container
   using `~/app/frontend/.env`. `~/app/frontend/` contains *only* an `.env`
   file; it is not where production runs. There is no code there.
3. **The container never worked.** `docker inspect` showed `ports=map[]`, so
   the `-p 5003:5003` binding never applied, and its logs showed
   `EAI_AGAIN` failing to resolve the Neon host. It could not have served
   traffic even if nginx had pointed at it.

The net effect was a green CI pipeline deploying a broken container that
nothing routed to, while PM2 quietly served stale code.

Fixed by rewriting `.github/workflows/deploy.yml` to deploy the way
production actually runs: `git pull` into `~/CDPI-Pass`, `pnpm install
--frozen-lockfile`, build in place, smoke-test the new build on port 5195,
and only then `pm2 restart`. If the smoke test fails the live app is left
untouched; if the post-restart check fails it restores the previous `dist/`
and restarts. Five rollback points are kept in `~/dist-rollback-*`.

The idle container and its 1.77 GB image have been removed.

### Deploying manually

```bash
ssh -i ~/AWS/Cdpi_pass.pem ubuntu@56.125.241.168
cd ~/CDPI-Pass
cp -r frontend/dist ~/dist-rollback-$(date +%Y%m%d-%H%M%S)   # rollback point
git checkout -- frontend/dist ecosystem.config.cjs           # dist/ is committed
git pull --ff-only origin hotfix-frontend-update
cd frontend
export PATH="$HOME/.local/share/pnpm:$PATH"
pnpm install --frozen-lockfile
NODE_OPTIONS="--max-old-space-size=1536" pnpm run build      # 954MB box, cap the heap
pm2 restart cdpi-pass --update-env
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:5003/api/events
```

Rollback:

```bash
cd ~/CDPI-Pass/frontend
rm -rf dist && cp -r ~/dist-rollback-<TIMESTAMP> dist
pm2 restart cdpi-pass --update-env
```

Note `frontend/dist/` is committed to the repo, so a local build always dirties
the working tree and must be checked out before pulling. Removing `dist/` from
version control would make this cleaner.

## Files

- `nginx/cdpipass.com.br.conf` - copy of the live nginx site config.
  Backups of previous versions live on the box at `/root/cdpipass.nginx.bak.*`.

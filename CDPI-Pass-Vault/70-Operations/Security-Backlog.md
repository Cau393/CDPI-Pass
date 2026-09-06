# Security Backlog

Prioritized list of open security and resilience items for production (`cdpipass.com.br`, AWS account `866605741038`, region `sa-east-1`). Every item carries the **read-only** command that proves it and the output observed on **2026-09-04**. Nothing here was changed during the audit; re-run the command before fixing to confirm it is still open, and move the item to [[#Resolved]] once the same command shows it closed.

Related: [[50-Infrastructure/AWS-Services|AWS Services]] · [[50-Infrastructure/Deployment|Deployment]] · [[50-Infrastructure/Environment-Variables|Env Vars]] · [[40-Database/Migration-Workflow|Migration Workflow]] · [[20-Backend/Certificates|Certificates]] · `infra/README.md` in the repo.

Priority key: **P1** exploitable now or silent data loss · **P2** broken feature or weak control with a clear attack path · **P3** hardening and unconfirmed assumptions.

| # | Pri | Item | Status |
|---|---|---|---|
| 1 | P1 | Daily EBS backup policy is in `ERROR`; zero automated snapshots since 2026-09-01 | open |
| 2 | P1 | Root account access key exists and is the key used for day-to-day CLI work | open |
| 3 | P1 | IAM user `cdpi-s3-uploader` has `AmazonS3FullAccess` + `AWSLambda_FullAccess` | open |
| 4 | P1 | Static AWS keys in `~/CDPI-Pass/frontend/.env` on EC2; no instance profile, no SSM | open |
| 5 | P2 | Asaas API key is invalid (paid checkout fails) | open |
| 6 | P2 | `JWT_SECRET` falls back to `"your-secret-key"` | open |
| 7 | P2 | GuardDuty findings go nowhere (one is severity 8.0) | open |
| 8 | P2 | `sql/` migrations have no applied-state tracking (the `nps_responses` incident) | open |
| 9 | P2 | SSH ingress pinned to a stale IP again; no out-of-band access path | open |
| 10 | P3 | Root EBS volume and its only snapshot are unencrypted | open |
| 11 | P3 | `cdpi-pass-frontend-prod` bucket fully public, no ACL blocks | open |
| 12 | P3 | Neon point-in-time restore window unconfirmed | open |
| 13 | P3 | GitHub Actions deploy uses static keys although an OIDC role exists | open |

---

## P1

### 1. EBS backup policy in ERROR, no automated snapshots

`infra/README.md` documents DLM policy `policy-0492d5200b1e4df67` as running daily at 07:00 UTC with 7 retained. It has never produced a snapshot. The schedule adds a `Name` tag **and** copies the volume's tags, which already include `Name=cdpi-pass-prod-root`, so every run fails on a duplicate key. The only backup of the production root volume is the manual one from 2026-09-01.

```bash
aws dlm get-lifecycle-policy --region sa-east-1 --policy-id policy-0492d5200b1e4df67 \
  --query 'Policy.{State:State,Status:StatusMessage,Tags:PolicyDetails.Schedules[0].TagsToAdd,CopyTags:PolicyDetails.Schedules[0].CopyTags}'
```
```json
{ "State": "ERROR", "Status": "Duplicate tag key 'Name' specified.",
  "Tags": [{"Key":"CreatedBy","Value":"dlm-daily"},{"Key":"Name","Value":"cdpi-pass-prod-root-auto"}],
  "CopyTags": true }
```
```bash
aws ec2 describe-snapshots --owner-ids self --region sa-east-1 \
  --query 'Snapshots[].{Id:SnapshotId,Time:StartTime,Desc:Description}'
```
```json
[{ "Id": "snap-0ecd745712a74fc67", "Time": "2026-09-01T23:31:17.649000+00:00",
   "Desc": "CDPI Pass prod root volume - first backup (manual, pre-automation)" }]
```
Three scheduled runs (09-02, 09-03, 09-04 at 07:00 UTC) produced nothing.

**Fix**: remove the `Name` entry from `TagsToAdd` (or set `CopyTags=false`), then `aws dlm update-lifecycle-policy ... --state ENABLED` and confirm the next day that a second snapshot appears. Until then, take a manual snapshot before any change to the box.

### 2. Root access key in daily use

The account has a root access key, and it is the identity behind the local `aws` CLI. Every audit command in this note ran as root. GuardDuty has flagged it 638 times. Root cannot be scoped by IAM policy, so a leak of `~/.aws/credentials` is a full account takeover. Root MFA is enabled, but MFA does not protect access keys.

```bash
aws sts get-caller-identity
```
```json
{ "UserId": "866605741038", "Account": "866605741038", "Arn": "arn:aws:iam::866605741038:root" }
```
```bash
aws iam get-account-summary --query 'SummaryMap.{AccountAccessKeysPresent:AccountAccessKeysPresent,AccountMFAEnabled:AccountMFAEnabled}'
```
```json
{ "AccountAccessKeysPresent": 1, "AccountMFAEnabled": 1 }
```
CloudTrail confirms the key id (`AKIA4TRN2GPX…`, `mfa=None`) on every call, and GuardDuty findings `Policy:IAMUser/RootCredentialUsage` show `Count: 624` (ListObjects) and `Count: 14` (ListAttachedUserPolicies). See item 7 for the command.

**Fix**: create an IAM admin user (or Identity Center) with MFA, move `~/.aws/credentials` to it, then `aws iam delete-access-key` on the root key from the console. Do this before item 3, since the new admin is what will edit IAM.

### 3. `cdpi-s3-uploader` over-privileged

This is the app's runtime identity (S3 uploads + Lambda invoke). It holds two AWS-managed full-access policies, so a leaked `.env` (item 4) can delete every bucket in the account, including CloudTrail logs and the Terraform state, and create or modify any Lambda. The inline policy that was meant to scope the invoke points at a function that **does not exist**, so it is dead weight and invoke only works because of `AWSLambda_FullAccess`.

```bash
aws iam list-attached-user-policies --user-name cdpi-s3-uploader --query 'AttachedPolicies[].PolicyName'
aws iam list-user-policies --user-name cdpi-s3-uploader
aws iam get-user-policy --user-name cdpi-s3-uploader --policy-name lambda-cdpi-pass-docx-to-pdf-certificate --query PolicyDocument.Statement[0].Resource
aws lambda list-functions --region sa-east-1 --query 'Functions[].FunctionName'
```
```
["AmazonS3FullAccess", "AWSLambda_FullAccess"]
{ "PolicyNames": ["lambda-cdpi-pass-docx-to-pdf-certificate"] }
"arn:aws:lambda:sa-east-1:866605741038:function:certificate-docx-pdf-converter"   <- not a real function
["certificate-lambda-cdpi-pass"]                                                  <- the real one
```
```bash
aws iam list-access-keys --user-name cdpi-s3-uploader
aws iam get-access-key-last-used --access-key-id AKIA4TRN2GPX…
```
```
AKIA4TRN2GPX…  Active  CreateDate 2025-09-11   (never rotated, ~1 year)
LastUsedDate 2026-09-04T04:34:00+00:00  ServiceName s3
```
Minimum the app actually needs (from `server/services/s3Service.ts`, `certificateLambdaService.ts`, and the Lambda's own role `lambdaFunction-role-pdf-converterPolicy`, which is correctly scoped to `certificate-templates/*` read and `certificates/*` write):

- `s3:PutObject`, `s3:GetObject`, `s3:DeleteObject` on `arn:aws:s3:::cdpi-pass-qr-codes/*`
- `lambda:InvokeFunction` on `arn:aws:lambda:sa-east-1:866605741038:function:certificate-lambda-cdpi-pass`

**Fix**: attach one customer-managed policy with exactly the above, detach both `*FullAccess` policies, delete the dead inline policy, rotate the key. Verify with the [[20-Backend/Certificates#Reusable test procedure|certificate test procedure]] (it exercises S3 put, Lambda invoke and presign in one run). Ideally fold this into item 4 and delete the user entirely.

### 4. Static AWS keys on the EC2 box; no instance profile, no SSM

The app reads `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` from `~/CDPI-Pass/frontend/.env` on the instance (`infra/README.md` "Known drift"). The instance has no IAM role attached and is not an SSM managed node, so there is nothing to migrate to yet. Anyone with a shell, a path traversal, or a stale backup of the disk gets item 3's credentials.

```bash
aws ec2 describe-instances --region sa-east-1 --instance-ids i-0965a3084c80a2869 \
  --query 'Reservations[0].Instances[0].{IamInstanceProfile:IamInstanceProfile,MetadataOptions:MetadataOptions.HttpTokens}'
aws ssm describe-instance-information --region sa-east-1
aws iam list-instance-profiles --query 'InstanceProfiles[].InstanceProfileName'
```
```json
{ "IamInstanceProfile": null, "MetadataOptions": "required" }     <- no role; IMDSv2 already enforced (good)
{ "InstanceInformationList": [] }                                   <- not SSM-managed
["aws-elasticbeanstalk-ec2-role"]                                   <- only a leftover EB profile
```
The live `.env` could not be re-read this session because SSH is down (item 9). The 2026-09-02 reading in `infra/README.md` and the same variables in the local `frontend/.env` (`grep -c '^AWS_ACCESS_KEY_ID=AKIA' frontend/.env` = `1`) stand as evidence.

The code already supports the fix without changes: `certificateLambdaService.ts:18-19` passes explicit keys only when both env vars are set, and `s3Service.ts:13-14` does the same, so removing the two vars makes the SDK fall through to the instance-profile credential chain. **Check `s3Service.ts:21` first**: it currently treats missing keys as "S3 not configured" and must be relaxed to only require the bucket name.

**Fix** (order matters):
1. Create role `cdpi-pass-ec2` with the scoped policy from item 3 plus `AmazonSSMManagedInstanceCore`; create instance profile; `aws ec2 associate-iam-instance-profile`. No reboot needed.
2. Confirm `aws ssm describe-instance-information` lists the instance, then `aws ssm start-session --target i-0965a3084c80a2869` works. This also closes item 9.
3. Patch `s3Service.ts:21`, deploy, remove the two vars from `.env`, `pm2 restart cdpi-pass`, run the certificate test procedure.
4. Delete the `cdpi-s3-uploader` access key, then the user.

---

## P2

### 5. Asaas API key invalid

`ASAAS_API_KEY` in `frontend/.env` is a **production** key (`$aact_prod_…`) while `ASAAS_API_URL` points at the **sandbox**. Both combinations are rejected, so `asaasService.ts` (constructor at line 41) gets 401 on every payment creation and paid checkout returns 500. Courtesy (free) orders are unaffected because they never call Asaas ([[60-Decisions/ADR-005-courtesy-as-paid-order|ADR-005]]).

```bash
cd frontend
grep -E '^ASAAS_API_URL=' .env
K=$(grep -E '^ASAAS_API_KEY=' .env | cut -d= -f2-)
curl -s -w 'HTTP %{http_code}\n' "https://sandbox.asaas.com/api/v3/customers?limit=1" -H "access_token: $K"
curl -s -w 'HTTP %{http_code}\n' "https://api.asaas.com/v3/customers?limit=1"     -H "access_token: $K"
```
```
ASAAS_API_URL=https://sandbox.asaas.com/api/v3
{"errors":[{"code":"invalid_environment","description":"A chave de API informada não pertence a este ambiente"}]}  HTTP 401
{"errors":[{"code":"invalid_access_token","description":"A chave de API fornecida é inválida"}]}                   HTTP 401
```
This is the local `.env`; the EC2 copy could not be checked (item 9), but `infra/README.md` records no orders in 30 days and no upcoming events, so the outage is currently invisible. It will not be once ticket sales resume. The webhook side (`ASAAS_WEBHOOK_TOKEN`) is proven working and is a separate credential.

**Fix**: generate a new key in the Asaas dashboard for the environment actually used in prod, set `ASAAS_API_URL` to match, update the EC2 `.env`, restart, and place one real R$1 test order end to end before the next event goes on sale. Store the key in SSM Parameter Store once item 4 lands.

### 6. `JWT_SECRET` fallback `"your-secret-key"`

If the env var is ever missing (a bad deploy, a new box, a `.env` typo), the server boots normally and signs 7-day tokens with a public string. Anyone can then mint `{userId: <admin id>}` and pass `authenticateToken` + the `isAdmin` check. It is duplicated in two files, so a fix in one leaves the other.

```bash
grep -n 'JWT_SECRET' frontend/server/middleware/auth.ts frontend/server/routes.ts | head -4
```
```
frontend/server/middleware/auth.ts:6:const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key";
frontend/server/routes.ts:107:const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key";
```
`auth.ts` uses it at lines 26, 57, 83, 88; `routes.ts` at 127, 245, 284, 314 (the `type`-carrying token there is the password-reset flow, same secret).

**Fix**: delete the `routes.ts:107` copy and import from `middleware/auth.ts`; there, `if (!process.env.JWT_SECRET) throw new Error("JWT_SECRET is required")` at module load, matching how `db.ts` already fails fast on a missing `DATABASE_URL`. Add the same guard for `QR_CODE_SECRET` and `SESSION_SECRET` while there. Confirm the value in prod `.env` is long and random, and rotate it if it has ever been committed.

### 7. GuardDuty findings unrouted

The detector works and has real findings, including a **severity 8.0** for the bucket that was public until 2026-09-02, but nothing forwards them. There are no EventBridge rules in the region. An SNS topic with a confirmed email subscription already exists and can be reused.

```bash
D=$(aws guardduty list-detectors --region sa-east-1 --query 'DetectorIds[0]' --output text)
aws guardduty get-findings --region sa-east-1 --detector-id "$D" \
  --finding-ids $(aws guardduty list-findings --region sa-east-1 --detector-id "$D" --query 'FindingIds[]' --output text) \
  --query 'Findings[].{Type:Type,Sev:Severity,Count:Service.Count,Updated:UpdatedAt}'
aws events list-rules --region sa-east-1
aws sns list-subscriptions-by-topic --region sa-east-1 --topic-arn arn:aws:sns:sa-east-1:866605741038:CDPI_Pass --query 'Subscriptions[].{Proto:Protocol,Endpoint:Endpoint}'
```
```json
[ { "Type": "Policy:IAMUser/RootCredentialUsage",     "Sev": 2.0, "Count": 624, "Updated": "2026-09-04T04:40:00.171Z" },
  { "Type": "Policy:IAMUser/RootCredentialUsage",     "Sev": 2.0, "Count": 14,  "Updated": "2026-09-02T13:13:48.056Z" },
  { "Type": "Policy:S3/BucketAnonymousAccessGranted", "Sev": 8.0, "Count": 2,   "Updated": "2026-09-02T02:02:08.746Z" } ]
{ "Rules": [] }
[ { "Proto": "email", "Endpoint": "caueroriz@gmail.com" } ]
```

**Fix**: one EventBridge rule on `{"source":["aws.guardduty"],"detail-type":["GuardDuty Finding"],"detail":{"severity":[{"numeric":[">=",4]}]}}` with target `arn:aws:sns:sa-east-1:866605741038:CDPI_Pass`, plus a resource policy on the topic allowing `events.amazonaws.com` to publish. Then archive the three current findings so the next one stands out. Cost is zero.

### 8. `sql/` migrations have no applied-state tracking

Schema changes are hand-written `.sql` files applied manually ([[60-Decisions/ADR-001-manual-sql-migrations|ADR-001]]). Nothing records which files have been run on which database. `cleanup_legacy_nps_responses.sql` was committed on 2026-05-14 and sat unapplied on prod until 2026-09-04, during which **every** `POST /api/certificates/generate` failed with a NOT NULL violation after the Lambda had already run (see [[20-Backend/Certificates#Incident: `certificates.nps_responses` NOT NULL (2026-09-04)|the incident write-up]] and [[40-Database/Normalization-History]]). No test or health check could have caught it because the app code was correct; only the database was behind.

```bash
ls frontend/sql | wc -l
grep -rln 'schema_migrations\|applied_at' frontend/sql frontend/shared/schema.ts frontend/server/db.ts
git log --diff-filter=A --format='%ad %h' --date=short -- frontend/sql/cleanup_legacy_nps_responses.sql
```
```
13
(no matches)
2026-05-14 f1e6b0c
```

**Fix** (keeps the manual-apply rule intact): add `sql/000_schema_migrations.sql` creating `schema_migrations(filename text primary key, applied_at timestamptz default now())`, end every future file with `insert into schema_migrations(filename) values ('<file>') on conflict do nothing`, backfill the 13 existing files on staging and prod, and add a `pnpm run db:pending` script that diffs `ls sql/` against the table (read-only) and is run in the deploy checklist in [[50-Infrastructure/Deployment]]. Record the outcome in [[40-Database/Migration-Workflow]].

### 9. SSH ingress pinned to a stale IP; no out-of-band access

`infra/README.md` warned that the SSH rule was pinned to a stale address. It was updated once since (the rule no longer shows `177.126.10.130`) and is stale again. Nobody can reach the box, which blocked verification of items 4 and 5 this session and would block incident response.

```bash
aws ec2 describe-security-groups --region sa-east-1 --group-ids sg-07b4756896d70ac93 \
  --query 'SecurityGroups[0].IpPermissions[?FromPort==`22`].IpRanges[].CidrIp'
curl -s https://checkip.amazonaws.com
ssh -o ConnectTimeout=8 -o BatchMode=yes -i ~/AWS/Cdpi_pass.pem ubuntu@56.125.241.168 true
```
```
["177.145.81.91/32"]
201.72.251.184
ssh: connect to host 56.125.241.168 port 22: Operation timed out
```

**Fix**: short term, the authorize/revoke pair in `infra/README.md` "Network exposure". Real fix is SSM Session Manager from item 4 step 2, after which port 22 can be removed from the group entirely.

---

## P3

### 10. Root EBS volume and snapshot unencrypted

Data at rest on the production disk (the `.env` with every secret, PM2 logs, nginx logs with visitor IPs) is unencrypted, and so is the only snapshot. Account-level default encryption is off, so any new volume or the DLM snapshots from item 1 will also be unencrypted.

```bash
aws ec2 describe-volumes --region sa-east-1 --volume-ids vol-0d0e72222efe1c22b --query 'Volumes[0].{Encrypted:Encrypted,Size:Size}'
aws ec2 get-ebs-encryption-by-default --region sa-east-1
aws ec2 describe-snapshots --owner-ids self --region sa-east-1 --query 'Snapshots[].Encrypted'
```
```json
{ "Encrypted": false, "Size": 15 }
{ "EbsEncryptionByDefault": false }
[ false ]
```

**Fix**: `aws ec2 enable-ebs-encryption-by-default --region sa-east-1` costs nothing and makes future snapshot copies and volumes encrypted. Encrypting the live root requires stop, snapshot, `copy-snapshot --encrypted`, create volume, swap, start: about 10 minutes of downtime, so schedule it in a window and fix item 1 first so there is a fresh backup to fall back to. Re-apply the `Backup=daily` tag to the new volume or backups stop again.

### 11. `cdpi-pass-frontend-prod` fully public

A static site bucket needs public `GetObject`, and it has exactly that. But all four public-access-block flags are off, so anyone with write access (item 3's user has `AmazonS3FullAccess`) can also set public ACLs or widen the policy without a guardrail, and versioning is off so a defaced `index.html` cannot be rolled back.

```bash
aws s3api get-public-access-block --bucket cdpi-pass-frontend-prod
aws s3api get-bucket-policy-status --bucket cdpi-pass-frontend-prod
aws s3api get-bucket-versioning --bucket cdpi-pass-frontend-prod
curl -s -o /dev/null -w '%{http_code}\n' https://cdpi-pass-frontend-prod.s3.sa-east-1.amazonaws.com/
curl -s -o /dev/null -w '%{http_code}\n' https://cdpi-pass-frontend-prod.s3.sa-east-1.amazonaws.com/index.html
```
```
BlockPublicAcls=false IgnorePublicAcls=false BlockPublicPolicy=false RestrictPublicBuckets=false
{ "PolicyStatus": { "IsPublic": true } }
(empty: versioning not enabled)
403   <- anonymous listing denied (good)
200   <- anonymous object read (expected for a static site)
```
Note this bucket is not in the live request path: production is served by nginx + PM2 on EC2 (`infra/README.md`), so the bucket is a legacy or parallel deploy target. Confirm whether anything still references it before deciding between hardening and deleting.

**Fix**: if kept, set `BlockPublicAcls=true, IgnorePublicAcls=true` (same split as `cdpi-pass-qr-codes`, which keeps the policy-based read working), enable versioning, and consider fronting with CloudFront + OAC so the bucket itself can be fully private. If unused, empty and delete it.

### 12. Neon point-in-time restore unconfirmed

Neon keeps a history window for branch-level PITR, but the length depends on plan (free tier is 6 hours, paid up to 7 or 30 days) and nobody has checked. This is the **only** backup of the production database: there are no `pg_dump` jobs anywhere in the repo, cron, or CI.

```bash
which neonctl neon                                                     # (none installed)
grep -rn 'pg_dump\|neonctl\|history retention' frontend/package.json .github/workflows/deploy.yml infra/README.md CDPI-Pass-Vault
```
```
(no matches)
```
Prod `DATABASE_URL` lives only on the EC2 box, so the project id could not be read this session (item 9). The local `.env` points at staging (`ep-summer-sun-acft18c1-pooler`), see [[50-Infrastructure/Neon-Database]].

**Fix**: in the Neon console, Project settings > Storage, read "History retention" for the prod project and record it in [[50-Infrastructure/Neon-Database]]. If it is under 7 days, either raise it or add a nightly `pg_dump --no-owner` to `s3://cdpi-pass-cloudtrail-866605741038`-style private bucket from the EC2 cron (the box already runs `cert-expiry-check` daily, same mechanism). Test a restore once.

### 13. GitHub Actions deploy uses static keys although an OIDC role exists

`.github/workflows/deploy.yml` authenticates with `secrets.AWS_ACCESS_KEY_ID` (the `cdpi-pass-deployer` user, key `AKIA4TRN2GPX…` created 2026-04-30) while role `GitHubActions-CDPI-Pass-Deploy-Role` with a `token.actions.githubusercontent.com` trust already exists in the account. The user's policy is tightly scoped (only `Authorize/RevokeSecurityGroupIngress` on the one SG), so the risk is low, but it is one more long-lived key to rotate.

```bash
grep -n 'aws-access-key-id\|role-to-assume' .github/workflows/deploy.yml
aws iam get-role --role-name GitHubActions-CDPI-Pass-Deploy-Role --query 'Role.AssumeRolePolicyDocument.Statement[].Principal'
aws iam list-access-keys --user-name cdpi-pass-deployer --query 'AccessKeyMetadata[].{Id:AccessKeyId,Created:CreateDate}'
```
```
.github/workflows/deploy.yml:93:          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
[ { "Federated": "arn:aws:iam::866605741038:oidc-provider/token.actions.githubusercontent.com" } ]
[ { "Id": "AKIA4TRN2GPX…", "Created": "2026-04-30T14:46:50+00:00" } ]
```

**Fix**: switch `configure-aws-credentials` to `role-to-assume: arn:aws:iam::866605741038:role/GitHubActions-CDPI-Pass-Deploy-Role` with `id-token: write` permission, confirm the role's trust `sub` condition matches this repo and branch, attach the same scoped policy to the role, then delete the user's key and the two repo secrets.

---

## Out of scope but seen

- Three other IAM users with long-lived keys belong to other projects in the same account (`rachae-backend`, `cdpi-lesson-editor-backend`, `cdpi-pass-deployer`). A blast-radius review of the whole account is worth doing once items 2 and 3 are closed.
- Leftover Elastic Beanstalk / ECS / RDS service roles and an `elasticbeanstalk-us-west-2` bucket suggest earlier deployments that were never cleaned up. Unused resources are unaudited attack surface; inventory with `aws resource-explorer-2 search`.

## Things that are already right

Recorded so they are not re-audited: IMDSv2 required on the instance · root MFA enabled · CloudTrail `cdpi-pass-audit` logging with no delivery errors (`LatestDeliveryError: null`) · Lambda execution role scoped to exactly the two S3 prefixes it needs · port 5003 closed, only 80/443 public · `cdpi-pass-qr-codes` private prefixes return 403 unauthenticated · `ASAAS_WEBHOOK_TOKEN` validated in prod.

## Resolved

_(move items here with the date and the command output that shows them closed)_

# Environment Variables

Reference of names + purpose only. **Values live in `frontend/.env` (staging) and on the EC2 server (prod). Never copy values into this vault or commits.**

## Actively used by code
| Var | Used in | Purpose |
|---|---|---|
| `DATABASE_URL` | `server/db.ts` | Neon Postgres connection (staging locally, prod on server) |
| `JWT_SECRET` | auth middleware, emails, print WS | JWT signing |
| `SESSION_SECRET` | server | session secret |
| `SENDGRID_API_KEY`, `SENDGRID_FROM_EMAIL` | emailService | email delivery |
| `ASAAS_API_KEY`, `ASAAS_API_URL` | asaasService | payments (sandbox vs prod by URL) |
| `ASAAS_WEBHOOK_TOKEN` | webhook route | validates Asaas webhook calls |
| `QR_CODE_SECRET` | qrCodeService | HMAC signing of QR payloads |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION` | s3Service, Lambda | AWS credentials (needs S3 + `lambda:InvokeFunction`) |
| `AWS_S3_BUCKET_NAME` | s3Service | bucket for images/QRs/certificates |
| `AWS_LAMBDA_ARN` | certificateLambdaService | certificate PDF Lambda |
| `FRONTEND_URL` / `BASE_URL` | emails | links in emails |
| `PORT` | server | listen port (5003 in prod) |
| `NODE_ENV` | everywhere | dev/prod switch |
| `VITE_RECAPTCHA_SITE_KEY` | client | reCAPTCHA site key |

## Present in .env but effectively unused / aspirational
`REDIS_URL`, `CELERY_*` (no Redis/Celery in the Node app — queues are Postgres tables), `PGHOST/PGUSER/...` (superseded by `DATABASE_URL`), rate limiting / CORS / logging / cache / password-policy / LGPD flags (most are not read by code — verify before relying on them).

> When adding a new env var: add it to `.env`, document it here, and set it on the EC2 server before deploying.

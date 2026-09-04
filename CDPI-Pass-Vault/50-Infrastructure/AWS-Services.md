# AWS Services

Region: `sa-east-1` (São Paulo).

## EC2
Hosts the Dockerized app (PM2 with server + email worker). See [[50-Infrastructure/Deployment]].

## S3 (`AWS_S3_BUCKET_NAME`)
Stores:
- Event images (uploaded on event create/edit)
- QR code PNGs for tickets (`orders.qr_code_s3_url`)
- Certificate .docx templates (per event, `events.certificate_template_url`)
- Generated certificate PDFs (Lambda output)

Access via `server/services/s3Service.ts` (put/get/delete + presigned URLs).

## Lambda (`AWS_LAMBDA_ARN`)
Certificate generator: receives `{templateS3Url, nomeCompleto, userId, eventId, outputBucket}`, fills the .docx, converts to PDF, uploads to S3, returns `pdfUrl` in the response body.

- Invoked by `certificateLambdaService.ts` with cold-start retry (5s interval, up to 45s). Observed live 2026-09-04: cold 37.1s (4 retries), warm 7.8s.
- Output key `certificates/event_<eventId>/user_<userId>_certificado.pdf`; templates at `certificate-templates/<eventId>/<uuid>.docx`. Both private, served via 900s presigned URLs. Full contract, failure modes and test procedure: [[20-Backend/Certificates]].
- **IAM gotcha**: the credentials in `AWS_ACCESS_KEY_ID` must allow both S3 usage **and** `lambda:InvokeFunction` on the exact ARN, otherwise `AccessDeniedException` on invoke.

## Not AWS but external
- **Neon** Postgres — [[50-Infrastructure/Neon-Database]]
- **Asaas** — payments (BR gateway)
- **SendGrid** — email delivery

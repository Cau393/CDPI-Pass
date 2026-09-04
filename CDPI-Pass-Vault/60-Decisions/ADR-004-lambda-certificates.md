# ADR-004: AWS Lambda for certificate PDF generation

- **Date**: recorded 2026-09-01 (decision predates)
- **Status**: accepted

## Context
Certificates are per-event .docx templates filled with the attendee name and converted to PDF. docx→PDF conversion is heavy (LibreOffice-class tooling) and would bloat the EC2 app image.

## Decision
A dedicated Lambda receives `{templateS3Url, nomeCompleto, userId, eventId, outputBucket}`, renders the PDF, uploads to S3, and returns `pdfUrl`. The app invokes it via `certificateLambdaService.ts` with cold-start retries (5s interval, up to 45s). Generation is gated on the user having answered the event's NPS survey.

## Consequences
- App image stays slim; conversion scales independently.
- Cold starts are user-visible (up to ~45s worst case); the retry loop plus frontend messaging handles it.
- IAM must grant `lambda:InvokeFunction` on the exact ARN to the app credentials.

## Verified behaviour
Proven live 2026-09-04: cold start 37.1s (4 retries), warm 7.8s; the Lambda fills both `{{ nome }}` and `{nome}`. Full contract, S3 layout, failure-mode table and test procedure in [[20-Backend/Certificates]].

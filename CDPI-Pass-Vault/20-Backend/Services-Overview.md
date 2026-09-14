# Services Overview

All in `server/services/`. Routes call these; they wrap external providers.

## asaasService.ts
Brazilian payment gateway client. Creates customers and payments (`BOLETO | CREDIT_CARD | PIX`), fetches payment status. Uses `ASAAS_API_KEY` / `ASAAS_API_URL` (sandbox vs prod switch via URL). Webhook validated with `ASAAS_WEBHOOK_TOKEN` at `POST /api/webhooks/asaas`.

## emailService.ts
SendGrid wrapper (`@sendgrid/mail`). Builds transactional emails (verification code, ticket + QR or online meeting link, courtesy invite, reset password, certificate ready). Most sends go through the **DB queue** (`email_queue` table) consumed by the worker, not direct sends. JWT used for signed links in emails.

Ticket e-mail body lives in `server/utils/ticketEmailTemplate.ts` (pure, unit-tested like `cancellationEmailTemplate.ts`). `TicketEmailData.confirmationKind` (`paid | free | courtesy`) picks the opening line: "Seu pagamento foi confirmado!" / "Sua inscrição está confirmada!" / "Sua presença foi confirmada!". Callers go through `sendPurchaseConfirmationEmail` (free subscribe, courtesy redeem, `finalizeOrderPaidLikeWebhook`). The "Instruções Importantes" list is `TICKET_INSTRUCTIONS` in the same file; change copy there, never inline.

Online events skip QR generation and send `server/utils/onlineEventEmailTemplate.ts` instead (meeting URL, no ticket). Optional `events.confirmation_email_html` (TipTap, same allow-list as courtesy templates) is injected after the greeting when non-empty; empty/null keeps these hardcoded templates. Full notes: [[20-Backend/Event-Modality]].

## paymentStatusService.ts
Polls Asaas for a pending order and, if paid, funnels into `finalizeOrderPaidLikeWebhook` (same code path as the webhook) so confirmation (QR ticket or online meeting link) is consistent regardless of how payment confirmation arrives.

## qrCodeService.ts
Generates signed QR payloads (`orderId/eventId/userId` + HMAC with `QR_CODE_SECRET`), renders PNG via `qrcode`, uploads to S3, stores URL on `orders.qr_code_s3_url`. **Not called for online events.**

## s3Service.ts
S3 client (`sa-east-1` default). Upload/get/delete + presigned URLs. Buckets from `AWS_S3_BUCKET_NAME`. Used for: event images, QR PNGs, certificate .docx templates, generated certificate PDFs.

## certificateLambdaService.ts
Invokes `AWS_LAMBDA_ARN` with payload `{templateS3Url, nomeCompleto, userId, eventId, outputBucket}`; expects `pdfUrl` in response. Has cold-start retry logic (5s interval, 45s max, detects "Lambda is initializing"). IAM user must allow `lambda:InvokeFunction` on the exact ARN.

## Related
- [[20-Backend/Workers-and-Middleware]]
- [[50-Infrastructure/AWS-Services]]

# Architecture Overview

One Node process serves the API and (in prod) the built SPA from `dist/`. A second PM2 process runs the email worker. See [[50-Infrastructure/Deployment]].

```mermaid
flowchart LR
  subgraph Browser
    SPA[React SPA<br/>Wouter + TanStack Query]
    Term[Print Terminal<br/>WebUSB Zebra]
  end
  subgraph EC2 [AWS EC2 - Docker - PM2]
    API[Express API<br/>server/routes.ts]
    WS[WebSocket<br/>printCoordinator]
    Worker[Email Worker<br/>run-email-worker]
  end
  DB[(Neon Postgres<br/>Drizzle)]
  Asaas[Asaas Payments]
  SG[SendGrid]
  S3[(AWS S3)]
  Lambda[AWS Lambda<br/>docx to PDF]

  SPA -->|/api/*| API
  Term <-->|ws + JWT| WS
  API --> DB
  API -->|create payment| Asaas
  Asaas -->|/api/webhooks/asaas| API
  API -->|enqueue email_queue| DB
  Worker --> DB
  Worker --> SG
  API --> S3
  API -->|invoke| Lambda
  Lambda --> S3
```

## Server layering
- `server/index.ts` — express setup, `trust proxy`, 50mb JSON limits, API request logging, error handler, vite dev middleware.
- `server/routes.ts` — **all 61 HTTP routes in a single ~3.4k-line file**. See [[20-Backend/API-Endpoints]].
- `server/storage.ts` — data-access layer wrapping Drizzle (`storage.*` methods); routes never touch `db` directly.
- `server/services/` — external integrations (Asaas, SendGrid, S3, Lambda, QR). See [[20-Backend/Services-Overview]].
- `server/middleware/` — `auth.ts` (`authenticateToken`, `requireEmailVerification`), `errorHandler.ts`.
- `server/workers/emailWorker.ts` — polls `email_queue`, sends via SendGrid, retries. See [[20-Backend/Workers-and-Middleware]].
- `server/print/printCoordinator.ts` — WebSocket coordinator for badge printing. See [[20-Backend/Print-Coordinator]].
- `server/utils/finalizeOrderPaidLikeWebhook.ts` — shared payment finalization used by webhook and manual status check. After `paid`, `sendPurchaseConfirmationEmail` sends a QR ticket (presencial) or the meeting URL (online), with optional `confirmation_email_html` injected. See [[20-Backend/Event-Modality]].

## Key patterns
- **DB-backed job queues** everywhere (`email_queue`, `mass_send_jobs`, `reminder_jobs`, `communicate_jobs`, `print_jobs`): status enum `pending|processing|completed|failed`, attempts counter. No Redis in practice.
- **Webhook-driven payment finalization**: Asaas webhook and `POST /api/orders/:id/check-status` both funnel into `finalizeOrderPaidLikeWebhook`.
- **Event modality**: `events.modality` (`presencial` default | `online`). Online skips QR, e-mails `meeting_url`, and shows meeting + optional WhatsApp on Meus Ingressos after confirmation (secret: stripped from public GET). [[20-Backend/Event-Modality]].
- **Zod at the edge**: drizzle-zod insert schemas validate request bodies.
- **Admin gating**: `authenticateToken` + in-handler `isAdmin` check (no dedicated admin middleware).
- **Placeholders in email templates**: `{nome}`, `{evento}`, `{data}`, `{link}` replaced per recipient.

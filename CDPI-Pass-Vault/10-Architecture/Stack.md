# Stack

## Frontend (client/)
| Concern | Choice |
|---|---|
| Framework | React 18 + TypeScript, Vite build |
| UI | shadcn/ui over Radix primitives, Tailwind CSS |
| Rich text | TipTap (email template editors) |
| Server state | TanStack Query v5 |
| Routing | Wouter (~30 routes in `client/src/App.tsx`) |
| Forms | React Hook Form + Zod resolvers |
| Tests | Vitest (`vitest.client.config.ts`) |

## Backend (server/)
| Concern | Choice |
|---|---|
| API | Express + TypeScript (ESM; tsx in dev, tsup build) |
| ORM | Drizzle ORM (`shared/schema.ts`), Neon serverless driver (`@neondatabase/serverless` + ws) |
| Auth | JWT (jsonwebtoken) + email verification via 6-digit codes |
| Payments | Asaas (Brazilian gateway: PIX, Boleto, Credit Card) |
| Email | SendGrid via DB-backed queue (`email_queue`) + separate worker process |
| Files | AWS S3 (QR codes, certificate templates, generated certificates) |
| Certificates | AWS Lambda fills .docx → PDF |
| Realtime | `ws` WebSocketServer for badge print terminal |
| Tests | Vitest (`vitest.server.config.ts`) |

## Shared (shared/)
- `schema.ts`: Drizzle tables + relations + drizzle-zod insert schemas + types. **Single source of truth** for DB shape.
- `eventModality.ts`: `isOnlineEvent`, `publicEventLocationLabel` (public copy never includes the meeting or WhatsApp URL).
- `npsAnswerSchemas.ts`, `npsExcel.ts`: NPS validation + Excel export helpers.

## Commands
```bash
npm run dev              # dev server (API + vite middleware)
npm run dev:worker       # email worker
npm run build            # tsup (server) + vite (client) → dist/
npm run check            # tsc
npm run test:frontend | test:backend
```
DB: **never** `db:push` / `db:generate` / `db:seed` — see [[40-Database/Migration-Workflow]].

## Notable non-choices
- No Redis/Celery despite env vars existing: all queues are Postgres tables.
- No React Router / Redux: Wouter + TanStack Query cover routing and server state.

# API Endpoints

All routes live in `server/routes.ts` (61 routes). Auth column: 🔓 public, 🔑 JWT (`authenticateToken`), 👑 JWT + `isAdmin` check inside handler, ✉️ JWT + `requireEmailVerification`.

## Auth
| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/auth/register` | 🔓 | Create user (Zod `insertUserSchema`), send 6-digit verification code. `email` is trimmed and stored lowercase; `User@Example.COM` and `user@example.com` are the same mailbox. Invalid address is 400 `Email inválido`. A mailbox that already exists in any casing is 400 `Email já cadastrado` (including a unique-constraint race), for Brazilian and foreign accounts. `isForeigner: false` (default) requires a checksum-valid CPF (`CPF inválido` / `CPF já cadastrado`) and no passport. `isForeigner: true` requires `foreignDocument` (5–32 letters or digits, stored uppercase) and a null CPF (`Documento já cadastrado` on duplicate). Sending both documents, or neither, is 400. `occupation`, `partnerCompany`, and `areaOfActivity` are required trimmed strings of 2–255 characters (`Cargo que ocupa é obrigatório` / `Empresa que trabalha é obrigatória` / `Área de Atuação é obrigatória`). Missing, blank, whitespace-only, or null is 400. Those three values are stored as entered (no title case) |
| POST | `/api/auth/verify-code` | 🔓 | Verify email with 6-digit code |
| POST | `/api/auth/resend-code` | 🔓 | Resend verification code |
| POST | `/api/auth/login` | 🔓 | Login, returns JWT. Email is trimmed and lowercased before lookup, so mixed-case input still finds the account. `Email ou senha incorretos` means the mailbox or password is actually wrong |
| GET | `/api/auth/me` | 🔑 | Current user profile |
| GET | `/api/auth/verify-email` | 🔓 | Legacy link-based email verification |
| POST | `/api/auth/forgot-password` | 🔓 | Send reset email |
| POST | `/api/auth/reset-password` | 🔓 | Reset with token |
| POST | `/api/auth/resend-verification` | 🔑 | Resend verification for logged user |
| POST | `/api/admin/generate-reset-link` | 👑 | Admin generates password reset link for a user |

## Events (public)
| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/events` | 🔓 | List active events (`meeting_url`, `meeting_password`, `whatsapp_group_url`, `confirmation_email_html` omitted) |
| GET | `/api/events/:id` | 🔓 | Event details (same secrets omitted) |
| POST | `/api/events/:id/subscribe` | 🔑 | Free inscription (no Asaas). QR if presencial; meeting-link e-mail if online. A Brazilian without CPF gets 400 `Complete seu CPF no perfil antes de se inscrever.` A foreigner is checked by passport and user id instead. Response includes `whatsappGroupUrl` (string or null) so the client can open the group tab. Does not include the meeting URL or meeting password |

## Admin: events
| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/admin/events` | 👑 | List all events (incl. inactive) |
| POST | `/api/admin/events` | 👑 | Create event (multipart, image upload → S3). Fields include `modality` (`presencial`\|`online`), `meeting_url` (required when online), optional `meeting_password` (online only; trim; blank stores NULL; max 100; any characters), optional `whatsapp_group_url` (online only), optional `confirmation_email_html` (TipTap; empty = default confirmation e-mail), optional `courtesy_limit` (integer ≥ 1; omit or blank = no cap). Presencial stores `meeting_password` as NULL even if one was sent |
| GET | `/api/admin/events/:eventId` | 👑 | Event detail (admin view; includes `meetingUrl`, `meetingPassword`, `whatsappGroupUrl`, `confirmationEmailHtml`) |
| PATCH | `/api/admin/events/:eventId` | 👑 | Update event (same `modality` / `meeting_url` / `meeting_password` / `whatsapp_group_url` rules; presencial clears meeting URL, meeting password, and WhatsApp URL; empty `meeting_password` stores NULL; `confirmation_email_html` optional on any modality). Optional `courtesy_limit`: blank stores NULL. If the saved cap is already ≤ paid courtesy orders, every courtesy link for the event is set inactive. Raising or clearing the cap does not turn links back on |
| DELETE | `/api/admin/events/:eventId` | 👑 | Delete event |
| GET | `/api/admin/events/:eventId/participants` | 👑 | Participant list (paid orders joined users). Each row has `hasQrCode` (boolean only; the PNG is not in the list). `?ticketId=<uuid>` returns `{ qrCodeData }` for that paid order on this event when the stored value is a non-empty `data:image/png;base64,` payload; otherwise 404. A non-UUID `ticketId` is 400 |
| GET | `/api/admin/events/:eventId/commercial-sales` | 👑 | Sales report |

## Admin: email templates + mass sends (per event)
| Method | Path | Auth | Purpose |
|---|---|---|---|
| PATCH | `/api/admin/events/:eventId/courtesy-template` | 👑 | Save courtesy email HTML + subject |
| GET/PATCH | `/api/admin/events/:eventId/reminder-template` | 👑 | Reminder email template |
| GET | `/api/admin/events/:eventId/courtesy-unredeemed-total` | 👑 | Count of unredeemed courtesies |
| POST | `/api/admin/events/:eventId/reminder-send` | 👑 | Enqueue reminder job |
| GET/PATCH | `/api/admin/events/:eventId/communicate-template` | 👑 | Communicate (announcement) template |
| GET | `/api/admin/events/:eventId/communicate-recipient-counts` | 👑 | Recipient counts per mode |
| POST | `/api/admin/events/:eventId/communicate-send` | 👑 | Enqueue communicate job |
| GET/PATCH | `/api/admin/events/:eventId/mass-send-recipients` | 👑 | View/edit CSV recipients for mass send. GET also returns `courtesyLimit` and `courtesyRedeemedCount`. PATCH `{ isActive: true }` returns 400 `Limite de cortesias do evento atingido` while redeemed ≥ cap |
| POST | `/api/admin/events/:eventId/courtesy/mass-send` | 👑 | Enqueue courtesy mass-send for event |
| POST | `/api/admin/courtesy/mass-send` | 👑 | Enqueue courtesy mass-send (CSV upload) |

## Admin: NPS
| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/admin/events/:eventId/nps` | 👑 | NPS responses summary |
| GET | `/api/admin/events/:eventId/nps/export` (line ~1307) | 👑 | Excel export (`shared/npsExcel.ts`) |
| PATCH | `/api/admin/events/:eventId/nps-type` (line ~1380) | 👑 | Switch `cdpi_event` / `cdpi_apoiando` |

## Admin: print (badge printing)
| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/admin/events/:eventId/print-settings` | 👑 | Auto-print toggle state |
| PATCH | `/api/admin/events/:eventId/print-settings` | 👑 | Enable/disable auto-print |
| GET | `/api/admin/events/:eventId/print-history` | 👑 | Print job history |
| POST | manual print job route (~line 2083) | 👑 | Queue manual badge print |
| WS | `/ws/print?token=&eventId=` | 🔑 | Terminal socket, see [[20-Backend/Print-Coordinator]] |

## Admin: courtesy links & quotas
| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/admin/courtesy-links` | 👑 | Lookup one link by `code`. Includes `courtesyLimit` and `courtesyRedeemedCount` |
| PATCH | `/api/admin/events/:eventId/courtesy-links/:linkId` | 👑 | Edit link (count, active). `isActive: true` returns 400 while the event courtesy cap is reached. Deactivating stays allowed |
| GET | `/api/admin/events/:eventId/courtesy-links/:linkId/redemptions` | 👑 | Redemption list |

## Admin: orders & check-in
| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/admin/tickets/:ticketId/check-in` | 👑 | Manual check-in |
| POST | `/api/admin/orders/:id/cancel` | 👑 | Cancel order |
| POST | `/api/admin/orders/:id/mark-paid-external` | 👑 | Mark paid (payment outside Asaas) |
| POST | `/api/admin/orders/:id/undo-check-in` | 👑 | Undo check-in |
| POST | `/api/verify-ticket` | 👑 | QR scan validation + use increment (+ print job) |
| POST | `/api/make-admin/:userId` | 👑 | Grant admin |

## Orders & payments (user)
| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/orders` | 🔑 | Create order → Asaas payment (PIX/Boleto/Card for Brazilians). A foreigner may only send `credit_card`; the charge is one international card invoice, not a payment link. QR generated only if the event is presencial. Charge failure deletes the pending order and answers **503** `{code:"foreign_payment_unavailable"}` when Asaas refuses foreign payers (message carries the CDPI contact), **502** `{code:"payment_provider_error"}` for any other Asaas HTTP error, **500** otherwise |
| GET | `/api/orders` | ✉️ | My orders. Nested event includes `modality`. `meetingUrl`, `meetingPassword`, and `whatsappGroupUrl` only for `paid`/`courtesy` online orders; omitted otherwise. Never includes `confirmationEmailHtml` |
| GET | `/api/orders/:id` | 🔑 | Order detail |
| POST | `/api/orders/:id/check-status` | 🔑 | Poll Asaas payment status |
| DELETE | `/api/orders/:id/cancel` | 🔑 | Cancel own pending order |
| POST | `/api/webhooks/asaas` | 🔓 (token header) | Asaas payment webhook → finalize order |

## Profile
| Method | Path | Auth | Purpose |
|---|---|---|---|
| PUT | `/api/profile` | 🔑 | Update profile (allowlist: name, email, phone, address, birthDate, occupation, partnerCompany, areaOfActivity). When present, occupation, partnerCompany, and areaOfActivity are trimmed strings of 2–255 characters; null and blank are 400. `email` is trimmed and stored lowercase. Changing it to a mailbox another user already has, in any casing, is 400 `Email já cadastrado`. A save that only changes email casing is the same mailbox and does not require the current password. Password is required only to change name, email (a different mailbox), or phone. Unknown keys, including `isAdmin`, are stripped |
| PUT | `/api/profile/password` | 🔑 | Change password |
| DELETE | `/api/profile` | 🔑 | Delete account |

## Courtesy (user-facing)
| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/courtesy-links` | 👑 | Create courtesy link. `redeemUrl` is `{origin}/event/{eventId}?cortesia={code}` when `overridePrice` is null, or `{origin}/event/{eventId}?promo={code}` when set. 400 when the event courtesy cap is already reached |
| GET | `/api/courtesy-links` | 👑 | List own created links. Each row's `redeemUrl` uses the same `?cortesia=` / `?promo=` rule as create |
| GET | `/api/courtesy-links/:code` | 🔓 | Public resolve for the event page and for logged-out `/cortesia?code=`. 404 missing, 400 inactive or exhausted. Does not require a session |
| POST | `/api/courtesy/redeem` | 🔑 | Redeem courtesy → paid order (same QR vs meeting-link split as purchase). `isForeigner: true` sends `foreignDocument` instead of `cpf`. Unchanged: rejects `overridePrice` codes, does not check `salesClosed`. Counts one paid courtesy order. The redeem that reaches `events.courtesy_limit` succeeds and then deactivates every courtesy link for the event. A later redeem returns 400 `Limite de cortesias do evento atingido`. NULL limit means no cap |

## Certificates & NPS (user)
| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/admin/events/:eventId/certificate-template` | 👑 | Upload .docx template → S3 (multer field `file`, .docx only) → 201 |
| POST | NPS submit routes (~line 3044, 3102) | 🔑 | Submit NPS answers (event / apoiando) |
| GET | `/api/users/me/certificates` | 🔑 | My certificates (presigned URLs, 900s) |
| POST | `/api/certificates/generate` | 🔑 | NPS answers + Lambda → PDF cert; 201/400/409/502/503, see [[20-Backend/Certificates]] |

Event format (presencial vs online, secret meeting URL, confirmation e-mails): [[20-Backend/Event-Modality]].

Eligibility rules, Lambda contract and the full status-code table: [[20-Backend/Certificates]].

> When routes change, update this note. Exact line numbers drift; grep `app.(get|post|put|patch|delete)` in `server/routes.ts` to re-verify (currently 61 matches).

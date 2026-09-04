# API Endpoints

All routes live in `server/routes.ts` (61 routes). Auth column: 🔓 public, 🔑 JWT (`authenticateToken`), 👑 JWT + `isAdmin` check inside handler, ✉️ JWT + `requireEmailVerification`.

## Auth
| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/auth/register` | 🔓 | Create user (Zod `insertUserSchema`), send 6-digit verification code |
| POST | `/api/auth/verify-code` | 🔓 | Verify email with 6-digit code |
| POST | `/api/auth/resend-code` | 🔓 | Resend verification code |
| POST | `/api/auth/login` | 🔓 | Login, returns JWT |
| GET | `/api/auth/me` | 🔑 | Current user profile |
| GET | `/api/auth/verify-email` | 🔓 | Legacy link-based email verification |
| POST | `/api/auth/forgot-password` | 🔓 | Send reset email |
| POST | `/api/auth/reset-password` | 🔓 | Reset with token |
| POST | `/api/auth/resend-verification` | 🔑 | Resend verification for logged user |
| POST | `/api/admin/generate-reset-link` | 👑 | Admin generates password reset link for a user |

## Events (public)
| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/events` | 🔓 | List active events |
| GET | `/api/events/:id` | 🔓 | Event details |

## Admin: events
| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/admin/events` | 👑 | List all events (incl. inactive) |
| POST | `/api/admin/events` | 👑 | Create event (multipart, image upload → S3) |
| GET | `/api/admin/events/:eventId` | 👑 | Event detail (admin view) |
| PATCH | `/api/admin/events/:eventId` | 👑 | Update event |
| DELETE | `/api/admin/events/:eventId` | 👑 | Delete event |
| GET | `/api/admin/events/:eventId/participants` | 👑 | Participant list (orders joined users) |
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
| GET/PATCH | `/api/admin/events/:eventId/mass-send-recipients` | 👑 | View/edit CSV recipients for mass send |
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
| GET | `/api/admin/courtesy-links` | 👑 | All links w/ usage |
| PATCH | `/api/admin/events/:eventId/courtesy-links/:linkId` | 👑 | Edit link (count, active, price) |
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
| POST | `/api/orders` | 🔑 | Create order → Asaas payment (PIX/Boleto/Card) |
| GET | `/api/orders` | ✉️ | My orders |
| GET | `/api/orders/:id` | 🔑 | Order detail |
| POST | `/api/orders/:id/check-status` | 🔑 | Poll Asaas payment status |
| DELETE | `/api/orders/:id/cancel` | 🔑 | Cancel own pending order |
| POST | `/api/webhooks/asaas` | 🔓 (token header) | Asaas payment webhook → finalize order |

## Profile
| Method | Path | Auth | Purpose |
|---|---|---|---|
| PUT | `/api/profile` | 🔑 | Update profile |
| PUT | `/api/profile/password` | 🔑 | Change password |
| DELETE | `/api/profile` | 🔑 | Delete account |

## Courtesy (user-facing)
| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/courtesy-links` | 👑 | Create courtesy link |
| GET | `/api/courtesy-links` | 👑 | List own created links |
| GET | `/api/courtesy-links/:code` | 🔓 | Resolve link for redeem page |
| POST | `/api/courtesy/redeem` | 🔑 | Redeem courtesy → paid order |

## Certificates & NPS (user)
| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/admin/events/:eventId/certificate-template` | 👑 | Upload .docx template → S3 (multer field `file`, .docx only) → 201 |
| POST | NPS submit routes (~line 3044, 3102) | 🔑 | Submit NPS answers (event / apoiando) |
| GET | `/api/users/me/certificates` | 🔑 | My certificates (presigned URLs, 900s) |
| POST | `/api/certificates/generate` | 🔑 | NPS answers + Lambda → PDF cert; 201/400/409/502/503, see [[20-Backend/Certificates]] |

Eligibility rules, Lambda contract and the full status-code table: [[20-Backend/Certificates]].

> When routes change, update this note. Exact line numbers drift; grep `app.(get|post|put|patch|delete)` in `server/routes.ts` to re-verify (currently 61 matches).

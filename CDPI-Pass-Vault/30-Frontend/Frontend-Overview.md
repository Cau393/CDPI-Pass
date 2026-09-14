# Frontend Overview

`client/src/` — React SPA. Entry: `main.tsx` → `App.tsx` (Wouter routes).

## Structure
- `pages/` — 33 page components
- `components/` — shared components + `components/ui/` (shadcn)
- `hooks/` — custom hooks (auth, toast, etc.)
- `lib/` — query client, API helpers, utils
- `test/` — Vitest setup + client tests

## Routes (Wouter, `App.tsx`)

### Public
| Route | Page |
|---|---|
| `/` | HomePage |
| `/eventos` | EventsPage |
| `/event/:id` | EventDetailsPage |
| `/login`, `/register` | Login / Register |
| `/forgot-password`, `/reset-password` | Password recovery |
| `/verify-email` | VerifyCodePage (6-digit code) |
| `/cortesia` | CourtesyRedeemPage (courtesy link redemption) |

### User
| Route | Page |
|---|---|
| `/profile` | ProfilePage (orders, certificates, account) |

### Admin (gated by isAdmin; wrapped routes in App.tsx)
| Route | Page |
|---|---|
| `/admin/events` (+ `/new`, `/:id`) | Events list / create / edit |
| `/admin/events/certificate-template` | CertificateTemplateAdminPage |
| `/admin/events/nps` | AdminNpsPage |
| `/admin/verificar` | QRScannerPage (check-in) |
| `/admin/participants` | AdminParticipantsPage |
| `/admin/comercial/vendas` | AdminCommercialSalesPage |
| `/admin/templates` | AdminTemplatesHubPage (courtesy/reminder/communicate editors) |
| `/admin/comunicado/envio-em-massa` | AdminCommunicateMassSendPage |
| `/admin/cortesias` (+ `/envio-em-massa`, `/limite`, `/resgates/:linkId`) | Courtesy hub / mass send / quota / redemptions |
| `/admin/courtesy-quota` (+ `/resgates/:linkId`) | AdminCourtesyQuotaPage |
| `/admin/print-terminal` | AdminPrintTerminalPage (WebUSB Zebra + WebSocket) |
| `/admin-test` | AdminTestPage |

## Event covers (`EventCoverImage`)
Home-page main event poster (`HomePage` hero, `data-testid="img-main-event"`). One clean `object-contain` image in a 16:9 frame with no duplicate or blur. The card stacks on phones and switches to a compact 55/45 image-details layout from `md`; its description is converted to plain text, capped at 90 characters with `…`, and visually clamped to two lines because full details live at `/event/:id`. See [[60-Decisions/ADR-007-home-event-cover-contain]]. The `/event/:id` hero uses the same component and frame; only sidebar/listing thumbnails still crop with `object-cover`.

For events explicitly marked `isFree`, the home card displays `Grátis`, omits the convenience-fee label, and labels its CTA `Se Inscrever`. Paid events continue to display their price, `+ taxa de conveniência`, and `Comprar Ingresso`.

## Event modality (presencial / online)
Admin create/edit (`EventFormFields`) has a Presencial/Online radio, a conditional **Link da reunião** and optional **Link do grupo no WhatsApp** (online only), and an optional **Mensagem extra no e-mail de confirmação** TipTap editor (all modalities; same stack as cortesia/lembrete/comunicado). Public pages (`HomePage`, `EventsPage`, `EventDetailsPage`, `EventCard`, `PaymentModal`) use `publicEventLocationLabel` from `shared/eventModality.ts`: badge **Evento Online**, location line **Online**, never the meeting or WhatsApp URL. After **free subscribe**, if the 201 includes `whatsappGroupUrl`, `EventDetailsPage` calls `window.open` (`noopener,noreferrer`); a blocked popup toasts to use Meus Ingressos. Confirmed online tickets on Profile (`paid` / `courtesy`) show **Acessar reunião** (`event.meetingUrl`) and, when set, **Entrar no grupo**. Pending paid orders show neither. Confirmation e-mail still goes out. Full flow: [[20-Backend/Event-Modality]] · [[60-Decisions/ADR-010-online-vs-presencial]].

## Event description (rich text)
Stored as a sanitised HTML subset (`p, br, strong, b, em, i, u`; `client/src/lib/eventDescriptionHtml.ts`). Legacy rows are plain text with `\n` and are converted to `<p>` on first edit. The TipTap editor emits `<p>text<br></p>` for a hard break at the end of a paragraph and *shows* it as a blank line; browsers do not (measured: 2px gap, identical to no break, while a blank `<p></p>` gives 22px). `EventDescriptionDisplay` therefore renders through `prepareDescriptionHtmlForDisplay`, which turns each trailing `<br>` into an empty `<p></p>` (height `min-h-[1.3em]`; the `lh` unit is unsupported before iOS 16.4). Never render `event.description` with raw `dangerouslySetInnerHTML`; always go through that component.

## Conventions
- **Server state**: TanStack Query; mutations invalidate queries. Query keys mirror API paths.
- **Forms**: React Hook Form + Zod schemas (shared with backend via `shared/schema.ts` where possible).
- **UI**: shadcn/ui components in `components/ui/`; add via shadcn CLI, do not hand-edit generated primitives heavily.
- **Rich text**: TipTap editors for email templates (color, link, text-align extensions).
- **Language**: UI text in Brazilian Portuguese; validation messages PT-BR.
- **Contact**: `shared/contact.ts` is the only source of the support e-mail and phones. Public ticket pages (`/`, `/eventos`, `/event/:id`, `/cortesia`) render `SiteFooter`; courtesy help text uses `ContactChannels`. See [[60-Decisions/ADR-009-canonical-contact]].
- **Auth**: JWT stored client-side; `authenticateToken`-protected calls attach Bearer header via lib helper.
- **Downloads / file viewing**: see [[60-Decisions/ADR-008-mobile-downloads]] — never `window.open` and never a detached data-URL anchor; most customers arrive from a WhatsApp in-app browser.

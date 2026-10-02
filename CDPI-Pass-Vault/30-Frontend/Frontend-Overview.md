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
| `/event/:id` | EventDetailsPage (`?promo=` checkout, `?cortesia=` free redeem) |
| `/login`, `/register` | Login / Register. Register requires **Cargo que ocupa** and **Empresa que trabalha** (after Endereço Completo, before Senha). Empty submit shows both field errors. Labels have no asterisk |
| `/forgot-password`, `/reset-password` | Password recovery |
| `/verify-email` | VerifyCodePage (6-digit code) |
| `/cortesia` | CourtesyRedeemPage (manual code, or the attendee form after the guest chooses to redeem) |

### User
| Route | Page |
|---|---|
| `/profile` | ProfilePage (orders, certificates, account). The profile tab shows **Cargo que ocupa** and **Empresa que trabalha** so a backfilled `Nao aplicavel` can be replaced. Those two fields are not password-gated |

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

On `/admin/participants`, a row with `hasQrCode` shows **Baixar QR Code**. The click loads that ticket from the same participants route (`?ticketId=`) and saves the PNG with `downloadDataUrl` (`ingresso-<ticketId>.png`). The image is not kept in the participants query cache. Rows without a QR have no button.

## Event covers (`EventCoverImage`)
Home-page main event poster (`HomePage` hero, `data-testid="img-main-event"`). One clean `object-contain` image in a 16:9 frame with no duplicate or blur. The card stacks on phones and switches to a compact 55/45 image-details layout from `md`; its description is converted to plain text, capped at 90 characters with `…`, and visually clamped to two lines because full details live at `/event/:id`. See [[60-Decisions/ADR-007-home-event-cover-contain]]. The `/event/:id` hero uses the same component and frame; only sidebar/listing thumbnails still crop with `object-cover`.

For events explicitly marked `isFree`, every public surface shows `Grátis` and omits the convenience-fee line entirely (Home hero, Home sidebar, `/eventos`, `/event/:id`). The primary CTA is `Confirmar inscrição` and calls `POST /api/events/:id/subscribe` in place via `useFreeSubscribe` (Home hero and Event Details share the hook). Paid events continue to display their price, `+ taxa de conveniência` (Home) / `+ taxa de conveniência de R$ 5,00` (Event Details), and `Comprar Ingresso`. Copy helpers live in `client/src/lib/eventCta.ts` so labels cannot drift. On Meus Ingressos, free-event orders (`paymentMethod: "free"`) show `Grátis` and `Inscrito em`, not `R$ 0,00` / `Comprado em`.

## Free courtesy entry
A free courtesy link (`courtesy_links.override_price` null) opens `/event/:eventId?cortesia=CODE`. The page still renders the event from `GET /api/events/:id` (`toPublicEvent` / `publicEventLocationLabel`); the courtesy payload is only used to decide the offer. The price reads **Cortesia** (no convenience fee) and the CTA is **Resgatar cortesia**. Closed sales do not disable that button. A full event still shows **Evento Esgotado**. An existing paid order for the event still shows **Você já possui inscrição confirmada** and stays disabled. An invalid, inactive, or exhausted code shows the API message, or **Este código de cortesia não é válido ou já foi utilizado.**, and does not fall through to **Comprar Ingresso**.

Logged out, the CTA toasts **Faça login ou cadastre-se para resgatar a cortesia.** and goes to `/login?next=` with the cortesia query kept (`getValidatedNextPath` allows a single `?cortesia=` code). After login or register, the guest is back on the event page; the form does not open and redeem is not posted. Logged in, the CTA goes to `/cortesia?code=CODE`, the existing attendee form (empresa parceira and cargo stay there). Submit is still `POST /api/courtesy/redeem`.

`/cortesia?code=CODE` from older mail, while logged out, loads `GET /api/courtesy-links/:code` and replaces the location with the event URL (`?cortesia=` or `?promo=` when `overridePrice` is set). It does not send the visitor to login on load. The manual code box (nav **Resgatar cortesia**) stays; **Continuar** resolves the code and opens the event page. A code with `overridePrice` on the event page is rewritten to `?promo=CODE` and uses the existing buy path, never redeem.

Copy for the courtesy price, CTA, login toast, and invalid-code sentence lives in `client/src/lib/eventCta.ts`. See [[60-Decisions/ADR-012-courtesy-event-before-register]].

## Courtesy redeem cap
Admin create and edit (`EventFormFields`, label **Limite total de cortesias**) share an optional numeric field. Blank means no cap. On the cortesia quota lookup and the mass-send recipient list, **Ativar** stays disabled while paid courtesy redeems are at or above that cap. Raising the number on the event form only unlocks the button; it does not turn links back on. See [[60-Decisions/ADR-011-courtesy-redeem-limit]].

## Event modality (presencial / online)
Admin create/edit (`EventFormFields`) has a Presencial/Online radio, a conditional **Link da reunião** and optional **Link do grupo no WhatsApp** (online only), and an optional **Mensagem extra no e-mail de confirmação** TipTap editor (all modalities; same stack as cortesia/lembrete/comunicado). Public pages (`HomePage`, `EventsPage`, `EventDetailsPage`, `EventCard`, `PaymentModal`) use `publicEventLocationLabel` from `shared/eventModality.ts`: badge **Evento Online**, location line **Online**, never the meeting or WhatsApp URL. After **free subscribe** (Home hero or Event Details, both via `useFreeSubscribe`), if the 201 includes `whatsappGroupUrl`, the client calls `window.open` (`noopener,noreferrer`); a blocked popup toasts to use Meus Ingressos. Confirmed online tickets on Profile (`paid` / `courtesy`) show **Acessar reunião** (`event.meetingUrl`) and, when set, **Entrar no grupo**. Pending paid orders show neither. Confirmation e-mail still goes out. Full flow: [[20-Backend/Event-Modality]] · [[60-Decisions/ADR-010-online-vs-presencial]].

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
- **Downloads / file viewing**: see [[60-Decisions/ADR-008-mobile-downloads]] — never `window.open` and never a detached data-URL anchor for QR/certificates; most customers arrive from a WhatsApp in-app browser. Exception: after **free subscribe**, `EventDetailsPage` tries `window.open` on the WhatsApp group URL (user just clicked Confirm); if the popup is blocked, Meus Ingressos still has a real `<a target="_blank">`.

# ADR-002: Asaas as payment gateway

- **Date**: recorded 2026-09-01 (decision predates)
- **Status**: accepted

## Context
Brazilian audience needs PIX and Boleto, not just cards. Stripe's BR coverage of PIX/Boleto and local settlement was weaker.

## Decision
Asaas (Brazilian gateway) for PIX, Boleto and Credit Card. Server creates customer + payment; confirmation arrives via webhook (`POST /api/webhooks/asaas`, validated by `ASAAS_WEBHOOK_TOKEN`) or user-triggered polling (`POST /api/orders/:id/check-status`). Both paths finalize through `finalizeOrderPaidLikeWebhook`.

## Consequences
- Brazilian CPF is required and validated (`000.000.000-00`), stored on users and orders. Foreign accounts skip CPF and pay with one international card charge. See [[60-Decisions/ADR-014-foreigner-without-cpf]].
- Payment state machine kept minimal: `pending → paid | cancelled`.
- Sandbox/prod switched by `ASAAS_API_URL` + key.
- Admin escape hatch exists for external payments: `mark-paid-external`.

## Update 2026-10-29 (ADR-017, superseded in part)
- The credit card is now also charged **inline through the API** (`POST /payments` with `creditCard` + `creditCardHolderInfo`, Turnstile on every submit; SAQ-D accepted). The Asaas card link (hosted page) remains where it was: foreigners and the other paths. See [[60-Decisions/ADR-017-guest-checkout-inline-card]].
- The webhook now stores `asaas_payment_id` when the order has none (never overwrites). Refund and chargeback events are still ignored ([[70-Operations/Security-Backlog]] #28).

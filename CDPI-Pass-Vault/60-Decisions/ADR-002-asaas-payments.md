# ADR-002: Asaas as payment gateway

- **Date**: recorded 2026-09-01 (decision predates)
- **Status**: accepted

## Context
Brazilian audience needs PIX and Boleto, not just cards. Stripe's BR coverage of PIX/Boleto and local settlement was weaker.

## Decision
Asaas (Brazilian gateway) for PIX, Boleto and Credit Card. Server creates customer + payment; confirmation arrives via webhook (`POST /api/webhooks/asaas`, validated by `ASAAS_WEBHOOK_TOKEN`) or user-triggered polling (`POST /api/orders/:id/check-status`). Both paths finalize through `finalizeOrderPaidLikeWebhook`.

## Consequences
- CPF is required and validated (`000.000.000-00`), stored on users and orders.
- Payment state machine kept minimal: `pending → paid | cancelled`.
- Sandbox/prod switched by `ASAAS_API_URL` + key.
- Admin escape hatch exists for external payments: `mark-paid-external`.

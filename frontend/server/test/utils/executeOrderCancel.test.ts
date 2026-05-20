import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Order, User, Event } from "@shared/schema";

const getOrder = vi.fn();
const discardPendingOrder = vi.fn();
const cancelPaidOrderAndInvalidateQr = vi.fn();
const getUser = vi.fn();
const getEvent = vi.fn();
const addEmailToQueue = vi.fn();
const cancelPayment = vi.fn();

vi.mock("../../storage", () => ({
  storage: {
    getOrder: (...a: unknown[]) => getOrder(...a),
    discardPendingOrder: (...a: unknown[]) => discardPendingOrder(...a),
    cancelPaidOrderAndInvalidateQr: (...a: unknown[]) =>
      cancelPaidOrderAndInvalidateQr(...a),
    getUser: (...a: unknown[]) => getUser(...a),
    getEvent: (...a: unknown[]) => getEvent(...a),
    addEmailToQueue: (...a: unknown[]) => addEmailToQueue(...a),
  },
}));

vi.mock("../../services/asaasService", () => ({
  asaasService: {
    cancelPayment: (...a: unknown[]) => cancelPayment(...a),
  },
}));

import {
  buildOrderCancelSuccessMessage,
  executeOrderCancel,
} from "../../utils/executeOrderCancel";

function baseOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: "pending-order-id",
    userId: "user-1",
    eventId: "evt-1",
    cpf: "123.456.789-00",
    status: "pending",
    paymentMethod: "credit_card",
    amount: "100.00",
    asaasPaymentId: null,
    courtesyLinkId: null,
    courtesyAttendeeId: null,
    qrCodeData: "qr",
    qrCodeUsed: false,
    qrCodeUsedAt: null,
    maxUses: 1,
    amntUsed: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    qr_code_s3_url: null,
    ...overrides,
  };
}

describe("buildOrderCancelSuccessMessage", () => {
  it("returns distinct messages for pending vs paid", () => {
    const p = buildOrderCancelSuccessMessage("pending");
    const paid = buildOrderCancelSuccessMessage("paid");
    expect(p).toBe("Pedido pendente removido com sucesso.");
    expect(paid).toBe(
      "Inscrição cancelada com sucesso. O QR Code foi invalidado e um e-mail foi enfileirado.",
    );
    expect(p).not.toBe(paid);
  });
});

describe("executeOrderCancel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("pending: calls Asaas when asaasPaymentId present, discardPendingOrder, no email", async () => {
    const o = baseOrder({
      asaasPaymentId: "pay-xyz",
      qr_code_s3_url: "https://bucket/key",
    });
    getOrder.mockResolvedValue(o);
    cancelPayment.mockResolvedValue(undefined);
    const cancelledRow = baseOrder({
      ...o,
      status: "cancelled",
      qrCodeData: null,
      qr_code_s3_url: null,
    });
    discardPendingOrder.mockResolvedValue({ ok: true, order: cancelledRow });

    const r = await executeOrderCancel(o.id, { actor: "admin" });

    expect(cancelPayment).toHaveBeenCalledWith("pay-xyz");
    expect(discardPendingOrder).toHaveBeenCalledWith(o.id);
    expect(cancelPaidOrderAndInvalidateQr).not.toHaveBeenCalled();
    expect(addEmailToQueue).not.toHaveBeenCalled();
    expect(r).toEqual({
      ok: true,
      message: "Pedido pendente removido com sucesso.",
    });
  });

  it("pending: skips cancelPayment when no asaasPaymentId", async () => {
    const o = baseOrder({ asaasPaymentId: null });
    getOrder.mockResolvedValue(o);
    discardPendingOrder.mockResolvedValue({
      ok: true,
      order: baseOrder({ ...o, status: "cancelled", qrCodeData: null }),
    });

    await executeOrderCancel(o.id, { actor: "admin" });

    expect(cancelPayment).not.toHaveBeenCalled();
    expect(discardPendingOrder).toHaveBeenCalledWith(o.id);
  });

  it("paid: calls cancelPaidOrderAndInvalidateQr and enqueues email when buyer has email", async () => {
    const o = baseOrder({ id: "paid-order", status: "paid" });
    getOrder.mockResolvedValue(o);
    const cancelledRow = baseOrder({
      ...o,
      status: "cancelled",
      qrCodeData: null,
    });
    cancelPaidOrderAndInvalidateQr.mockResolvedValue({ ok: true, order: cancelledRow });
    getUser.mockResolvedValue({
      id: o.userId,
      email: "buyer@test.com",
      name: "Buyer",
    } as User);
    getEvent.mockResolvedValue({ id: o.eventId, title: "Evento X" } as Event);

    const r = await executeOrderCancel(o.id, { actor: "admin" });

    expect(cancelPaidOrderAndInvalidateQr).toHaveBeenCalledWith(o.id);
    expect(discardPendingOrder).not.toHaveBeenCalled();
    expect(cancelPayment).not.toHaveBeenCalled();
    expect(addEmailToQueue).toHaveBeenCalledTimes(1);
    expect(addEmailToQueue.mock.calls[0][0]).toMatchObject({
      to: "buyer@test.com",
      subject: "Cancelamento de inscrição — CDPI Pass",
    });
    expect(r).toEqual({
      ok: true,
      message:
        "Inscrição cancelada com sucesso. O QR Code foi invalidado e um e-mail foi enfileirado.",
    });
  });

  it("paid: succeeds without email when buyer has no email", async () => {
    const o = baseOrder({ status: "paid" });
    getOrder.mockResolvedValue(o);
    cancelPaidOrderAndInvalidateQr.mockResolvedValue({
      ok: true,
      order: baseOrder({ ...o, status: "cancelled", qrCodeData: null }),
    });
    getUser.mockResolvedValue(undefined);
    getEvent.mockResolvedValue({ title: "E" } as Event);

    const r = await executeOrderCancel(o.id, { actor: "admin" });

    expect(addEmailToQueue).not.toHaveBeenCalled();
    expect(r.ok).toBe(true);
  });

  it("duplicate scenario: canceling pending id only touches discardPendingOrder", async () => {
    const pendingId = "pending-only";
    const pending = baseOrder({ id: pendingId, userId: "u1", status: "pending" });
    getOrder.mockImplementation((id: string) => {
      if (id === pendingId) return Promise.resolve(pending);
      return Promise.resolve(undefined);
    });
    discardPendingOrder.mockResolvedValue({
      ok: true,
      order: baseOrder({ ...pending, status: "cancelled", qrCodeData: null }),
    });

    await executeOrderCancel(pendingId, { actor: "admin" });

    expect(discardPendingOrder).toHaveBeenCalledTimes(1);
    expect(discardPendingOrder).toHaveBeenCalledWith(pendingId);
    expect(cancelPaidOrderAndInvalidateQr).not.toHaveBeenCalled();
  });

  it("returns not_found when order missing", async () => {
    getOrder.mockResolvedValue(undefined);
    const r = await executeOrderCancel("missing", { actor: "admin" });
    expect(r).toEqual({ ok: false, code: "not_found" });
    expect(discardPendingOrder).not.toHaveBeenCalled();
  });

  it("returns already_cancelled", async () => {
    getOrder.mockResolvedValue(baseOrder({ status: "cancelled" }));
    const r = await executeOrderCancel("x", { actor: "admin" });
    expect(r).toEqual({ ok: false, code: "already_cancelled" });
  });

  it("returns invalid_status for unknown status", async () => {
    getOrder.mockResolvedValue(
      baseOrder({ status: "weird" as Order["status"] }),
    );
    const r = await executeOrderCancel("x", { actor: "admin" });
    expect(r).toEqual({ ok: false, code: "invalid_status", status: "weird" });
  });

  it("user actor: forbidden when userId mismatch", async () => {
    getOrder.mockResolvedValue(baseOrder({ userId: "owner" }));
    const r = await executeOrderCancel("x", { actor: "user", userId: "other" });
    expect(r).toEqual({ ok: false, code: "forbidden" });
    expect(discardPendingOrder).not.toHaveBeenCalled();
  });

  it("user actor: rejects paid order before storage (invalid_status)", async () => {
    getOrder.mockResolvedValue(baseOrder({ userId: "u", status: "paid" }));
    const r = await executeOrderCancel("x", { actor: "user", userId: "u" });
    expect(r).toEqual({ ok: false, code: "invalid_status", status: "paid" });
    expect(cancelPaidOrderAndInvalidateQr).not.toHaveBeenCalled();
  });

  it("propagates discardPendingOrder failure", async () => {
    const o = baseOrder();
    getOrder.mockResolvedValue(o);
    discardPendingOrder.mockResolvedValue({
      ok: false,
      code: "already_cancelled",
      order: o,
    });

    const r = await executeOrderCancel(o.id, { actor: "admin" });
    expect(r).toEqual({ ok: false, code: "already_cancelled" });
  });
});

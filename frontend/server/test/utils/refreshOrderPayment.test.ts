import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mocks = vi.hoisted(() => ({
  getPayment: vi.fn(),
  getOrder: vi.fn(),
  updateOrder: vi.fn(),
  finalize: vi.fn(),
}));

vi.mock("../../storage", () => ({
  storage: { getOrder: mocks.getOrder, updateOrder: mocks.updateOrder, cancelPendingOrder: vi.fn() },
}));
vi.mock("../../services/asaasService", () => ({ asaasService: { getPayment: mocks.getPayment } }));
vi.mock("../../utils/finalizeOrderPaidLikeWebhook", () => ({ finalizeOrderPaidLikeWebhook: mocks.finalize }));

const { refreshOrderPayment } = await import("../../utils/refreshOrderPayment");

const order = { id: "order-throttle-1", status: "pending", asaasPaymentId: "pay_1" } as any;

beforeEach(() => {
  mocks.getPayment.mockReset();
  mocks.getOrder.mockReset();
  mocks.updateOrder.mockReset();
  mocks.finalize.mockReset();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-28T12:00:00Z"));
});
afterEach(() => vi.useRealTimers());

describe("refreshOrderPayment throttle", () => {
  it("after an Asaas failure an immediate poll asks nothing, and a poll after 3 s asks again", async () => {
    mocks.getPayment.mockRejectedValueOnce(new Error("asaas down"));
    await expect(refreshOrderPayment(order)).rejects.toThrow("asaas down");
    expect(mocks.getPayment).toHaveBeenCalledTimes(1);

    const immediate = await refreshOrderPayment(order);
    expect(immediate.kind).toBe("unchanged");
    expect(mocks.getPayment).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(3_000);
    mocks.getPayment.mockResolvedValueOnce({ id: "pay_1", status: "PENDING" });
    const later = await refreshOrderPayment(order);
    expect(mocks.getPayment).toHaveBeenCalledTimes(2);
    expect(later).toMatchObject({ kind: "unchanged", paymentStatus: "PENDING" });
  });
});

describe("refreshOrderPayment: card order whose charge answer was lost (no asaasPaymentId)", () => {
  const cardOrder = (id: string) =>
    ({ id, status: "pending", paymentMethod: "credit_card", asaasPaymentId: null }) as any;

  it("finds the charge by externalReference (the order id), stores its id and maps its status", async () => {
    const o = cardOrder("order-m2-found");
    mocks.getPayment.mockResolvedValueOnce({ id: "pay_found", status: "CONFIRMED", billingType: "CREDIT_CARD", value: 50 });
    mocks.finalize.mockResolvedValueOnce({ ok: true });
    mocks.getOrder.mockResolvedValueOnce({ ...o, status: "paid", asaasPaymentId: "pay_found" });

    const result = await refreshOrderPayment(o);

    expect(mocks.getPayment).toHaveBeenCalledWith("", "order-m2-found");
    expect(mocks.updateOrder).toHaveBeenCalledWith("order-m2-found", { asaasPaymentId: "pay_found" });
    expect(result).toMatchObject({ kind: "confirmed", paymentStatus: "CONFIRMED" });
  });

  it("a charge still in risk analysis is stored and reported as unchanged", async () => {
    const o = cardOrder("order-m2-risk");
    mocks.getPayment.mockResolvedValueOnce({ id: "pay_risk", status: "AWAITING_RISK_ANALYSIS" });

    const result = await refreshOrderPayment(o);

    expect(mocks.updateOrder).toHaveBeenCalledWith("order-m2-risk", { asaasPaymentId: "pay_risk" });
    expect(result).toMatchObject({ kind: "unchanged", paymentStatus: "AWAITING_RISK_ANALYSIS" });
  });

  it("nothing found: unchanged, nothing stored, never no_payment_id", async () => {
    const o = cardOrder("order-m2-none");
    mocks.getPayment.mockResolvedValueOnce({ status: "PENDING" });

    const result = await refreshOrderPayment(o);

    expect(mocks.updateOrder).not.toHaveBeenCalled();
    expect(result).toMatchObject({ kind: "unchanged", paymentStatus: null });
  });

  it("an Asaas error: unchanged (no throw), retried after the short backoff", async () => {
    const o = cardOrder("order-m2-err");
    mocks.getPayment.mockRejectedValueOnce(new Error("asaas down"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await refreshOrderPayment(o);
    expect(result).toMatchObject({ kind: "unchanged", paymentStatus: null });

    await refreshOrderPayment(o);
    expect(mocks.getPayment).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(3_000);
    mocks.getPayment.mockResolvedValueOnce({ status: "PENDING" });
    await refreshOrderPayment(o);
    expect(mocks.getPayment).toHaveBeenCalledTimes(2);
  });

  it("a PIX/boleto order with no payment id still answers no_payment_id", async () => {
    const result = await refreshOrderPayment({ id: "o-pix", status: "pending", paymentMethod: "pix", asaasPaymentId: null } as any);
    expect(result.kind).toBe("no_payment_id");
    expect(mocks.getPayment).not.toHaveBeenCalled();
  });
});

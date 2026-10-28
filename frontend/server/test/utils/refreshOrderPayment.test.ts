import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mocks = vi.hoisted(() => ({ getPayment: vi.fn() }));

vi.mock("../../storage", () => ({ storage: { getOrder: vi.fn(), cancelPendingOrder: vi.fn() } }));
vi.mock("../../services/asaasService", () => ({ asaasService: { getPayment: mocks.getPayment } }));
vi.mock("../../utils/finalizeOrderPaidLikeWebhook", () => ({ finalizeOrderPaidLikeWebhook: vi.fn() }));

const { refreshOrderPayment } = await import("../../utils/refreshOrderPayment");

const order = { id: "order-throttle-1", status: "pending", asaasPaymentId: "pay_1" } as any;

beforeEach(() => {
  mocks.getPayment.mockReset();
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

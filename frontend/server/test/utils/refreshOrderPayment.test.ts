import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({ getPayment: vi.fn() }));

vi.mock("../../storage", () => ({ storage: { getOrder: vi.fn(), cancelPendingOrder: vi.fn() } }));
vi.mock("../../services/asaasService", () => ({ asaasService: { getPayment: mocks.getPayment } }));
vi.mock("../../utils/finalizeOrderPaidLikeWebhook", () => ({ finalizeOrderPaidLikeWebhook: vi.fn() }));

const { refreshOrderPayment } = await import("../../utils/refreshOrderPayment");

const order = { id: "order-throttle-1", status: "pending", asaasPaymentId: "pay_1" } as any;

beforeEach(() => mocks.getPayment.mockReset());

describe("refreshOrderPayment throttle", () => {
  it("frees the slot when Asaas fails, so the next poll asks again", async () => {
    mocks.getPayment.mockRejectedValueOnce(new Error("asaas down"));
    await expect(refreshOrderPayment(order)).rejects.toThrow("asaas down");

    mocks.getPayment.mockResolvedValueOnce({ id: "pay_1", status: "PENDING" });
    const second = await refreshOrderPayment(order);

    expect(mocks.getPayment).toHaveBeenCalledTimes(2);
    expect(second).toMatchObject({ kind: "unchanged", paymentStatus: "PENDING" });
  });
});

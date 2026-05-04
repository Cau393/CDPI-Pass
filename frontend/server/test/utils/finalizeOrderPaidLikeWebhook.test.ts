import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Order } from "@shared/schema";

const updateOrder = vi.fn();
const incrementCourtesyLinkUsage = vi.fn();
const getEvent = vi.fn();
const getUser = vi.fn();
const updateEvent = vi.fn();

vi.mock("../../storage", () => ({
  storage: {
    updateOrder: (...a: unknown[]) => updateOrder(...a),
    incrementCourtesyLinkUsage: (...a: unknown[]) =>
      incrementCourtesyLinkUsage(...a),
    getEvent: (...a: unknown[]) => getEvent(...a),
    getUser: (...a: unknown[]) => getUser(...a),
    updateEvent: (...a: unknown[]) => updateEvent(...a),
  },
}));

vi.mock("../../services/emailService", () => ({
  emailService: {
    sendTicketEmail: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("axios", () => ({
  default: { post: vi.fn().mockResolvedValue({}) },
}));

import { finalizeOrderPaidLikeWebhook } from "../../utils/finalizeOrderPaidLikeWebhook";

function baseOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: "order-uuid",
    userId: "user-1",
    eventId: "evt-1",
    amount: "100.00",
    status: "pending",
    paymentMethod: "credit_card",
    asaasPaymentId: "link-1",
    cpf: "123",
    createdAt: new Date(),
    updatedAt: new Date(),
    qrCodeData: "qr",
    qr_code_s3_url: null,
    courtesyLinkId: null,
    courtesyAttendeeId: null,
    amntUsed: 0,
    maxUses: 1,
    ...overrides,
  } as Order;
}

describe("finalizeOrderPaidLikeWebhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getEvent.mockResolvedValue({
      id: "evt-1",
      title: "E",
      date: new Date(),
      location: "L",
      currentAttendees: 1,
    });
    getUser.mockResolvedValue({
      id: "user-1",
      name: "U",
      email: "u@test.com",
    });
  });

  it("returns already_paid when order is paid", async () => {
    const o = baseOrder({ status: "paid" });
    const r = await finalizeOrderPaidLikeWebhook(o, {
      billingType: "CREDIT_CARD",
    });
    expect(r).toEqual({ ok: false, code: "already_paid" });
    expect(updateOrder).not.toHaveBeenCalled();
  });

  it("returns not_pending when order is cancelled", async () => {
    const o = baseOrder({ status: "cancelled" });
    const r = await finalizeOrderPaidLikeWebhook(o, {
      billingType: "CREDIT_CARD",
    });
    expect(r).toEqual({ ok: false, code: "not_pending" });
    expect(updateOrder).not.toHaveBeenCalled();
  });

  it("finalizes promo-link (paid) orders as paid and increments link usage", async () => {
    const o = baseOrder({
      courtesyLinkId: "cl-1",
      paymentMethod: "credit_card",
      courtesyAttendeeId: null,
    });
    const r = await finalizeOrderPaidLikeWebhook(o, {
      billingType: "CREDIT_CARD",
      value: 100,
    });
    expect(r).toEqual({ ok: true });
    expect(updateOrder).toHaveBeenCalledWith("order-uuid", { status: "paid" });
    expect(incrementCourtesyLinkUsage).toHaveBeenCalledWith("cl-1");
    expect(updateEvent).toHaveBeenCalledWith("evt-1", {
      currentAttendees: 2,
    });
  });

  it("finalizes free cortesia (pending + courtesy payment method) as paid", async () => {
    const o = baseOrder({
      courtesyLinkId: "cl-1",
      paymentMethod: "courtesy",
      courtesyAttendeeId: "att-1",
      amount: "0.00",
    });
    const r = await finalizeOrderPaidLikeWebhook(o, {
      billingType: "UNKNOWN",
    });
    expect(r).toEqual({ ok: true });
    expect(updateOrder).toHaveBeenCalledWith("order-uuid", { status: "paid" });
    expect(incrementCourtesyLinkUsage).toHaveBeenCalledWith("cl-1");
  });

  it("sets paid when pending with no courtesy link or attendee", async () => {
    const o = baseOrder({});
    const r = await finalizeOrderPaidLikeWebhook(o, {
      billingType: "CREDIT_CARD",
    });
    expect(r).toEqual({ ok: true });
    expect(updateOrder).toHaveBeenCalledWith("order-uuid", { status: "paid" });
    expect(incrementCourtesyLinkUsage).not.toHaveBeenCalled();
  });
});

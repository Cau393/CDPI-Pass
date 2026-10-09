import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Order } from "@shared/schema";

// The locked claim itself (duplicate check, pending→paid, seat) runs against a real
// Postgres in server/test/integration/asaasWebhook.integration.test.ts. Here: what the
// wrapper does after each claim outcome.
const claimPaidOrder = vi.fn();
const getEvent = vi.fn();
const getUser = vi.fn();
const refundReceivedPayment = vi.fn();
const isRefunded = vi.fn();
const installmentTotal = vi.fn();
const deleteFile = vi.fn();

vi.mock("../../storage", () => ({
  storage: {
    claimPaidOrder: (...a: unknown[]) => claimPaidOrder(...a),
    getEvent: (...a: unknown[]) => getEvent(...a),
    getUser: (...a: unknown[]) => getUser(...a),
  },
}));

vi.mock("../../services/emailService", () => ({
  emailService: {
    sendTicketEmail: vi.fn().mockResolvedValue(undefined),
    sendOnlineEventEmail: vi.fn().mockResolvedValue(undefined),
    sendEmail: vi.fn().mockResolvedValue(true),
  },
}));

vi.mock("../../services/asaasService", () => ({
  asaasService: {
    refundReceivedPayment: (...a: unknown[]) => refundReceivedPayment(...a),
    isRefunded: (...a: unknown[]) => isRefunded(...a),
    installmentTotal: (...a: unknown[]) => installmentTotal(...a),
  },
}));

vi.mock("../../services/s3Service", () => ({
  s3Service: {
    deleteFile: (...a: unknown[]) => deleteFile(...a),
    extractKeyFromUrl: (url: string) => url.split("/").pop(),
  },
}));

vi.mock("axios", () => ({
  default: { post: vi.fn().mockResolvedValue({}) },
}));

import { finalizeOrderPaidLikeWebhook } from "../../utils/finalizeOrderPaidLikeWebhook";
import { emailService } from "../../services/emailService";

function baseOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: "order-uuid",
    userId: "user-1",
    eventId: "evt-1",
    amount: "100.00",
    status: "pending",
    paymentMethod: "credit_card",
    asaasPaymentId: "pay-1",
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
    claimPaidOrder.mockResolvedValue({ outcome: "paid", order: baseOrder({ status: "paid" }) });
    refundReceivedPayment.mockResolvedValue({ requestUrl: null });
    installmentTotal.mockResolvedValue(100);
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

  const pixMeta = { billingType: "PIX", value: 100, paymentId: "pay-in" };
  const refundEmails = () =>
    vi.mocked(emailService.sendEmail).mock.calls.filter(([, subject]) => /estornado/i.test(subject));

  it("returns already_paid for a paid snapshot without opening a claim", async () => {
    const r = await finalizeOrderPaidLikeWebhook(baseOrder({ status: "paid" }), pixMeta);
    expect(r).toEqual({ ok: false, code: "already_paid" });
    expect(claimPaidOrder).not.toHaveBeenCalled();
  });

  it("returns not_pending with the status for a cancelled snapshot", async () => {
    const r = await finalizeOrderPaidLikeWebhook(baseOrder({ status: "cancelled" }), pixMeta);
    expect(r).toEqual({ ok: false, code: "not_pending", status: "cancelled" });
    expect(claimPaidOrder).not.toHaveBeenCalled();
  });

  it("claims with refund_then_discard by default and reject_only when asked", async () => {
    await finalizeOrderPaidLikeWebhook(baseOrder(), pixMeta);
    await finalizeOrderPaidLikeWebhook(baseOrder(), { billingType: "CREDIT_CARD" }, { duplicatePolicy: "reject_only" });
    expect(claimPaidOrder.mock.calls).toEqual([
      ["order-uuid", "refund_then_discard"],
      ["order-uuid", "reject_only"],
    ]);
  });

  it("a lost claim (another delivery won) sends nothing and refunds nothing", async () => {
    claimPaidOrder.mockResolvedValue({ outcome: "already_paid" });
    const r = await finalizeOrderPaidLikeWebhook(baseOrder(), pixMeta);
    expect(r).toEqual({ ok: false, code: "already_paid" });
    expect(emailService.sendTicketEmail).not.toHaveBeenCalled();
    expect(emailService.sendOnlineEventEmail).not.toHaveBeenCalled();
    expect(refundReceivedPayment).not.toHaveBeenCalled();
  });

  it("a discarded duplicate refunds the RECEIVED payment, not the order's link id, and tells the buyer", async () => {
    claimPaidOrder.mockResolvedValue({
      outcome: "duplicate_discarded",
      order: baseOrder({ asaasPaymentId: "lnk-123", qr_code_s3_url: "https://s3.test/qr/abc.png" }),
    });
    const r = await finalizeOrderPaidLikeWebhook(baseOrder({ asaasPaymentId: "lnk-123" }), {
      billingType: "CREDIT_CARD",
      value: 33.34,
      paymentId: "pay-installment-1",
      installment: "inst-9",
    });
    expect(r).toEqual({ ok: false, code: "duplicate_other_paid" });
    expect(refundReceivedPayment).toHaveBeenCalledWith({
      id: "pay-installment-1",
      billingType: "CREDIT_CARD",
      value: 33.34,
      installment: "inst-9",
    });
    expect(deleteFile).toHaveBeenCalledWith("abc.png");
    expect(refundEmails()).toHaveLength(1);
    expect(emailService.sendTicketEmail).not.toHaveBeenCalled();
  });

  it("a refused refund that Asaas already made logs it and sends no e-mail", async () => {
    claimPaidOrder.mockResolvedValue({ outcome: "duplicate_discarded", order: baseOrder() });
    refundReceivedPayment.mockRejectedValue(new Error("400 invalid_action"));
    isRefunded.mockResolvedValue(true);
    const r = await finalizeOrderPaidLikeWebhook(baseOrder(), pixMeta);
    expect(r).toEqual({ ok: false, code: "duplicate_other_paid" });
    expect(refundEmails()).toHaveLength(0);
  });

  it("a duplicate with no received payment id (manual mark) refunds nothing", async () => {
    claimPaidOrder.mockResolvedValue({ outcome: "duplicate_discarded", order: baseOrder() });
    await finalizeOrderPaidLikeWebhook(baseOrder(), { billingType: "CREDIT_CARD", value: 100 });
    expect(refundReceivedPayment).not.toHaveBeenCalled();
    expect(refundEmails()).toHaveLength(0);
  });

  it("reject_only duplicate: no refund, no e-mail", async () => {
    claimPaidOrder.mockResolvedValue({ outcome: "duplicate_rejected" });
    const r = await finalizeOrderPaidLikeWebhook(baseOrder(), pixMeta, { duplicatePolicy: "reject_only" });
    expect(r).toEqual({ ok: false, code: "duplicate_other_paid" });
    expect(refundReceivedPayment).not.toHaveBeenCalled();
    expect(vi.mocked(emailService.sendEmail)).not.toHaveBeenCalled();
  });

  it("a ticket e-mail failure after the commit still reports the order paid", async () => {
    vi.mocked(emailService.sendTicketEmail).mockRejectedValueOnce(new Error("SES down"));
    const r = await finalizeOrderPaidLikeWebhook(baseOrder(), pixMeta);
    expect(r).toEqual({ ok: true });
  });

  it("a failed read after the commit still reports the order paid (no 500, no Asaas retry)", async () => {
    getEvent.mockRejectedValueOnce(new Error("connection reset"));
    const r = await finalizeOrderPaidLikeWebhook(baseOrder(), pixMeta);
    expect(r).toEqual({ ok: true });
  });

  it("A6: logs when the card installments do not add up to the order amount, without blocking", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    installmentTotal.mockResolvedValue(90);
    const r = await finalizeOrderPaidLikeWebhook(baseOrder(), {
      billingType: "CREDIT_CARD",
      value: 30,
      paymentId: "pay-inst",
      installment: "inst-1",
    });
    expect(r).toEqual({ ok: true });
    expect(installmentTotal).toHaveBeenCalledWith("inst-1");
    expect(warn.mock.calls.some(([m]) => String(m).startsWith("PAID_TOTAL_MISMATCH"))).toBe(true);
    warn.mockRestore();
  });

  it("sends the ticket email for a presencial event", async () => {
    const o = baseOrder({});
    await finalizeOrderPaidLikeWebhook(o, { billingType: "CREDIT_CARD" });
    expect(emailService.sendTicketEmail).toHaveBeenCalled();
    expect(emailService.sendOnlineEventEmail).not.toHaveBeenCalled();
  });

  it("sends the meeting-link email for an online event", async () => {
    getEvent.mockResolvedValue({
      id: "evt-1",
      title: "E",
      date: new Date(),
      location: "L",
      currentAttendees: 1,
      modality: "online",
      meetingUrl: "https://zoom.us/j/1",
      confirmationEmailHtml: "<p>Traga o material</p>",
    });
    const o = baseOrder({ qrCodeData: null });
    await finalizeOrderPaidLikeWebhook(o, { billingType: "CREDIT_CARD" });
    expect(emailService.sendOnlineEventEmail).toHaveBeenCalledWith(
      "u@test.com",
      expect.objectContaining({
        meetingUrl: "https://zoom.us/j/1",
        eventTitle: "E",
        customHtml: "<p>Traga o material</p>",
      }),
    );
    expect(emailService.sendTicketEmail).not.toHaveBeenCalled();
  });

  it("includes meetingPassword in the online confirmation email when the event has one", async () => {
    getEvent.mockResolvedValue({
      id: "evt-1",
      title: "E",
      date: new Date(),
      location: "L",
      currentAttendees: 1,
      modality: "online",
      meetingUrl: "https://zoom.us/j/1",
      meetingPassword: "segredo",
    });
    const o = baseOrder({ qrCodeData: null });
    await finalizeOrderPaidLikeWebhook(o, { billingType: "CREDIT_CARD" });
    expect(emailService.sendOnlineEventEmail).toHaveBeenCalledWith(
      "u@test.com",
      expect.objectContaining({
        meetingUrl: "https://zoom.us/j/1",
        meetingPassword: "segredo",
      }),
    );
  });
});

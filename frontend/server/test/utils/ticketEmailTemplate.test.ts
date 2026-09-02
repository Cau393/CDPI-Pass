import { describe, it, expect } from "vitest";
import {
  buildTicketEmailHtml,
  buildTicketEmailText,
  confirmationKindForPaymentMethod,
} from "../../utils/ticketEmailTemplate";

const base = {
  userName: "Maria",
  eventTitle: "Workshop Peptídeos",
  eventDate: new Date("2026-10-20T11:30:00.000Z"),
  eventLocation: "CFF - Brasília",
  qrCodeData: "data:image/png;base64,AAAA",
  orderId: "abc-123",
  qrCodeS3Url: "",
};

describe("buildTicketEmailHtml", () => {
  it("confirms the registration for a free event", () => {
    expect(buildTicketEmailHtml({ ...base, confirmationKind: "free" })).toContain(
      "Sua inscrição está confirmada!",
    );
  });

  it("does not mention payment for a free event", () => {
    expect(buildTicketEmailHtml({ ...base, confirmationKind: "free" })).not.toContain("pagamento");
  });

  it("confirms the presence for a courtesy ticket", () => {
    expect(buildTicketEmailHtml({ ...base, confirmationKind: "courtesy" })).toContain(
      "Sua presença foi confirmada!",
    );
  });

  it("keeps the payment confirmation for a paid order", () => {
    expect(buildTicketEmailHtml({ ...base, confirmationKind: "paid" })).toContain(
      "Seu pagamento foi confirmado!",
    );
  });

  it("tells attendees each ticket is individual and non-transferable", () => {
    expect(buildTicketEmailHtml({ ...base, confirmationKind: "paid" })).toContain(
      "Cada ingresso é individual e intransferível.",
    );
  });

  it("tells attendees the QR code is required to enter", () => {
    expect(buildTicketEmailHtml({ ...base, confirmationKind: "paid" })).toContain(
      "A apresentação do QRCode do Ingresso (digital ou impresso) é indispensável para ter acesso ao evento.",
    );
  });

  it("dropped the old QR wording", () => {
    expect(buildTicketEmailHtml({ ...base, confirmationKind: "paid" })).not.toContain(
      "O QR Code pode ser apresentado impresso ou no celular",
    );
  });

  it("keeps the inline QR content id that the attachment references", () => {
    expect(buildTicketEmailHtml({ ...base, confirmationKind: "paid" })).toContain('src="cid:qrcode"');
  });

  it("shows the event title", () => {
    expect(buildTicketEmailHtml({ ...base, confirmationKind: "paid" })).toContain("Workshop Peptídeos");
  });

  it("shows the current support phone in the footer", () => {
    expect(buildTicketEmailHtml({ ...base, confirmationKind: "paid" })).toContain("+55 (62) 99865-5500");
  });

  it("keeps the existing landline alongside the new number", () => {
    expect(buildTicketEmailHtml({ ...base, confirmationKind: "paid" })).toContain("3636-9909");
  });

  it("keeps the existing mobile alongside the new number", () => {
    expect(buildTicketEmailHtml({ ...base, confirmationKind: "paid" })).toContain("99610-1694");
  });
});

describe("buildTicketEmailText", () => {
  it("confirms the registration for a free event in the plain-text body", () => {
    expect(buildTicketEmailText({ ...base, confirmationKind: "free" })).toContain(
      "Sua inscrição está confirmada!",
    );
  });

  it("lists the arrival instruction in the plain-text body", () => {
    expect(buildTicketEmailText({ ...base, confirmationKind: "paid" })).toContain(
      "Chegue com 30 minutos de antecedência.",
    );
  });
});

describe("confirmationKindForPaymentMethod", () => {
  it("maps courtesy orders to the presence wording", () => {
    expect(confirmationKindForPaymentMethod("courtesy")).toBe("courtesy");
  });

  it("maps free orders to the registration wording", () => {
    expect(confirmationKindForPaymentMethod("free")).toBe("free");
  });

  it("maps pix to the payment wording", () => {
    expect(confirmationKindForPaymentMethod("pix")).toBe("paid");
  });

  it("defaults a missing method to the payment wording", () => {
    expect(confirmationKindForPaymentMethod(null)).toBe("paid");
  });
});

import { describe, it, expect } from "vitest";
import {
  eventAcquisitionCtaLabel,
  eventFeeLabel,
  eventPriceLabel,
  isEventSoldOut,
  isFreeEvent,
  isFreePaymentMethod,
  loginRequiredDescription,
} from "../../lib/eventCta";

describe("isFreeEvent", () => {
  it("is true only when isFree is the boolean true", () => {
    expect(isFreeEvent({ isFree: true })).toBe(true);
    expect(isFreeEvent({ isFree: false })).toBe(false);
    expect(isFreeEvent({ isFree: null })).toBe(false);
    expect(isFreeEvent({})).toBe(false);
  });
});

describe("eventPriceLabel", () => {
  it("returns Grátis for free events even when a display price is passed", () => {
    expect(eventPriceLabel({ isFree: true, price: "0.00" }, 0)).toBe("Grátis");
    expect(eventPriceLabel({ isFree: true, price: "50.00" }, 50)).toBe("Grátis");
  });

  it("formats a paid price", () => {
    expect(eventPriceLabel({ isFree: false, price: "100.00" })).toMatch(
      /R\$\s*100[,.]00/,
    );
    expect(eventPriceLabel({ isFree: false, price: "250.00" }, 200)).toMatch(
      /R\$\s*200[,.]00/,
    );
  });
});

describe("eventFeeLabel", () => {
  it("returns null for free events", () => {
    expect(eventFeeLabel({ isFree: true })).toBeNull();
    expect(eventFeeLabel({ isFree: true }, "detailed")).toBeNull();
  });

  it("returns the short fee line for paid events by default", () => {
    expect(eventFeeLabel({ isFree: false })).toBe("+ taxa de conveniência");
  });

  it("returns the detailed fee line when asked", () => {
    expect(eventFeeLabel({ isFree: false }, "detailed")).toBe(
      "+ taxa de conveniência de R$ 5,00",
    );
  });
});

describe("eventAcquisitionCtaLabel", () => {
  const idle = {
    confirmed: false,
    soldOut: false,
    salesClosed: false,
  };

  it("uses inscription copy for free events", () => {
    expect(eventAcquisitionCtaLabel({ ...idle, isFree: true })).toBe(
      "Confirmar inscrição",
    );
    expect(
      eventAcquisitionCtaLabel({ ...idle, isFree: true, confirmed: true }),
    ).toBe("Inscrição confirmada");
  });

  it("uses purchase copy for paid events", () => {
    expect(eventAcquisitionCtaLabel({ ...idle, isFree: false })).toBe(
      "Comprar Ingresso",
    );
    expect(
      eventAcquisitionCtaLabel({ ...idle, isFree: false, confirmed: true }),
    ).toBe("Ingresso já confirmado");
  });

  it("prefers confirmed over sold-out and closed", () => {
    expect(
      eventAcquisitionCtaLabel({
        isFree: true,
        confirmed: true,
        soldOut: true,
        salesClosed: true,
      }),
    ).toBe("Inscrição confirmada");
  });

  it("shows sold-out and sales-closed states", () => {
    expect(
      eventAcquisitionCtaLabel({ ...idle, isFree: true, soldOut: true }),
    ).toBe("Evento Esgotado");
    expect(
      eventAcquisitionCtaLabel({ ...idle, isFree: false, salesClosed: true }),
    ).toBe("Vendas encerradas");
  });

  it("shows pending while a free subscribe is in flight", () => {
    expect(
      eventAcquisitionCtaLabel({ ...idle, isFree: true, pending: true }),
    ).toBe("Confirmando...");
  });
});

describe("loginRequiredDescription", () => {
  it("uses inscription wording for free events", () => {
    expect(loginRequiredDescription(true)).toBe(
      "Faça login ou cadastre-se para se inscrever",
    );
  });

  it("uses purchase wording for paid events", () => {
    expect(loginRequiredDescription(false)).toBe(
      "Faça login ou cadastre-se para comprar ingressos",
    );
  });
});

describe("isEventSoldOut", () => {
  it("is false when there is no attendee cap", () => {
    expect(isEventSoldOut({ maxAttendees: null, currentAttendees: 99 })).toBe(
      false,
    );
  });

  it("is true when current attendees reach the cap", () => {
    expect(
      isEventSoldOut({ maxAttendees: 10, currentAttendees: 10 }),
    ).toBe(true);
    expect(isEventSoldOut({ maxAttendees: 10, currentAttendees: 9 })).toBe(
      false,
    );
  });
});

describe("isFreePaymentMethod", () => {
  it("matches only the free payment method", () => {
    expect(isFreePaymentMethod("free")).toBe(true);
    expect(isFreePaymentMethod("pix")).toBe(false);
    expect(isFreePaymentMethod("courtesy")).toBe(false);
    expect(isFreePaymentMethod(null)).toBe(false);
  });
});

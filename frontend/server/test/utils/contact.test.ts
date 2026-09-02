import { describe, it, expect } from "vitest";
import {
  CONTACT_CHANNELS,
  CONTACT_EMAIL,
  CONTACT_PHONES,
  EMAIL_CONTACT_FOOTER_HTML,
  EMAIL_CONTACT_LINE,
  contactMailtoHref,
  contactPhoneHref,
  contactTelHref,
  contactWhatsAppHref,
} from "@shared/contact";

const landline = CONTACT_CHANNELS[0];
const whatsappPrimary = CONTACT_CHANNELS[1];
const whatsappSecondary = CONTACT_CHANNELS[2];

describe("CONTACT_CHANNELS", () => {
  it("lists three channels in canonical order", () => {
    expect(CONTACT_PHONES).toEqual([
      "+55 (62) 3636-9909",
      "(62) 99865-5500",
      "(62) 99610-1694",
    ]);
  });

  it("does not keep the retired site number", () => {
    expect(CONTACT_PHONES.join(" ")).not.toContain("99860-6833");
  });
});

describe("contactMailtoHref", () => {
  it("builds a mailto link for the support inbox", () => {
    expect(contactMailtoHref()).toBe(`mailto:${CONTACT_EMAIL}`);
  });
});

describe("contactTelHref", () => {
  it("builds a tel link with a plus and the E.164 digits", () => {
    expect(contactTelHref(landline)).toBe("tel:+556236369909");
  });
});

describe("contactWhatsAppHref", () => {
  it("builds a wa.me link for the primary WhatsApp number", () => {
    expect(contactWhatsAppHref(whatsappPrimary)).toBe(
      "https://wa.me/5562998655500",
    );
  });

  it("builds a wa.me link for the secondary WhatsApp number", () => {
    expect(contactWhatsAppHref(whatsappSecondary)).toBe(
      "https://wa.me/5562996101694",
    );
  });
});

describe("contactPhoneHref", () => {
  it("uses tel for the landline", () => {
    expect(contactPhoneHref(landline)).toBe("tel:+556236369909");
  });

  it("uses WhatsApp for a 9xxxx channel", () => {
    expect(contactPhoneHref(whatsappPrimary)).toBe(
      "https://wa.me/5562998655500",
    );
  });
});

describe("EMAIL_CONTACT_LINE", () => {
  it("joins the email and phones for plain-text mail", () => {
    expect(EMAIL_CONTACT_LINE).toBe(
      "relacionamento.mkt@cdpipharma.com.br | +55 (62) 3636-9909 / (62) 99865-5500 / (62) 99610-1694",
    );
  });
});

describe("EMAIL_CONTACT_FOOTER_HTML", () => {
  it("includes a mailto link", () => {
    expect(EMAIL_CONTACT_FOOTER_HTML).toContain(
      'href="mailto:relacionamento.mkt@cdpipharma.com.br"',
    );
  });

  it("includes the landline tel link", () => {
    expect(EMAIL_CONTACT_FOOTER_HTML).toContain('href="tel:+556236369909"');
  });

  it("includes a WhatsApp wa.me link", () => {
    expect(EMAIL_CONTACT_FOOTER_HTML).toContain(
      'href="https://wa.me/5562998655500"',
    );
  });

  it("uses the brand colour on links", () => {
    expect(EMAIL_CONTACT_FOOTER_HTML).toContain("color: #0F4C75");
  });
});

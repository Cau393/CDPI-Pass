import { describe, it, expect } from "vitest";
import { parseCardPayment } from "../../utils/cardPaymentSchema";

const NEXT_YEAR = new Date().getUTCFullYear() + 1;
/** A 2-digit year a few years ahead, so the expected 4-digit form follows the clock. */
const TWO_DIGIT_YEAR = (new Date().getUTCFullYear() + 4) % 100;

function body(overrides: { card?: Record<string, unknown>; cardHolder?: Record<string, unknown>; installmentCount?: unknown } = {}) {
  const { card, cardHolder, ...rest } = overrides;
  return {
    card: {
      holderName: "Comprador Teste",
      number: "4111111111111111",
      expiryMonth: "12",
      expiryYear: String(NEXT_YEAR),
      ccv: "123",
      ...card,
    },
    cardHolder: {
      name: "Comprador Teste",
      cpf: "529.982.247-25",
      postalCode: "01310-100",
      addressNumber: "100",
      ...cardHolder,
    },
    ...rest,
  };
}

describe("parseCardPayment (ADR-017 Stage 3)", () => {
  it("accepts a valid card and normalizes the fields", () => {
    const parsed = parseCardPayment(body({ card: { number: "4111 1111-1111 1111", expiryMonth: 3, expiryYear: String(TWO_DIGIT_YEAR) } }));

    expect(parsed).toEqual({
      ok: true,
      value: {
        card: {
          holderName: "Comprador Teste",
          number: "4111111111111111",
          expiryMonth: "03",
          expiryYear: String(2000 + TWO_DIGIT_YEAR),
          ccv: "123",
        },
        cardHolder: {
          name: "Comprador Teste",
          cpf: "52998224725",
          postalCode: "01310100",
          addressNumber: "100",
        },
        installmentCount: 1,
      },
    });
  });

  it("accepts a 4-digit CVV, a numeric year and the current month", () => {
    const now = new Date();
    const result = parseCardPayment(
      body({
        card: {
          ccv: "1234",
          expiryMonth: now.getUTCMonth() + 1,
          expiryYear: now.getUTCFullYear(),
        },
      }),
    );
    expect(result.ok).toBe(true);
  });

  it("accepts the 13 and 19 digit bounds when Luhn-valid", () => {
    for (const number of ["4222222222222", "4111111111111111110"]) {
      expect(parseCardPayment(body({ card: { number } })).ok).toBe(true);
    }
  });

  it("defaults installmentCount to 1 and accepts 1 to 3", () => {
    for (const n of [1, 2, 3]) {
      const result = parseCardPayment(body({ installmentCount: n }));
      expect(result).toMatchObject({ ok: true, value: { installmentCount: n } });
    }
  });

  it.each([
    ["a number that fails Luhn", { number: "4111111111111112" }],
    ["a 12 digit number", { number: "411111111117" }],
    ["a 20 digit number (Luhn valid, over the bound)", { number: "41111111111111111115" }],
    ["a non-numeric number", { number: "4111-abcd-1111-1111" }],
    ["month 13", { expiryMonth: "13" }],
    ["month 0", { expiryMonth: "00" }],
    ["an expired card", { expiryMonth: "01", expiryYear: "2020" }],
    ["last year, december", { expiryMonth: "12", expiryYear: String(new Date().getUTCFullYear() - 1) }],
    ["a 2 digit CVV", { ccv: "12" }],
    ["a 5 digit CVV", { ccv: "12345" }],
    ["a non-numeric CVV", { ccv: "12a" }],
    ["an empty holder name", { holderName: "   " }],
    ["a 101 char holder name", { holderName: "A".repeat(101) }],
  ])("rejects %s", (_label, card) => {
    expect(parseCardPayment(body({ card }))).toEqual({ ok: false });
  });

  it.each([
    ["an invalid CPF", { cpf: "111.111.111-11" }],
    ["a CPF with a wrong check digit", { cpf: "52998224724" }],
    ["a 7 digit postal code", { postalCode: "0131010" }],
    ["an empty address number", { addressNumber: "  " }],
    ["an 11 char address number", { addressNumber: "12345678901" }],
    ["a name with markup", { name: "<b>Fulano</b>" }],
    ["an empty name", { name: "" }],
    ["a 121 char name", { name: "A".repeat(121) }],
  ])("rejects a holder with %s", (_label, cardHolder) => {
    expect(parseCardPayment(body({ cardHolder }))).toEqual({ ok: false });
  });

  it.each([[0], [4], [2.5], ["3x"], ["x"], [-1], [null]])("rejects installmentCount %j", (installmentCount) => {
    expect(parseCardPayment(body({ installmentCount }))).toEqual({ ok: false });
  });

  it.each([[undefined], [null], ["card"], [42], [{}]])("rejects a body that is %j", (input) => {
    expect(parseCardPayment(input)).toEqual({ ok: false });
  });

  it("rejects a missing card or cardHolder", () => {
    const { card, ...withoutCard } = body();
    const { cardHolder, ...withoutHolder } = body();
    expect(parseCardPayment(withoutCard)).toEqual({ ok: false });
    expect(parseCardPayment(withoutHolder)).toEqual({ ok: false });
  });

  it("never describes which field failed", () => {
    const result = parseCardPayment(body({ card: { number: "4111111111111112" } }));
    expect(JSON.stringify(result)).not.toContain("4111");
    expect(Object.keys(result)).toEqual(["ok"]);
  });
});

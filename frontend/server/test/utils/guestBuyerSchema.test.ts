import { describe, it, expect } from "vitest";
import { parseGuestBuyer } from "../../utils/guestBuyerSchema";

// ADR-017 Stage 2: the buyer a visitor types at checkout instead of logging in.
const valid = {
  name: "maria da silva",
  email: "  Maria@Example.COM ",
  phone: "(11) 98765-4321",
};

describe("parseGuestBuyer", () => {
  it("accepts a Brazilian buyer: CPF formatted, phone E.164, e-mail lowercased, name title-cased", () => {
    const result = parseGuestBuyer({
      ...valid,
      cpf: "52998224725",
      address: "Rua de teste, 123, Brasília",
    });

    expect(result).toEqual({
      ok: true,
      buyer: {
        name: "Maria da Silva",
        email: "maria@example.com",
        phone: "5511987654321",
        document: { isForeigner: false, cpf: "529.982.247-25", foreignDocument: null },
        address: "Rua de teste, 123, Brasília",
      },
    });
  });

  it("accepts a foreigner: passport normalized, cpf null", () => {
    const result = parseGuestBuyer({
      ...valid,
      isForeigner: true,
      foreignDocument: "py-123 456",
    });

    expect(result).toMatchObject({
      ok: true,
      buyer: { document: { isForeigner: true, cpf: null, foreignDocument: "PY123456" } },
    });
  });

  it("sends no document and no address as null (free online event)", () => {
    const result = parseGuestBuyer(valid);

    expect(result).toMatchObject({ ok: true, buyer: { document: null, address: null } });
  });

  it("fails on a name with markup, a URL or more than 120 characters", () => {
    expect(parseGuestBuyer({ ...valid, name: "Maria <b>Silva</b>" }).ok).toBe(false);
    expect(parseGuestBuyer({ ...valid, name: "Maria https://evil.test" }).ok).toBe(false);
    expect(parseGuestBuyer({ ...valid, name: "Maria www.evil.test" }).ok).toBe(false);
    expect(parseGuestBuyer({ ...valid, name: "A".repeat(121) }).ok).toBe(false);
    expect(parseGuestBuyer({ ...valid, name: "Al" }).ok).toBe(false);
  });

  it("fails on a bad e-mail, a bad phone and a bad CPF", () => {
    expect(parseGuestBuyer({ ...valid, email: "not-an-email" }).ok).toBe(false);
    expect(parseGuestBuyer({ ...valid, phone: "123" }).ok).toBe(false);
    expect(parseGuestBuyer({ ...valid, cpf: "111.111.111-11" }).ok).toBe(false);
  });

  it("asks for the data when the input is missing or not an object", () => {
    const expected = { ok: false, message: "Informe seus dados para continuar." };

    expect(parseGuestBuyer(undefined)).toEqual(expected);
    expect(parseGuestBuyer(null)).toEqual(expected);
    expect(parseGuestBuyer("maria")).toEqual(expected);
  });

  it("drops unknown keys", () => {
    const result = parseGuestBuyer({ ...valid, isAdmin: true, emailVerified: true });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.buyer).not.toHaveProperty("isAdmin");
      expect(result.buyer).not.toHaveProperty("emailVerified");
    }
  });
});

import { describe, it, expect } from "vitest";
import {
  parseCardNumber,
  parseCardHolderName,
  parseCardExpiry,
  parseCardCcv,
  parseHolderName,
  parseHolderCpf,
  parsePostalCode,
  parseAddressNumber,
  parseCardPayment,
} from "@shared/cardPayment";
import { validateCpf } from "@shared/cpf";
import { maskEmail } from "@shared/maskEmail";

const NOW = new Date(Date.UTC(2026, 9, 15)); // October 2026

describe("shared card field validators", () => {
  it("number: strips spaces/dashes, enforces Luhn and 13-19 digits", () => {
    expect(parseCardNumber("4111 1111-1111 1111")).toBe("4111111111111111");
    expect(parseCardNumber("4111111111111112")).toBeNull(); // bad Luhn
    expect(parseCardNumber("4222222222222")).toBe("4222222222222"); // 13
    expect(parseCardNumber("4000000000000002")).toBe("4000000000000002");
    expect(parseCardNumber("424242424242")).toBeNull(); // 12 digits
    expect(parseCardNumber("42424242424242424242")).toBeNull(); // 20 digits
    expect(parseCardNumber(4111111111111111)).toBeNull();
    expect(parseCardNumber("")).toBeNull();
  });

  it("holder name on card: trimmed 1-100", () => {
    expect(parseCardHolderName("  Ana  ")).toBe("Ana");
    expect(parseCardHolderName("   ")).toBeNull();
    expect(parseCardHolderName("a".repeat(100))).not.toBeNull();
    expect(parseCardHolderName("a".repeat(101))).toBeNull();
  });

  it("expiry: month 1-12, 2 or 4 digit year, not before the current UTC month", () => {
    expect(parseCardExpiry("10", "2026", NOW)).toEqual({ month: "10", year: "2026" });
    expect(parseCardExpiry("9", "2026", NOW)).toBeNull(); // previous month
    expect(parseCardExpiry("1", "26", NOW)).toBeNull(); // 2-digit past
    expect(parseCardExpiry("1", "27", NOW)).toEqual({ month: "01", year: "2027" });
    expect(parseCardExpiry("0", "2030", NOW)).toBeNull();
    expect(parseCardExpiry("13", "2030", NOW)).toBeNull();
    expect(parseCardExpiry("12", "203", NOW)).toBeNull();
    expect(parseCardExpiry(12, 2030, NOW)).toEqual({ month: "12", year: "2030" });
  });

  it("ccv: 3-4 digit string only", () => {
    expect(parseCardCcv("123")).toBe("123");
    expect(parseCardCcv("1234")).toBe("1234");
    expect(parseCardCcv("12")).toBeNull();
    expect(parseCardCcv("12345")).toBeNull();
    expect(parseCardCcv(123)).toBeNull();
    expect(parseCardCcv("12a")).toBeNull();
  });

  it("holder name: trimmed 1-120, no angle brackets", () => {
    expect(parseHolderName(" Ana Souza ")).toBe("Ana Souza");
    expect(parseHolderName("a".repeat(121))).toBeNull();
    expect(parseHolderName("A<b>")).toBeNull();
    expect(parseHolderName("")).toBeNull();
  });

  it("holder CPF: validates check digits and returns digits only", () => {
    expect(parseHolderCpf("529.982.247-25")).toBe("52998224725");
    expect(parseHolderCpf("529.982.247-26")).toBeNull();
    expect(parseHolderCpf(52998224725)).toBeNull();
  });

  it("postal code: 8 digits after stripping non-digits", () => {
    expect(parsePostalCode("01310-100")).toBe("01310100");
    expect(parsePostalCode("0131010")).toBeNull();
    expect(parsePostalCode("013101000")).toBeNull();
  });

  it("address number: trimmed 1-10", () => {
    expect(parseAddressNumber(" 100 ")).toBe("100");
    expect(parseAddressNumber("")).toBeNull();
    expect(parseAddressNumber("12345678901")).toBeNull();
  });
});

describe("parseCardPayment composed from the validators", () => {
  const good = {
    card: { holderName: "Ana", number: "4111111111111111", expiryMonth: "12", expiryYear: "2030", ccv: "123" },
    cardHolder: { name: "Ana", cpf: "529.982.247-25", postalCode: "01310-100", addressNumber: "10" },
  };
  it("accepts and normalizes", () => {
    const r = parseCardPayment(good, NOW);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.card.expiryYear).toBe("2030");
      expect(r.value.cardHolder.cpf).toBe("52998224725");
      expect(r.value.installmentCount).toBe(1);
    }
  });
  it("rejects a numeric ccv and an out-of-range installment", () => {
    expect(parseCardPayment({ ...good, card: { ...good.card, ccv: 123 } }, NOW).ok).toBe(false);
    expect(parseCardPayment({ ...good, installmentCount: 4 }, NOW).ok).toBe(false);
  });
});

describe("shared helpers moved from server/client", () => {
  it("validateCpf", () => {
    expect(validateCpf("529.982.247-25")).toBe(true);
    expect(validateCpf("111.111.111-11")).toBe(false);
  });
  it("maskEmail", () => {
    expect(maskEmail("maria@gmail.com")).toBe("ma•••••@gm•••.com");
  });
});

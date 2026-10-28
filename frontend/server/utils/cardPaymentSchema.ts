import { validateCpf } from "./validation";

export interface ParsedCardPayment {
  card: {
    number: string;
    holderName: string;
    expiryMonth: string;
    expiryYear: string;
    ccv: string;
  };
  cardHolder: {
    name: string;
    cpf: string;
    postalCode: string;
    addressNumber: string;
  };
  installmentCount: 1 | 2 | 3;
}

export type CardPaymentParse = { ok: true; value: ParsedCardPayment } | { ok: false };

const FAIL: CardPaymentParse = { ok: false };

function luhnValid(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = digits.charCodeAt(i) - 48;
    if (double) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    double = !double;
  }
  return sum % 10 === 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function digitsOf(value: unknown): string | null {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) return String(value);
  return typeof value === "string" ? value.trim() : null;
}

/**
 * Validates the card part of `POST /api/orders`. The answer never says which field
 * failed: card data must not leak into responses or logs, not even as a hint.
 */
export function parseCardPayment(body: unknown, now: Date = new Date()): CardPaymentParse {
  if (!isRecord(body) || !isRecord(body.card) || !isRecord(body.cardHolder)) return FAIL;
  const { card, cardHolder } = body;

  const number = typeof card.number === "string" ? card.number.replace(/[\s-]/g, "") : "";
  if (!/^\d{13,19}$/.test(number) || !luhnValid(number)) return FAIL;

  const holderName = typeof card.holderName === "string" ? card.holderName.trim() : "";
  if (holderName.length < 1 || holderName.length > 100) return FAIL;

  const month = digitsOf(card.expiryMonth);
  if (month === null || !/^\d{1,2}$/.test(month)) return FAIL;
  const monthNumber = Number(month);
  if (monthNumber < 1 || monthNumber > 12) return FAIL;
  const year = digitsOf(card.expiryYear);
  if (year === null || !/^(\d{2}|\d{4})$/.test(year)) return FAIL;
  const yearNumber = year.length === 2 ? 2000 + Number(year) : Number(year);
  if (
    yearNumber < now.getUTCFullYear() ||
    (yearNumber === now.getUTCFullYear() && monthNumber < now.getUTCMonth() + 1)
  ) {
    return FAIL;
  }

  if (typeof card.ccv !== "string" || !/^\d{3,4}$/.test(card.ccv)) return FAIL;

  const name = typeof cardHolder.name === "string" ? cardHolder.name.trim() : "";
  if (name.length < 1 || name.length > 120 || /[<>]/.test(name)) return FAIL;
  if (typeof cardHolder.cpf !== "string" || !validateCpf(cardHolder.cpf)) return FAIL;
  const postalCode = typeof cardHolder.postalCode === "string" ? cardHolder.postalCode.replace(/\D/g, "") : "";
  if (postalCode.length !== 8) return FAIL;
  const addressNumber = typeof cardHolder.addressNumber === "string" ? cardHolder.addressNumber.trim() : "";
  if (addressNumber.length < 1 || addressNumber.length > 10) return FAIL;

  const rawInstallments = body.installmentCount === undefined ? 1 : body.installmentCount;
  if (rawInstallments !== 1 && rawInstallments !== 2 && rawInstallments !== 3) return FAIL;

  return {
    ok: true,
    value: {
      card: {
        number,
        holderName,
        expiryMonth: month.padStart(2, "0"),
        expiryYear: String(yearNumber),
        ccv: card.ccv,
      },
      cardHolder: {
        name,
        cpf: cardHolder.cpf.replace(/\D/g, ""),
        postalCode,
        addressNumber,
      },
      installmentCount: rawInstallments,
    },
  };
}

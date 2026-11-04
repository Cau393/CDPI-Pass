import { validateCpf } from "./cpf";

/**
 * Card field rules for `POST /api/orders` (ADR-017). One source for the server
 * (`parseCardPayment`) and the client form (one validator per field, so the UI can
 * show a Portuguese error next to the right input). Every validator takes `unknown`
 * and returns the normalized value, or `null` when the value is invalid.
 */

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

function trimmedBetween(value: unknown, min: number, max: number): string | null {
  const text = typeof value === "string" ? value.trim() : "";
  return text.length >= min && text.length <= max ? text : null;
}

/** Card number: spaces/dashes stripped, 13-19 digits, Luhn. */
export function parseCardNumber(value: unknown): string | null {
  const number = typeof value === "string" ? value.replace(/[\s-]/g, "") : "";
  return /^\d{13,19}$/.test(number) && luhnValid(number) ? number : null;
}

/** Name printed on the card: trimmed, 1-100 chars. */
export function parseCardHolderName(value: unknown): string | null {
  return trimmedBetween(value, 1, 100);
}

/** Expiry: month 1-12, year with 2 or 4 digits, not before the current UTC month. */
export function parseCardExpiry(
  month: unknown,
  year: unknown,
  now: Date = new Date(),
): { month: string; year: string } | null {
  const m = digitsOf(month);
  if (m === null || !/^\d{1,2}$/.test(m)) return null;
  const monthNumber = Number(m);
  if (monthNumber < 1 || monthNumber > 12) return null;
  const y = digitsOf(year);
  if (y === null || !/^(\d{2}|\d{4})$/.test(y)) return null;
  const yearNumber = y.length === 2 ? 2000 + Number(y) : Number(y);
  if (
    yearNumber < now.getUTCFullYear() ||
    (yearNumber === now.getUTCFullYear() && monthNumber < now.getUTCMonth() + 1)
  ) {
    return null;
  }
  return { month: m.padStart(2, "0"), year: String(yearNumber) };
}

/** CVV: a string of 3 or 4 digits (a number would lose leading zeros). */
export function parseCardCcv(value: unknown): string | null {
  return typeof value === "string" && /^\d{3,4}$/.test(value) ? value : null;
}

/** Cardholder (billing) name: trimmed, 1-120 chars, no angle brackets. */
export function parseHolderName(value: unknown): string | null {
  const name = trimmedBetween(value, 1, 120);
  return name !== null && !/[<>]/.test(name) ? name : null;
}

/** Cardholder CPF with check digits; returns digits only. */
export function parseHolderCpf(value: unknown): string | null {
  return typeof value === "string" && validateCpf(value) ? value.replace(/\D/g, "") : null;
}

/** CEP: 8 digits after stripping non-digits. */
export function parsePostalCode(value: unknown): string | null {
  const postalCode = typeof value === "string" ? value.replace(/\D/g, "") : "";
  return postalCode.length === 8 ? postalCode : null;
}

/** Address number: trimmed, 1-10 chars. */
export function parseAddressNumber(value: unknown): string | null {
  return trimmedBetween(value, 1, 10);
}

/**
 * Validates the card part of `POST /api/orders`. The answer never says which field
 * failed: card data must not leak into responses or logs, not even as a hint.
 */
export function parseCardPayment(body: unknown, now: Date = new Date()): CardPaymentParse {
  if (!isRecord(body) || !isRecord(body.card) || !isRecord(body.cardHolder)) return FAIL;
  const { card, cardHolder } = body;

  const number = parseCardNumber(card.number);
  const holderName = parseCardHolderName(card.holderName);
  const expiry = parseCardExpiry(card.expiryMonth, card.expiryYear, now);
  const ccv = parseCardCcv(card.ccv);
  const name = parseHolderName(cardHolder.name);
  const cpf = parseHolderCpf(cardHolder.cpf);
  const postalCode = parsePostalCode(cardHolder.postalCode);
  const addressNumber = parseAddressNumber(cardHolder.addressNumber);
  if (!number || !holderName || !expiry || !ccv || !name || !cpf || !postalCode || !addressNumber) return FAIL;

  const rawInstallments = body.installmentCount === undefined ? 1 : body.installmentCount;
  if (rawInstallments !== 1 && rawInstallments !== 2 && rawInstallments !== 3) return FAIL;

  return {
    ok: true,
    value: {
      card: { number, holderName, expiryMonth: expiry.month, expiryYear: expiry.year, ccv },
      cardHolder: { name, cpf, postalCode, addressNumber },
      installmentCount: rawInstallments,
    },
  };
}

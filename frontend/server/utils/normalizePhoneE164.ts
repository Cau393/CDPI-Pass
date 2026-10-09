import { parsePhoneNumberFromString } from "libphonenumber-js";

export type DefaultCountry = import("libphonenumber-js").CountryCode;

/**
 * Normalize phone to E.164 digits only (no leading '+').
 * Digits-only input is read as E.164; defaultCountry applies to formatted input
 * and to digits that are not a valid E.164 number.
 * @throws Error if empty or not a valid number
 */
export function normalizePhoneE164(
  input: string,
  defaultCountry: DefaultCountry = "BR",
): string {
  const raw = String(input ?? "").trim();
  if (!raw) {
    throw new Error("Telefone é obrigatório");
  }

  // Digits-only is the API/DB contract: E.164 without "+". Parsing it with a
  // default country reads it as a national number ("595…" became "+55595…").
  // Only digits that are no valid E.164 number fall back to the default
  // country: a client that lost its "+55" sends "11987654321".
  let parsed = /^\d+$/.test(raw)
    ? parsePhoneNumberFromString(`+${raw}`)
    : parsePhoneNumberFromString(raw, defaultCountry);
  if (/^\d+$/.test(raw) && !parsed?.isValid()) {
    parsed = parsePhoneNumberFromString(raw, defaultCountry);
  }
  if (!parsed || !parsed.isValid()) {
    throw new Error("Telefone inválido");
  }

  const national = parsed.formatNational().replace(/\D/g, "");
  if (national.length < 8) {
    throw new Error("Telefone inválido");
  }

  return parsed.number.replace(/^\+/, "");
}

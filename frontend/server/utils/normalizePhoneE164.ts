import { parsePhoneNumberFromString } from "libphonenumber-js";

export type DefaultCountry = import("libphonenumber-js").CountryCode;

/**
 * Normalize phone to E.164 digits only (no leading '+').
 * @throws Error if empty or not a valid number for the given defaultCountry context
 */
export function normalizePhoneE164(
  input: string,
  defaultCountry: DefaultCountry = "BR",
): string {
  const raw = String(input ?? "").trim();
  if (!raw) {
    throw new Error("Telefone é obrigatório");
  }

  const parsed = parsePhoneNumberFromString(raw, defaultCountry);
  if (!parsed || !parsed.isValid()) {
    throw new Error("Telefone inválido");
  }

  const national = parsed.formatNational().replace(/\D/g, "");
  if (national.length < 8) {
    throw new Error("Telefone inválido");
  }

  return parsed.number.replace(/^\+/, "");
}

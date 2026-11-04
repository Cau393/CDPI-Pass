import { isGuestBuyerField, type GuestBuyerField } from "@shared/guestBuyerField";
import { accountEmailSchema } from "@shared/schema";
import { normalizePhoneE164 } from "./normalizePhoneE164";
import { profileIdentitySchema } from "./profileUpdateSchema";
import { resolveRegisterIdentity } from "./registerIdentity";
import { toTitleCaseName } from "./toTitleCaseName";

export type GuestBuyer = {
  name: string;
  email: string;
  phone: string;
  document: { isForeigner: boolean; cpf: string | null; foreignDocument: string | null } | null;
  address: string | null;
};

/** `field` names the input that failed, so the client can send the buyer back to it; absent when no input is to blame. */
export type ParseGuestBuyerResult =
  | { ok: true; buyer: GuestBuyer }
  | { ok: false; message: string; field?: GuestBuyerField };

const MISSING_BUYER_MESSAGE = "Informe seus dados para continuar.";

/** A blank string from a form field means "not sent". */
function sentOrUndefined(value: unknown): unknown {
  return typeof value === "string" && value.trim() === "" ? undefined : value;
}

/**
 * The buyer a visitor types at guest checkout (ADR-017) instead of logging in.
 * Name, e-mail and phone follow the signup rules; the document and address reuse
 * the ADR-016 identity schema so the CPF/passport rules live in one place.
 */
export function parseGuestBuyer(input: unknown): ParseGuestBuyerResult {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, message: MISSING_BUYER_MESSAGE };
  }
  const body = input as Record<string, unknown>;

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (name.length < 3) return { ok: false, message: "Nome deve ter pelo menos 3 caracteres", field: "name" };
  if (name.length > 120) return { ok: false, message: "Nome deve ter no máximo 120 caracteres", field: "name" };
  if (/[<>]/.test(name) || /https?:\/\/|www\./i.test(name)) {
    return { ok: false, message: "Nome inválido", field: "name" };
  }

  const email = accountEmailSchema.safeParse(body.email);
  if (!email.success) return { ok: false, message: email.error.errors[0]?.message ?? "Email inválido", field: "email" };

  let phone: string;
  try {
    phone = normalizePhoneE164(typeof body.phone === "string" ? body.phone : "", "BR");
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error && error.message ? error.message : "Telefone inválido",
      field: "phone",
    };
  }

  const parsed = profileIdentitySchema.safeParse({
    isForeigner: body.isForeigner,
    cpf: sentOrUndefined(body.cpf),
    foreignDocument: sentOrUndefined(body.foreignDocument),
    address: sentOrUndefined(body.address),
  });
  if (!parsed.success) {
    const issue = parsed.error.errors[0];
    const field = issue?.path[0];
    return {
      ok: false,
      message: issue?.message ?? "Dados inválidos",
      ...(isGuestBuyerField(field) ? { field } : {}),
    };
  }
  const { isForeigner, cpf, foreignDocument, address } = parsed.data;

  let document: GuestBuyer["document"] = null;
  const sendsDocument = isForeigner === true || cpf !== undefined || foreignDocument !== undefined;
  if (sendsDocument) {
    const identity = resolveRegisterIdentity({ isForeigner, cpf, foreignDocument });
    if (!identity.ok) {
      return { ok: false, message: identity.message, field: isForeigner === true ? "foreignDocument" : "cpf" };
    }
    document = {
      isForeigner: identity.isForeigner,
      cpf: identity.cpf,
      foreignDocument: identity.foreignDocument,
    };
  }

  return {
    ok: true,
    buyer: {
      name: toTitleCaseName(name),
      email: email.data,
      phone,
      document,
      address: address ?? null,
    },
  };
}

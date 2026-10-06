import { formatCpf, validateCpf } from "./validation";

export const FOREIGN_DOCUMENT_PATTERN = /^[A-Z0-9]{5,32}$/;

export const FOREIGN_DOCUMENT_MESSAGE =
  "Documento estrangeiro deve ter 5 a 32 letras ou números";

/** Letters and digits only, uppercase. Hyphens and spaces are removed. */
export function normalizeForeignDocument(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export type RegisterIdentityInput = {
  isForeigner?: boolean;
  cpf?: string | null;
  foreignDocument?: string | null;
};

export type RegisterIdentity =
  | {
      ok: true;
      isForeigner: boolean;
      cpf: string | null;
      foreignDocument: string | null;
    }
  | { ok: false; message: string };

/**
 * Brazilian registration keeps the CPF checksum. A foreigner stores a
 * passport and a null CPF. Mixed bodies are rejected by the Zod schema
 * before this runs; this is the checksum and normalization step.
 */
export function resolveRegisterIdentity(body: RegisterIdentityInput): RegisterIdentity {
  if (body.isForeigner === true) {
    const foreignDocument = normalizeForeignDocument(body.foreignDocument ?? "");
    if (!FOREIGN_DOCUMENT_PATTERN.test(foreignDocument)) {
      return { ok: false, message: FOREIGN_DOCUMENT_MESSAGE };
    }
    return { ok: true, isForeigner: true, cpf: null, foreignDocument };
  }

  if (!body.cpf || !validateCpf(body.cpf)) {
    return { ok: false, message: "CPF inválido" };
  }

  return {
    ok: true,
    isForeigner: false,
    cpf: formatCpf(body.cpf),
    foreignDocument: null,
  };
}

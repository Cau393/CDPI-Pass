import { systemFieldsFor, type SystemField } from "@shared/eventRegistrationForm";

type IdentityEvent = { modality: string | null; isFree: boolean | null };
type IdentityUser = {
  isForeigner: boolean | null;
  cpf: string | null;
  foreignDocument: string | null;
  address: string | null;
};

/**
 * ADR-016 gate for paid and free inscriptions: the locked questions this
 * event needs that the account does not have yet. A foreign account's
 * document is its passport. Existing full profiles are never re-asked.
 */
export function missingIdentityFields(event: IdentityEvent, user: IdentityUser): SystemField[] {
  const hasDocument = user.isForeigner === true ? Boolean(user.foreignDocument) : Boolean(user.cpf);
  return systemFieldsFor(event).filter((field) =>
    field === "document" ? !hasDocument : !user.address?.trim(),
  );
}

const MISSING_LABEL: Record<SystemField, string> = { document: "documento", address: "endereço" };

/** 400 body; the client reopens the registration dialog on this code. */
export function identityRequiredBody(missing: SystemField[]) {
  return {
    code: "identity_required" as const,
    missing,
    message: `Complete seu ${missing.map((field) => MISSING_LABEL[field]).join(" e ")} para se inscrever neste evento.`,
  };
}

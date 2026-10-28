import type { User } from "@shared/schema";
import {
  FOREIGN_PAID_UNAVAILABLE_CODE,
  FOREIGN_PAID_UNAVAILABLE_MESSAGE,
  foreignPaidCheckoutBlocked,
} from "@shared/foreignCheckout";
import { hasPassword } from "../middleware/auth";
import { storage, type IStorage } from "../storage";
import { parseGuestBuyer, type GuestBuyer } from "./guestBuyerSchema";
import { identityRequiredBody, missingIdentityFields } from "./inscriptionIdentity";

export type CheckoutIdentity = {
  isForeigner: boolean;
  cpf: string | null;
  foreignDocument: string | null;
  address: string | null;
};

export type CheckoutBuyerFailure = {
  ok: false;
  status: 400 | 403 | 409;
  body: { code?: string; message: string } & Record<string, unknown>;
};

export type CheckoutBuyerResult =
  | { ok: true; user: User; identity: CheckoutIdentity; placedAsGuest: boolean }
  | CheckoutBuyerFailure;

export type CheckoutBuyerStorage = Pick<
  IStorage,
  "getUserByEmail" | "getUserByCpf" | "getUserByForeignDocument" | "createGuestUser" | "setUserIdentity"
>;

type CheckoutEvent = { modality: string | null; isFree: boolean | null };
type Document = NonNullable<GuestBuyer["document"]>;

/** Generic on purpose: it never says whether the e-mail or the document matched. */
const IDENTITY_CONFLICT: CheckoutBuyerFailure = {
  ok: false,
  status: 409,
  body: {
    code: "identity_conflict",
    message: "Estes dados não conferem com um cadastro existente. Entre na sua conta ou use “Esqueci meu e-mail”.",
  },
};

const foreignPaidFailure: CheckoutBuyerFailure = {
  ok: false,
  status: 403,
  body: { code: FOREIGN_PAID_UNAVAILABLE_CODE, message: FOREIGN_PAID_UNAVAILABLE_MESSAGE },
};

const digits = (value: string | null | undefined) => (value ?? "").replace(/\D/g, "");

/** The document on file for an account, if any. */
function documentOf(user: User): Document | null {
  if (user.isForeigner === true) {
    return user.foreignDocument ? { isForeigner: true, cpf: null, foreignDocument: user.foreignDocument } : null;
  }
  return user.cpf ? { isForeigner: false, cpf: user.cpf, foreignDocument: null } : null;
}

function sameDocument(a: Document, b: Document): boolean {
  if (a.isForeigner !== b.isForeigner) return false;
  return a.isForeigner ? a.foreignDocument === b.foreignDocument : digits(a.cpf) === digits(b.cpf);
}

/**
 * Who is buying (ADR-017). A session user is trusted as-is. A guest is a typed buyer: it
 * becomes a password-less row, or is matched to an existing row without ever writing to a
 * real account's profile. Every refusal happens before any write.
 */
export async function resolveCheckoutBuyer(
  input: { sessionUser: User | undefined; buyer: unknown; event: CheckoutEvent; paid: boolean },
  deps: CheckoutBuyerStorage = storage,
): Promise<CheckoutBuyerResult> {
  const { sessionUser, event, paid } = input;

  if (sessionUser) {
    if (paid && foreignPaidCheckoutBlocked(sessionUser)) return foreignPaidFailure;
    const missing = missingIdentityFields(event, sessionUser);
    if (missing.length > 0) return { ok: false, status: 400, body: identityRequiredBody(missing) };
    return {
      ok: true,
      user: sessionUser,
      identity: {
        isForeigner: sessionUser.isForeigner === true,
        cpf: sessionUser.cpf,
        foreignDocument: sessionUser.foreignDocument,
        address: sessionUser.address,
      },
      placedAsGuest: false,
    };
  }

  const parsed = parseGuestBuyer(input.buyer);
  if (!parsed.ok) return { ok: false, status: 400, body: { code: "invalid_buyer", message: parsed.message } };
  const { buyer } = parsed;
  if (paid && buyer.document && foreignPaidCheckoutBlocked({ isForeigner: buyer.document.isForeigner })) {
    return foreignPaidFailure;
  }

  let existing = await deps.getUserByEmail(buyer.email);
  // A second pass only happens when another request created the row between our read and write.
  for (let attempt = 0; attempt < 2; attempt++) {
    const rowDocument = existing ? documentOf(existing) : null;
    const typed = buyer.document;

    let document: Document | null = rowDocument;
    if (rowDocument && typed) {
      if (!sameDocument(rowDocument, typed)) return IDENTITY_CONFLICT;
    } else if (!rowDocument && typed) {
      const owner = typed.isForeigner
        ? await deps.getUserByForeignDocument(typed.foreignDocument ?? "")
        : await deps.getUserByCpf(typed.cpf ?? "");
      if (owner && owner.id !== existing?.id) return IDENTITY_CONFLICT;
      document = typed;
    }
    if (paid && document && foreignPaidCheckoutBlocked({ isForeigner: document.isForeigner })) {
      return foreignPaidFailure;
    }

    const rowAddress = existing?.address?.trim() ? existing.address : null;
    const address = rowAddress ?? buyer.address;
    const identity: CheckoutIdentity = {
      isForeigner: document?.isForeigner ?? false,
      cpf: document?.cpf ?? null,
      foreignDocument: document?.foreignDocument ?? null,
      address,
    };

    const missing = missingIdentityFields(event, identity);
    if (missing.length > 0) return { ok: false, status: 400, body: identityRequiredBody(missing) };

    if (!existing) {
      try {
        const created = await deps.createGuestUser({
          email: buyer.email,
          name: buyer.name,
          phone: buyer.phone,
          document,
          address,
        });
        return { ok: true, user: created, identity, placedAsGuest: true };
      } catch (error) {
        const code = (error as { code?: string; cause?: { code?: string } })?.code
          ?? (error as { cause?: { code?: string } })?.cause?.code;
        if (code !== "23505") throw error;
        existing = await deps.getUserByEmail(buyer.email);
        if (!existing || attempt > 0) return IDENTITY_CONFLICT;
        continue;
      }
    }

    // A real account is never written to by an unauthenticated request: the typed
    // document lives only in the order snapshot (identity).
    if (!hasPassword(existing)) {
      const documentToWrite = !rowDocument && typed ? typed : undefined;
      const addressToWrite = !rowAddress && buyer.address ? buyer.address : undefined;
      if (documentToWrite || addressToWrite !== undefined) {
        const result = await deps.setUserIdentity(existing.id, {
          ...(documentToWrite ? { document: documentToWrite } : {}),
          ...(addressToWrite !== undefined ? { address: addressToWrite } : {}),
        });
        if (!result.ok) return IDENTITY_CONFLICT;
        return { ok: true, user: result.user, identity, placedAsGuest: true };
      }
    }
    return { ok: true, user: existing, identity, placedAsGuest: true };
  }
  return IDENTITY_CONFLICT;
}

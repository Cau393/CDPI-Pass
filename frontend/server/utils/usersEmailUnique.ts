/**
 * True when Postgres rejected the insert/update because the mailbox
 * already exists (`users_email_unique` or `users_email_lower_unique`).
 * Case variants are the same account.
 */
export function isUsersEmailUniqueViolation(error: unknown): boolean {
  const err = error as {
    code?: string;
    constraint?: string;
    message?: string;
    cause?: { code?: string; constraint?: string; message?: string };
  };
  const code = err?.code ?? err?.cause?.code;
  if (code !== "23505") return false;
  const constraint = err?.constraint ?? err?.cause?.constraint ?? "";
  if (
    constraint === "users_email_unique" ||
    constraint === "users_email_lower_unique"
  ) {
    return true;
  }
  const message = `${err?.message ?? ""} ${err?.cause?.message ?? ""}`;
  return message.includes("users_email");
}

export function isUsersForeignDocumentUniqueViolation(error: unknown): boolean {
  const err = error as {
    code?: string;
    constraint?: string;
    message?: string;
    cause?: { code?: string; constraint?: string; message?: string };
  };
  const code = err?.code ?? err?.cause?.code;
  if (code !== "23505") return false;
  const constraint = err?.constraint ?? err?.cause?.constraint ?? "";
  if (constraint === "users_foreign_document_unique") return true;
  const message = `${err?.message ?? ""} ${err?.cause?.message ?? ""}`;
  return message.includes("users_foreign_document");
}

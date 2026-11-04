/**
 * ADR-018 lead tags: where a ticket's buyer came from (`?tag=` on the event link).
 * The ONLY tag list in the codebase; server, client and the DB CHECK all follow it.
 * Adding a tag: widen the CHECK `orders_lead_tag_chk` on prod BEFORE deploying the code that emits
 * it, or every purchase carrying the new tag fails the constraint and returns a 500.
 */
export const LEAD_TAGS = ["email", "parceiros", "patrocinado", "consultores"] as const;

export type LeadTag = (typeof LEAD_TAGS)[number];

/** Trimmed, lowercased exact member of LEAD_TAGS, else null (never throws, never a 400). */
export function parseLeadTag(v: unknown): LeadTag | null {
  if (typeof v !== "string") return null;
  const s = v.trim().toLowerCase();
  // Array membership, never an object-key lookup: "__proto__" / "constructor" must not match.
  return (LEAD_TAGS as readonly string[]).includes(s) ? (s as LeadTag) : null;
}

export const LEAD_TAG_LABELS: Record<LeadTag, string> = {
  email: "E-mail",
  parceiros: "Parceiros",
  patrocinado: "Patrocinado",
  consultores: "Consultores",
};

/** Label of an order with no (valid) tag. */
export const DIRECT_LEAD_LABEL = "Direto";

export function leadTagLabel(v: unknown): string {
  const tag = parseLeadTag(v);
  return tag ? LEAD_TAG_LABELS[tag] : DIRECT_LEAD_LABEL;
}

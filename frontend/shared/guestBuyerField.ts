/**
 * The guest identity inputs that `POST /api/orders` (and `/subscribe`) name in the `field` key of a
 * 400 `invalid_buyer` (ADR-017 Stage 5 fix), so the client can send the buyer back to that input.
 */
export const GUEST_BUYER_FIELDS = ["name", "email", "phone", "cpf", "foreignDocument", "address"] as const;

export type GuestBuyerField = (typeof GUEST_BUYER_FIELDS)[number];

export function isGuestBuyerField(value: unknown): value is GuestBuyerField {
  return typeof value === "string" && (GUEST_BUYER_FIELDS as readonly string[]).includes(value);
}

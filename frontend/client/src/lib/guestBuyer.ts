/**
 * The buyer a visitor types at guest checkout (ADR-017), in the shape the
 * server's `parseGuestBuyer` reads. `phone` is E.164 digits without "+", as
 * signup sends it. The document and address are present only when the event
 * asked for them.
 */
export interface GuestBuyer {
  name: string;
  email: string;
  phone: string;
  isForeigner?: boolean;
  cpf?: string;
  foreignDocument?: string;
  address?: string;
}

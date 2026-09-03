/**
 * Replace retired contact info in DB-stored email templates.
 *
 * Admins type courtesy/reminder/communicate email bodies in a TipTap editor
 * and save them to the database. Those bodies can contain old phone numbers
 * or old email addresses baked into the HTML. This function rewrites the
 * known retired values to the canonical ones so old templates don't leak
 * stale contact info when they're sent.
 */
import { CONTACT_CHANNELS, CONTACT_EMAIL } from "@shared/contact";

const PRIMARY_WHATSAPP = CONTACT_CHANNELS[1].display;

const REPLACEMENTS: Array<[RegExp, string]> = [
  // Retired site number → primary WhatsApp (covers bare, +55 (62), and (62) formats)
  [/99860-6833/g, PRIMARY_WHATSAPP],
  // Old generic inbox → canonical relacionamento inbox
  [/contato@cdpipharma\.com\.br/gi, CONTACT_EMAIL],
];

export function migrateTemplateContactInfo(html: string): string {
  return REPLACEMENTS.reduce(
    (result, [pattern, replacement]) => result.replace(pattern, replacement),
    html,
  );
}

/**
 * Canonical support contacts shown to customers.
 *
 * One list, used by the site and transactional e-mails. Change the values
 * here — do not keep retired numbers; printed material should match this set.
 */

export const CONTACT_EMAIL = "relacionamento.mkt@cdpipharma.com.br";

export type ContactChannelKind = "landline" | "whatsapp";

export interface ContactChannel {
  kind: ContactChannelKind;
  display: string;
  /** Digits only, country code included, no plus. */
  e164: string;
}

export const CONTACT_CHANNELS: readonly ContactChannel[] = [
  { kind: "landline", display: "+55 (62) 3636-9909", e164: "556236369909" },
  { kind: "whatsapp", display: "(62) 99865-5500", e164: "5562998655500" },
  { kind: "whatsapp", display: "(62) 99610-1694", e164: "5562996101694" },
];

export const CONTACT_PHONES = CONTACT_CHANNELS.map((channel) => channel.display);

export function contactMailtoHref(): string {
  return `mailto:${CONTACT_EMAIL}`;
}

export function contactTelHref(channel: ContactChannel): string {
  return `tel:+${channel.e164}`;
}

export function contactWhatsAppHref(channel: ContactChannel): string {
  return `https://wa.me/${channel.e164}`;
}

export function contactPhoneHref(channel: ContactChannel): string {
  return channel.kind === "whatsapp"
    ? contactWhatsAppHref(channel)
    : contactTelHref(channel);
}

/** One-line rendering for plain-text e-mail footers. */
export const EMAIL_CONTACT_LINE = `${CONTACT_EMAIL} | ${CONTACT_PHONES.join(" / ")}`;

const EMAIL_LINK_STYLE = "color: #0F4C75; text-decoration: none;";

function emailContactPhoneRow(channel: ContactChannel): string {
  const href = contactPhoneHref(channel);
  const label = channel.kind === "whatsapp" ? "WhatsApp" : "Telefone";
  return `<tr>
        <td style="padding: 4px 0;">
          <a href="${href}" style="${EMAIL_LINK_STYLE}">${label}: ${channel.display}</a>
        </td>
      </tr>`;
}

/** Outlook-safe HTML footer: mailto + tel/WhatsApp links, 12px, brand colour. */
export const EMAIL_CONTACT_FOOTER_HTML = `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin: 8px auto 0; font-size: 12px; color: #666; text-align: center;">
      <tr>
        <td style="padding: 4px 0;">
          <a href="${contactMailtoHref()}" style="${EMAIL_LINK_STYLE}">${CONTACT_EMAIL}</a>
        </td>
      </tr>
      ${CONTACT_CHANNELS.map(emailContactPhoneRow).join("")}
    </table>`;

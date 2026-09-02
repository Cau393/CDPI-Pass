/**
 * Support contacts shown to customers.
 *
 * New numbers are ADDED to these lists, never swapped in: a number that is already
 * printed on tickets, e-mails and past material has to keep working.
 */
export const CONTACT_EMAIL = "relacionamento.mkt@cdpipharma.com.br";

/** Newest support line (added 2026-09-02). */
export const CONTACT_PHONE_NEW = "+55 (62) 99865-5500";

/** Site footer and courtesy page, in display order. */
export const SITE_CONTACT_PHONES = ["+55 (62) 99860-6833", CONTACT_PHONE_NEW] as const;

/** Transactional e-mail footers, in display order. */
export const EMAIL_CONTACT_PHONES = [
  "+55 (62) 3636-9909",
  "(62) 99610-1694",
  CONTACT_PHONE_NEW,
] as const;

/** One-line rendering of the e-mail footer contacts. */
export const EMAIL_CONTACT_LINE = `${CONTACT_EMAIL} | ${EMAIL_CONTACT_PHONES.join(" / ")}`;

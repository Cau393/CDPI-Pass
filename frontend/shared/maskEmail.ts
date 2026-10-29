const MASK = "•••••";
const DOMAIN_MASK = "•••";

/**
 * Masks an e-mail for the public "Esqueci meu e-mail" lookup: 2 chars of the
 * local part (1 when it has 2 or fewer), a fixed-length mask so the real length
 * is not leaked, and the first 2 chars of the first domain label. Remaining
 * labels (.com.br) stay. Input without a usable local part or domain is fully masked.
 */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at <= 0 || at === email.length - 1) return MASK;
  const local = Array.from(email.slice(0, at));
  const domain = email.slice(at + 1);
  const dot = domain.indexOf(".");
  const label = Array.from(dot === -1 ? domain : domain.slice(0, dot));
  const rest = dot === -1 ? "" : domain.slice(dot);
  const localKeep = local.length <= 2 ? 1 : 2;
  const labelKeep = Math.min(2, label.length);
  return `${local.slice(0, localKeep).join("")}${MASK}@${label.slice(0, labelKeep).join("")}${DOMAIN_MASK}${rest}`;
}

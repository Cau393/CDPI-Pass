/**
 * Parses naive `yyyy-MM-ddTHH:mm[:ss[.ms]]` from admin/API as wall time in
 * America/Sao_Paulo (fixed UTC-3; Brazil no longer uses DST in most regions).
 * Strings that already include `Z` or a numeric offset are parsed by ECMA Date.
 */
export function parseBrazilEventLocalDateTime(input: string): Date {
  const s = input.trim();
  if (!s) return new Date(Number.NaN);
  if (/[zZ]$/.test(s) || /[+-]\d{2}:\d{2}$/.test(s)) {
    return new Date(s);
  }
  const m = s.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})(:\d{2}(?:\.\d{1,3})?)?$/);
  if (!m) {
    return new Date(s);
  }
  const withSeconds = m[2] ? `${m[1]}${m[2]}` : `${m[1]}:00`;
  return new Date(`${withSeconds}-03:00`);
}

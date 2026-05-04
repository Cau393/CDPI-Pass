/**
 * Validates a post-auth return path for checkout / promo / free cortesia flows.
 * Allowed targets:
 * - `/event/:id` with optional `?promo=` only
 * - `/cortesia` with optional `?code=` only (strict code shape)
 */

const MAX_NEXT_LENGTH = 4096;

/** Single path segment after /event/ (no nested paths). */
const ALLOWED_EVENT_PATH = /^\/event\/[^/]+$/;

/** Matches generated courtesy link codes (server: CDPI + base36 + suffix). */
export const COURTESY_CODE_PARAM_REGEX = /^[A-Za-z0-9_-]{4,80}$/;

function stripTrailingSlash(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }
  return pathname;
}

function isValidCourtesyCodeParam(code: string): boolean {
  return COURTESY_CODE_PARAM_REGEX.test(code);
}

function validatedEventPath(url: URL, pathname: string): string | null {
  if (!ALLOWED_EVENT_PATH.test(pathname)) {
    return null;
  }
  const promo = url.searchParams.get("promo");
  if (promo != null && promo !== "") {
    return `${pathname}?promo=${encodeURIComponent(promo)}`;
  }
  return pathname;
}

function validatedCourtesyPath(url: URL, pathname: string): string | null {
  if (pathname !== "/cortesia") {
    return null;
  }
  const entries = Array.from(url.searchParams.entries());
  if (entries.length === 0) {
    return "/cortesia";
  }
  if (entries.length !== 1 || entries[0][0] !== "code") {
    return "/";
  }
  const code = entries[0][1];
  if (code == null || code === "") {
    return "/";
  }
  if (!isValidCourtesyCodeParam(code)) {
    return "/";
  }
  return `/cortesia?code=${encodeURIComponent(code)}`;
}

/**
 * Returns a safe path+query for wouter `setLocation`, or "/" if invalid or absent.
 * If `next` has multiple `promo` values, the first is kept (rest ignored).
 */
export function getValidatedNextPath(rawNext: string | null | undefined): string {
  if (rawNext == null || rawNext.trim() === "") {
    return "/";
  }

  let decoded = rawNext.trim();
  if (decoded.length > MAX_NEXT_LENGTH) {
    return "/";
  }

  try {
    decoded = decodeURIComponent(decoded);
  } catch {
    return "/";
  }

  if (decoded.length > MAX_NEXT_LENGTH) {
    return "/";
  }

  if (!decoded.startsWith("/") || decoded.startsWith("//")) {
    return "/";
  }

  if (/https?:/i.test(decoded) || /\\/.test(decoded)) {
    return "/";
  }

  // Avoid redirect loops back into auth routes
  if (decoded.startsWith("/login") || decoded.startsWith("/verify-email")) {
    return "/";
  }

  let url: URL;
  try {
    url = new URL(decoded, globalThis.location.origin);
  } catch {
    return "/";
  }

  if (url.origin !== globalThis.location.origin) {
    return "/";
  }

  const pathname = stripTrailingSlash(url.pathname);

  const eventResult = validatedEventPath(url, pathname);
  if (eventResult !== null) {
    return eventResult;
  }

  const courtesyResult = validatedCourtesyPath(url, pathname);
  if (courtesyResult !== null) {
    return courtesyResult;
  }

  return "/";
}

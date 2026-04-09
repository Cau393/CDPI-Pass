/**
 * Validates a post-auth return path for checkout / promo flows.
 * Only same-origin relative paths under /event/:id are allowed, with optional ?promo= only.
 */

const MAX_NEXT_LENGTH = 4096;

/** Single path segment after /event/ (no nested paths). */
const ALLOWED_EVENT_PATH = /^\/event\/[^/]+$/;

function stripTrailingSlash(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }
  return pathname;
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
    url = new URL(decoded, window.location.origin);
  } catch {
    return "/";
  }

  if (url.origin !== window.location.origin) {
    return "/";
  }

  const pathname = stripTrailingSlash(url.pathname);
  if (!ALLOWED_EVENT_PATH.test(pathname)) {
    return "/";
  }

  const promo = url.searchParams.get("promo");
  if (promo != null && promo !== "") {
    return `${pathname}?promo=${encodeURIComponent(promo)}`;
  }

  return pathname;
}

/**
 * Secrets that sign session tokens and ticket QR codes (security backlog #6).
 * Production refuses to boot without them: the fallbacks below are public in
 * this repo, so a token or ticket signed with one can be forged by anyone.
 * Each module reads its secret once, when it loads, so a missing one fails at
 * boot (the deploy's smoke test on a spare port then refuses the cutover)
 * instead of at the first login.
 *
 * Lives in utils, not in middleware/auth.ts, so the e-mail worker and the QR
 * service do not import the HTTP middleware to get it.
 */
function requiredSecret(name: string, devFallback: string): string {
  const value = process.env[name];
  if (value) return value;
  if (process.env.NODE_ENV === "production") {
    throw new Error(`${name} is not set: refusing to start in production without it.`);
  }
  return devFallback;
}

export function getJwtSecret(): string {
  return requiredSecret("JWT_SECRET", "your-secret-key");
}

export function getQrCodeSecret(): string {
  return requiredSecret("QR_CODE_SECRET", "default-secret-key");
}

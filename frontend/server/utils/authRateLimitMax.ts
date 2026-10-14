/**
 * Requests per client address per 15 minutes on /api/auth. The e2e harness logs in
 * from one address far more often than that and raises it with AUTH_RATE_LIMIT_MAX;
 * production ignores that variable, so it can never switch the limit off there.
 */
export function authRateLimitMax(env: NodeJS.ProcessEnv = process.env): number {
  const override = Number(env.AUTH_RATE_LIMIT_MAX);
  if (env.NODE_ENV !== "production" && Number.isInteger(override) && override > 0) return override;
  return 100;
}

/**
 * Requests per client address per 15 minutes on POST /api/auth/lookup-email, on top of
 * authRateLimitMax. Stricter because it maps a document to a (masked) e-mail, so it is
 * an enumeration surface. Tests raise it with LOOKUP_EMAIL_RATE_LIMIT_MAX; production ignores it.
 */
export function lookupEmailRateLimitMax(env: NodeJS.ProcessEnv = process.env): number {
  const override = Number(env.LOOKUP_EMAIL_RATE_LIMIT_MAX);
  if (env.NODE_ENV !== "production" && Number.isInteger(override) && override > 0) return override;
  return 10;
}

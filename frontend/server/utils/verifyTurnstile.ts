const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/**
 * Cloudflare Turnstile check for guest checkout (ADR-017). Without a secret it fails
 * closed in production (same pattern as asaasService.validateWebhookSignature) and
 * passes elsewhere so dev, e2e and tests run offline. Any network or parse error is a failure.
 */
export async function verifyTurnstile(
  token: unknown,
  remoteIp: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  const secret = env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    if (env.NODE_ENV === "production") {
      console.error("TURNSTILE_SECRET_KEY is not set: rejecting the guest checkout request.");
      return false;
    }
    console.warn("TURNSTILE_SECRET_KEY is not set. Skipping Turnstile verification (non-production).");
    return true;
  }
  if (typeof token !== "string" || token === "") return false;

  try {
    const form = new URLSearchParams({ secret, response: token });
    if (remoteIp) form.set("remoteip", remoteIp);
    const response = await fetchImpl(SITEVERIFY_URL, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return false;
    const json = (await response.json()) as { success?: unknown };
    return json.success === true;
  } catch {
    return false;
  }
}

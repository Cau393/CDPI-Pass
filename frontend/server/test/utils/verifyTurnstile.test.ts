import { describe, it, expect, vi, afterEach } from "vitest";
import { verifyTurnstile } from "../../utils/verifyTurnstile";

// ADR-017 Stage 2: Cloudflare Turnstile gate for guest checkout. Fail-closed in production.
const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

function fakeFetch(json: unknown) {
  return vi.fn(async (_url: unknown, _init?: RequestInit) => ({ json: async () => json }) as unknown as Response);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("verifyTurnstile with a secret", () => {
  const env = { TURNSTILE_SECRET_KEY: "s3cret", NODE_ENV: "production" } as NodeJS.ProcessEnv;

  it("is true when Cloudflare says success", async () => {
    const fetchImpl = fakeFetch({ success: true });

    await expect(verifyTurnstile("tok", "203.0.113.9", env, fetchImpl)).resolves.toBe(true);
  });

  it("posts secret, response and remoteip form-encoded to siteverify", async () => {
    const fetchImpl = fakeFetch({ success: true });

    await verifyTurnstile("tok", "203.0.113.9", env, fetchImpl);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(SITEVERIFY);
    expect(init?.method).toBe("POST");
    const form = new URLSearchParams(String(init?.body));
    expect(form.get("secret")).toBe("s3cret");
    expect(form.get("response")).toBe("tok");
    expect(form.get("remoteip")).toBe("203.0.113.9");
  });

  it("omits remoteip when there is no address", async () => {
    const fetchImpl = fakeFetch({ success: true });

    await verifyTurnstile("tok", undefined, env, fetchImpl);

    expect(new URLSearchParams(String(fetchImpl.mock.calls[0][1]?.body)).has("remoteip")).toBe(false);
  });

  it("is false when success is false", async () => {
    await expect(verifyTurnstile("tok", "1.1.1.1", env, fakeFetch({ success: false }))).resolves.toBe(false);
  });

  it("is false when fetch throws", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("network down");
    });

    await expect(verifyTurnstile("tok", "1.1.1.1", env, fetchImpl as unknown as typeof fetch)).resolves.toBe(false);
  });

  it("is false for an empty or non-string token, without calling Cloudflare", async () => {
    const fetchImpl = fakeFetch({ success: true });

    await expect(verifyTurnstile("", "1.1.1.1", env, fetchImpl)).resolves.toBe(false);
    await expect(verifyTurnstile(undefined, "1.1.1.1", env, fetchImpl)).resolves.toBe(false);
    await expect(verifyTurnstile(42, "1.1.1.1", env, fetchImpl)).resolves.toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("verifyTurnstile without a secret", () => {
  it("fails closed in production and never calls Cloudflare", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchImpl = fakeFetch({ success: true });

    await expect(verifyTurnstile("tok", "1.1.1.1", { NODE_ENV: "production" } as NodeJS.ProcessEnv, fetchImpl)).resolves.toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("passes outside production (dev, e2e, tests) without calling Cloudflare", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchImpl = fakeFetch({ success: false });

    await expect(verifyTurnstile(undefined, undefined, { NODE_ENV: "test" } as NodeJS.ProcessEnv, fetchImpl)).resolves.toBe(true);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

import { describe, it, expect, vi, afterEach } from "vitest";

// Security backlog #6: every module that signs or checks with a secret reads it when it
// loads, so a production boot without it fails at once (the deploy smoke test then keeps
// the old build live) instead of signing with the fallback published in this repo.
vi.mock("../../storage", () => ({ storage: {} }));
vi.mock("../../db", () => ({ db: {}, pool: {} }));
vi.mock("../../services/s3Service", () => ({ s3Service: {} }));

const cases: Array<[string, string, () => Promise<unknown>]> = [
  ["JWT_SECRET", "middleware/auth", () => import("../../middleware/auth")],
  ["JWT_SECRET", "print/printCoordinator", () => import("../../print/printCoordinator")],
  // The e-mail worker loads this one: it must not boot on the fallback either.
  ["JWT_SECRET", "services/emailService", () => import("../../services/emailService")],
  ["QR_CODE_SECRET", "services/qrCodeService", () => import("../../services/qrCodeService")],
];

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe.each(cases)("%s in %s", (name, _module, load) => {
  it("refuses to load in production when it is missing", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv(name, "");
    vi.resetModules();
    await expect(load()).rejects.toThrow(name);
  });

  it("loads with the development fallback outside production", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv(name, "");
    vi.resetModules();
    await expect(load()).resolves.toBeDefined();
  });
});

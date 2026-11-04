import { describe, it, expect, vi, beforeEach } from "vitest";
import jwt from "jsonwebtoken";

// ADR-017 Stage 2: the proof of purchase a guest holds while polling check-status.
// It shares the signing secret with every other token, so it must never open a session
// and no other token may stand in for it.
const users = new Map<string, { id: string; password: string | null; email: string }>();
vi.mock("../../storage", () => ({
  storage: { getUser: vi.fn(async (id: string) => users.get(id)) },
}));

const JWT_SECRET = "order-access-token-unit-secret";
process.env.JWT_SECRET = JWT_SECRET;

const {
  orderIdFromAccessToken,
  sessionUserFromToken,
  signOrderAccessToken,
  signPasswordResetToken,
  signSessionToken,
  signEmailVerificationToken,
} = await import("../../middleware/auth");

beforeEach(() => {
  users.clear();
  users.set("u1", { id: "u1", password: "$2a$10$hash-one", email: "a@example.test" });
});

describe("signOrderAccessToken / orderIdFromAccessToken", () => {
  it("round-trips the order id", () => {
    expect(orderIdFromAccessToken(signOrderAccessToken("order-1"))).toBe("order-1");
  });

  it("carries the order id and type only, lasts 24 hours, and has no userId", () => {
    const claims = jwt.verify(signOrderAccessToken("order-1"), JWT_SECRET) as jwt.JwtPayload;

    expect(claims.orderId).toBe("order-1");
    expect(claims.type).toBe("order-access");
    expect(claims.userId).toBeUndefined();
    expect(claims.exp! - claims.iat!).toBe(24 * 3600);
  });

  it("rejects a session token, a reset token and an e-mail verification token", () => {
    expect(orderIdFromAccessToken(signSessionToken(users.get("u1")!))).toBeNull();
    expect(orderIdFromAccessToken(signPasswordResetToken(users.get("u1")!))).toBeNull();
    expect(orderIdFromAccessToken(signEmailVerificationToken("u1"))).toBeNull();
  });

  it("rejects an expired token, a bad signature and garbage", () => {
    const expired = jwt.sign(
      { orderId: "order-1", type: "order-access", exp: Math.floor(Date.now() / 1000) - 10 },
      JWT_SECRET,
    );
    const forged = jwt.sign({ orderId: "order-1", type: "order-access" }, "other-secret");

    expect(orderIdFromAccessToken(expired)).toBeNull();
    expect(orderIdFromAccessToken(forged)).toBeNull();
    expect(orderIdFromAccessToken("not-a-jwt")).toBeNull();
  });

  it("rejects an order-access token whose orderId is not a string", () => {
    expect(orderIdFromAccessToken(jwt.sign({ orderId: 7, type: "order-access" }, JWT_SECRET))).toBeNull();
  });

  it("never opens a session", async () => {
    await expect(sessionUserFromToken(signOrderAccessToken("order-1"))).resolves.toBeNull();
  });
});

describe("password-reset token bound to the e-mail", () => {
  it("is refused after the row's e-mail changes, and accepted while it is the same (case-insensitive)", async () => {
    const { passwordResetUserFromToken } = await import("../../middleware/auth");
    const token = signPasswordResetToken(users.get("u1")!);

    users.get("u1")!.email = "  A@Example.test ";
    expect(await passwordResetUserFromToken(token)).toMatchObject({ id: "u1" });

    users.get("u1")!.email = "b@example.test";
    expect(await passwordResetUserFromToken(token)).toBeNull();
  });

  it("is refused when it carries no e-mail claim", async () => {
    const { passwordResetUserFromToken, passwordVersion } = await import("../../middleware/auth");
    const legacy = jwt.sign(
      { userId: "u1", type: "password-reset", pv: passwordVersion(users.get("u1")!.password) },
      JWT_SECRET,
    );
    expect(await passwordResetUserFromToken(legacy)).toBeNull();
  });
});

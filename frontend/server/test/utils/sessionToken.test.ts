import { describe, it, expect, vi, beforeEach } from "vitest";
import jwt from "jsonwebtoken";

// ADR-017 Stage 1: signup has no e-mail code, so a session must end when the
// owner of the e-mail resets the password (pv claim), and the link tokens
// signed with the same secret (password-reset, email-verification) must never
// open a session.
const users = new Map<string, { id: string; password: string; isAdmin?: boolean }>();
vi.mock("../../storage", () => ({
  storage: { getUser: vi.fn(async (id: string) => users.get(id)) },
}));

const JWT_SECRET = "session-token-unit-secret";
process.env.JWT_SECRET = JWT_SECRET;

const { passwordVersion, sessionUserFromToken, signSessionToken } = await import("../../middleware/auth");

beforeEach(() => {
  users.clear();
  users.set("u1", { id: "u1", password: "$2a$10$hash-one" });
});

describe("signSessionToken", () => {
  it("carries the user id and the password version, and lasts 7 days", () => {
    const claims = jwt.verify(signSessionToken(users.get("u1")!), JWT_SECRET) as jwt.JwtPayload;

    expect(claims.userId).toBe("u1");
    expect(claims.pv).toBe(passwordVersion("$2a$10$hash-one"));
    expect(claims.pv).toHaveLength(12);
    expect(claims.type).toBeUndefined();
    expect(claims.exp! - claims.iat!).toBe(7 * 24 * 3600);
  });

  it("gives a different version once the password hash changes", () => {
    expect(passwordVersion("$2a$10$hash-one")).not.toBe(passwordVersion("$2a$10$hash-two"));
  });
});

describe("sessionUserFromToken", () => {
  it("returns the user for its own session token", async () => {
    await expect(sessionUserFromToken(signSessionToken(users.get("u1")!))).resolves.toMatchObject({ id: "u1" });
  });

  it("rejects a session issued before a password change", async () => {
    const token = signSessionToken(users.get("u1")!);
    users.set("u1", { id: "u1", password: "$2a$10$hash-two" });

    await expect(sessionUserFromToken(token)).resolves.toBeNull();
  });

  it("accepts a token from before the pv claim existed (no mass logout on deploy)", async () => {
    const legacy = jwt.sign({ userId: "u1" }, JWT_SECRET, { expiresIn: "7d" });

    await expect(sessionUserFromToken(legacy)).resolves.toMatchObject({ id: "u1" });
  });

  it.each(["password-reset", "email-verification", "order-access"])("rejects a %s link token", async (type) => {
    const token = jwt.sign({ userId: "u1", type }, JWT_SECRET, { expiresIn: "30m" });

    await expect(sessionUserFromToken(token)).resolves.toBeNull();
  });

  it("rejects a bad signature, an expired token, garbage and an unknown user", async () => {
    const expired = jwt.sign({ userId: "u1", exp: Math.floor(Date.now() / 1000) - 10 }, JWT_SECRET);

    await expect(sessionUserFromToken(jwt.sign({ userId: "u1" }, "other-secret"))).resolves.toBeNull();
    await expect(sessionUserFromToken(expired)).resolves.toBeNull();
    await expect(sessionUserFromToken("not-a-jwt")).resolves.toBeNull();
    await expect(sessionUserFromToken(jwt.sign({ userId: "ghost" }, JWT_SECRET))).resolves.toBeNull();
    await expect(sessionUserFromToken(jwt.sign({ sub: "u1" }, JWT_SECRET))).resolves.toBeNull();
  });
});

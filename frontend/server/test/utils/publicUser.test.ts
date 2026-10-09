import { describe, it, expect } from "vitest";
import { toPublicUser } from "../../utils/publicUser";

describe("toPublicUser", () => {
  it("drops the password hash and the pending verification code, keeps the rest", () => {
    const row = {
      id: "u1",
      email: "a@example.test",
      phone: "595981123456",
      isForeigner: true,
      password: "$2b$10$hash",
      emailVerificationCode: "123456",
      emailVerificationCodeExpiresAt: new Date(),
    };

    expect(toPublicUser(row)).toEqual({
      id: "u1",
      email: "a@example.test",
      phone: "595981123456",
      isForeigner: true,
    });
  });

  it("does not mutate the row", () => {
    const row = { id: "u1", password: "x" };
    toPublicUser(row);
    expect(row).toEqual({ id: "u1", password: "x" });
  });
});

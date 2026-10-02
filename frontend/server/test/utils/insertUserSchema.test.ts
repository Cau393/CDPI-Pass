import { describe, it, expect } from "vitest";
import { courtesyRedemptionSchema, insertUserSchema, loginSchema } from "@shared/schema";

const validUser = {
  email: "maria@example.com",
  password: "secret1",
  name: "Maria Silva",
  cpf: "123.456.789-00",
  phone: "5511999999999",
  birthDate: new Date("1990-01-15"),
  address: "Rua das Flores 123, Sao Paulo SP",
  occupation: "Medica",
  partnerCompany: "CDPI",
  areaOfActivity: "Dermatologia",
};

describe("insertUserSchema registration", () => {
  it("requires occupation, partnerCompany, and areaOfActivity", () => {
    const { occupation: _occupation, ...withoutOccupation } = validUser;
    const { partnerCompany: _partnerCompany, ...withoutCompany } = validUser;
    const { areaOfActivity: _areaOfActivity, ...withoutArea } = validUser;

    expect(insertUserSchema.safeParse(withoutOccupation).success).toBe(false);
    expect(insertUserSchema.safeParse(withoutCompany).success).toBe(false);
    expect(insertUserSchema.safeParse(withoutArea).success).toBe(false);
  });

  it("rejects null, empty, and whitespace-only occupation, partnerCompany, and areaOfActivity", () => {
    for (const value of [null, "", "   "]) {
      expect(insertUserSchema.safeParse({ ...validUser, occupation: value }).success).toBe(false);
      expect(
        insertUserSchema.safeParse({ ...validUser, partnerCompany: value }).success,
      ).toBe(false);
      expect(
        insertUserSchema.safeParse({ ...validUser, areaOfActivity: value }).success,
      ).toBe(false);
    }
  });

  it("accepts trimmed occupation, partnerCompany, and areaOfActivity of 2–255 characters", () => {
    const parsed = insertUserSchema.parse({
      ...validUser,
      occupation: "  Medica  ",
      partnerCompany: "  CDPI  ",
      areaOfActivity: "  Dermatologia  ",
    });
    expect(parsed.occupation).toBe("Medica");
    expect(parsed.partnerCompany).toBe("CDPI");
    expect(parsed.areaOfActivity).toBe("Dermatologia");
  });

  it("trims and lowercases the email", () => {
    const parsed = insertUserSchema.parse({
      ...validUser,
      email: " User@Example.COM ",
    });
    expect(parsed.email).toBe("user@example.com");
  });

  it("rejects an invalid email with Email inválido", () => {
    const result = insertUserSchema.safeParse({
      ...validUser,
      email: "not-an-email",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("Email inválido");
    }
  });
});

describe("loginSchema email", () => {
  it("trims and lowercases the email", () => {
    const parsed = loginSchema.parse({
      email: " User@Example.COM ",
      password: "secret1",
    });
    expect(parsed.email).toBe("user@example.com");
  });
});

describe("courtesyRedemptionSchema email confirm", () => {
  const validCourtesy = {
    name: "Maria Silva",
    email: "maria@example.com",
    emailConfirm: "maria@example.com",
    cpf: "123.456.789-00",
    partnerCompany: "CDPI",
    occupation: "Medica",
    birthDate: "1990-01-15",
    address: "Rua das Flores 123, Sao Paulo SP",
    phone: "5511999999999",
  };

  it("accepts a confirmation that differs only by case and spaces", () => {
    const parsed = courtesyRedemptionSchema.parse({
      ...validCourtesy,
      email: " User@Example.COM ",
      emailConfirm: "user@example.com",
    });
    expect(parsed.email).toBe("user@example.com");
    expect(parsed.emailConfirm).toBe("user@example.com");
  });

  it("rejects a confirmation that is a different mailbox", () => {
    const result = courtesyRedemptionSchema.safeParse({
      ...validCourtesy,
      email: "maria@example.com",
      emailConfirm: "other@example.com",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.message === "Os emails não coincidem")).toBe(
        true,
      );
    }
  });
});

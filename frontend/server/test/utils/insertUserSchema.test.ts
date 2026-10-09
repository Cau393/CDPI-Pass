import { describe, it, expect } from "vitest";
import {
  courtesyRedemptionSchema,
  insertUserSchema,
  loginSchema,
  onlineCourtesyRedemptionSchema,
} from "@shared/schema";

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

  it("accepts a foreigner with a passport and no CPF", () => {
    const { cpf: _cpf, ...withoutCpf } = validUser;
    const parsed = insertUserSchema.parse({
      ...withoutCpf,
      isForeigner: true,
      foreignDocument: "ab-12345",
    });
    expect(parsed.isForeigner).toBe(true);
    expect(parsed.foreignDocument).toBe("ab-12345");
  });

  it("rejects a foreigner without a passport", () => {
    const { cpf: _cpf, ...withoutCpf } = validUser;
    const result = insertUserSchema.safeParse({
      ...withoutCpf,
      isForeigner: true,
    });
    expect(result.success).toBe(false);
  });

  it("rejects CPF and passport together", () => {
    const result = insertUserSchema.safeParse({
      ...validUser,
      isForeigner: true,
      foreignDocument: "AB12345",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a Brazilian registration without CPF", () => {
    const { cpf: _cpf, ...withoutCpf } = validUser;
    expect(insertUserSchema.safeParse(withoutCpf).success).toBe(false);
    expect(insertUserSchema.safeParse({ ...withoutCpf, isForeigner: false }).success).toBe(false);
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

  it("accepts a foreigner passport and no CPF", () => {
    const { cpf: _cpf, ...withoutCpf } = validCourtesy;
    const parsed = courtesyRedemptionSchema.parse({
      ...withoutCpf,
      isForeigner: true,
      foreignDocument: "XY998877",
    });
    expect(parsed.isForeigner).toBe(true);
    expect(parsed.foreignDocument).toBe("XY998877");
  });

  it("rejects a foreigner courtesy redemption without a passport", () => {
    const { cpf: _cpf, ...withoutCpf } = validCourtesy;
    expect(
      courtesyRedemptionSchema.safeParse({ ...withoutCpf, isForeigner: true }).success,
    ).toBe(false);
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

describe("onlineCourtesyRedemptionSchema (ADR-016)", () => {
  const online = {
    name: "Maria Silva",
    email: "maria@example.com",
    emailConfirm: "maria@example.com",
    partnerCompany: "CDPI",
    occupation: "Medica",
    phone: "595981123456",
  };

  it("accepts an online courtesy with no CPF, passport, birth date or address", () => {
    expect(onlineCourtesyRedemptionSchema.safeParse(online).success).toBe(true);
  });

  it("drops document, birth date and address if a client still sends them", () => {
    const parsed = onlineCourtesyRedemptionSchema.parse({
      ...online,
      cpf: "123.456.789-00",
      birthDate: "1990-01-15",
      address: "Rua das Flores 123",
    });
    expect(parsed).toEqual(online);
  });

  it("still rejects mismatched e-mails", () => {
    expect(
      onlineCourtesyRedemptionSchema.safeParse({ ...online, emailConfirm: "other@example.com" }).success,
    ).toBe(false);
  });
});

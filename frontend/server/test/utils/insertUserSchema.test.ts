import { describe, it, expect } from "vitest";
import { insertUserSchema } from "@shared/schema";

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
});

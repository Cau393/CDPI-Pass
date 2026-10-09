import { describe, it, expect } from "vitest";
import {
  profileIdentitySchema,
  profileUpdateSchema,
  PROFILE_SENSITIVE_FIELDS,
} from "../../utils/profileUpdateSchema";

/**
 * Regression tests for a privilege-escalation bug in PUT /api/profile.
 *
 * Before the fix, the route spread `req.body` into the update and deleted a
 * few known-bad keys. `isAdmin` was not among them, so this was enough to
 * take over the site:
 *
 *   PUT /api/profile  {"isAdmin": true}
 *
 * No current password was required, because `isAdmin` is not a "sensitive
 * field". Reproduced end to end against a local build before fixing: a fresh
 * non-admin user went from isAdmin=false to isAdmin=true and then got HTTP 200
 * from GET /api/admin/events.
 */
describe("profileUpdateSchema", () => {
  it("strips isAdmin (the privilege-escalation vector)", () => {
    const parsed = profileUpdateSchema.parse({ isAdmin: true });
    expect(parsed).not.toHaveProperty("isAdmin");
    expect(Object.keys(parsed)).toHaveLength(0);
  });

  it("strips isAdmin even when smuggled alongside a legitimate field", () => {
    const parsed = profileUpdateSchema.parse({
      address: "Avenida Paulista 1000, Sao Paulo SP",
      isAdmin: true,
    });
    expect(parsed).not.toHaveProperty("isAdmin");
    expect(parsed.address).toBe("Avenida Paulista 1000, Sao Paulo SP");
  });

  it("strips every other privilege- or identity-bearing field", () => {
    const parsed = profileUpdateSchema.parse({
      id: "someone-elses-id",
      password: "attacker-controlled",
      cpf: "111.111.111-11",
      isForeigner: true,
      foreignDocument: "AB12345",
      emailVerified: true,
      isAdmin: true,
      createdAt: new Date(0),
      updatedAt: new Date(0),
      emailVerificationCode: "000000",
    });
    expect(Object.keys(parsed)).toHaveLength(0);
  });

  it("keeps a full user object save working, minus the forbidden fields", () => {
    // The profile form is seeded from the current user and posts the whole
    // object back, so this is the shape the real UI sends.
    const parsed = profileUpdateSchema.parse({
      id: "u1",
      name: "Maria Silva",
      email: "maria@example.com",
      phone: "5511999999999",
      address: "Rua das Flores 123, Sao Paulo SP",
      cpf: "123.456.789-00",
      isForeigner: false,
      foreignDocument: "AB12345",
      isAdmin: true,
      emailVerified: true,
      partnerCompany: "Nao aplicavel",
      occupation: "Nao aplicavel",
      areaOfActivity: "Nao aplicavel",
    });
    expect(parsed).toEqual({
      name: "Maria Silva",
      email: "maria@example.com",
      phone: "5511999999999",
      address: "Rua das Flores 123, Sao Paulo SP",
      partnerCompany: "Nao aplicavel",
      occupation: "Nao aplicavel",
      areaOfActivity: "Nao aplicavel",
    });
  });

  it("rejects null or blank occupation, partnerCompany, and areaOfActivity", () => {
    for (const value of [null, "", "   "]) {
      expect(profileUpdateSchema.safeParse({ partnerCompany: value }).success).toBe(false);
      expect(profileUpdateSchema.safeParse({ occupation: value }).success).toBe(false);
      expect(profileUpdateSchema.safeParse({ areaOfActivity: value }).success).toBe(false);
    }
  });

  it("trims occupation, partnerCompany, and areaOfActivity when the value is 2–255 characters", () => {
    const parsed = profileUpdateSchema.parse({
      occupation: "  Medica  ",
      partnerCompany: "  CDPI  ",
      areaOfActivity: "  Dermatologia  ",
    });
    expect(parsed).toEqual({
      occupation: "Medica",
      partnerCompany: "CDPI",
      areaOfActivity: "Dermatologia",
    });
  });

  it("does not fabricate keys that were not sent", () => {
    // Guards against a partial()/default() change that would write nulls over
    // existing columns, e.g. blanking a real admin's isAdmin on save.
    const parsed = profileUpdateSchema.parse({ address: "Rua Um 100, Sao Paulo" });
    expect(Object.keys(parsed)).toEqual(["address"]);
  });

  it("trims and lowercases email", () => {
    const parsed = profileUpdateSchema.parse({ email: " User@Example.COM " });
    expect(parsed.email).toBe("user@example.com");
  });

  it("rejects an invalid email with Email inválido", () => {
    const result = profileUpdateSchema.safeParse({ email: "not-an-email" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("Email inválido");
    }
  });

  it("rejects values that fail validation", () => {
    expect(profileUpdateSchema.safeParse({ email: "not-an-email" }).success).toBe(false);
    expect(profileUpdateSchema.safeParse({ name: "a" }).success).toBe(false);
    expect(profileUpdateSchema.safeParse({ address: "short" }).success).toBe(false);
  });

  it("accepts an empty update", () => {
    expect(profileUpdateSchema.safeParse({}).success).toBe(true);
  });

  it("still gates name/email/phone behind the current password", () => {
    // If a field is ever removed from this list it becomes changeable without
    // re-entering the password, which is an account-takeover primitive.
    expect([...PROFILE_SENSITIVE_FIELDS]).toEqual(["name", "email", "phone"]);
  });
});

describe("profileIdentitySchema (PUT /api/profile/identity)", () => {
  it("rejects a foreigner body that also carries a CPF", () => {
    expect(
      profileIdentitySchema.safeParse({ isForeigner: true, cpf: "529.982.247-25", foreignDocument: "AB12345" }).success,
    ).toBe(false);
  });

  it("rejects a passport on a body that is not marked foreign", () => {
    expect(profileIdentitySchema.safeParse({ cpf: "529.982.247-25", foreignDocument: "AB12345" }).success).toBe(false);
    expect(profileIdentitySchema.safeParse({ foreignDocument: "AB12345" }).success).toBe(false);
  });

  it("accepts a CPF, a passport, or an address alone, and strips every other key", () => {
    expect(profileIdentitySchema.safeParse({ cpf: "529.982.247-25" }).success).toBe(true);
    expect(profileIdentitySchema.safeParse({ isForeigner: true, foreignDocument: "AB12345" }).success).toBe(true);
    expect(profileIdentitySchema.parse({ address: "Av. España 1000, Asunción", isAdmin: true })).toEqual({
      address: "Av. España 1000, Asunción",
    });
  });
});

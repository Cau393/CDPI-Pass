import { describe, it, expect } from "vitest";
import {
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
      isAdmin: true,
      emailVerified: true,
      partnerCompany: null,
    });
    expect(parsed).toEqual({
      name: "Maria Silva",
      email: "maria@example.com",
      phone: "5511999999999",
      address: "Rua das Flores 123, Sao Paulo SP",
      partnerCompany: null,
    });
  });

  it("does not fabricate keys that were not sent", () => {
    // Guards against a partial()/default() change that would write nulls over
    // existing columns, e.g. blanking a real admin's isAdmin on save.
    const parsed = profileUpdateSchema.parse({ address: "Rua Um 100, Sao Paulo" });
    expect(Object.keys(parsed)).toEqual(["address"]);
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

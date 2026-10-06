import { describe, it, expect } from "vitest";
import { resolveRegisterIdentity } from "../../utils/registerIdentity";
import {
  isUsersEmailUniqueViolation,
  isUsersForeignDocumentUniqueViolation,
} from "../../utils/usersEmailUnique";

describe("resolveRegisterIdentity", () => {
  it("rejects a missing CPF when the person is not a foreigner", () => {
    const result = resolveRegisterIdentity({ isForeigner: false, cpf: "" });
    expect(result).toEqual({ ok: false, message: "CPF inválido" });
  });

  it("rejects a formatted CPF that fails the checksum", () => {
    const result = resolveRegisterIdentity({ cpf: "123.456.789-00" });
    expect(result).toEqual({ ok: false, message: "CPF inválido" });
  });

  it("accepts a valid CPF and stores no passport", () => {
    const result = resolveRegisterIdentity({ cpf: "529.982.247-25" });
    expect(result).toEqual({
      ok: true,
      isForeigner: false,
      cpf: "529.982.247-25",
      foreignDocument: null,
    });
  });

  it("skips the CPF checksum for a foreigner and normalizes the passport", () => {
    const result = resolveRegisterIdentity({
      isForeigner: true,
      foreignDocument: " ab-12345 ",
    });
    expect(result).toEqual({
      ok: true,
      isForeigner: true,
      cpf: null,
      foreignDocument: "AB12345",
    });
  });
});

describe("account unique violations", () => {
  it("still treats a duplicate email as Email já cadastrado for any account", () => {
    expect(
      isUsersEmailUniqueViolation({
        code: "23505",
        constraint: "users_email_lower_unique",
      }),
    ).toBe(true);
    expect(
      isUsersForeignDocumentUniqueViolation({
        code: "23505",
        constraint: "users_email_lower_unique",
      }),
    ).toBe(false);
  });

  it("recognizes a duplicate passport constraint", () => {
    expect(
      isUsersForeignDocumentUniqueViolation({
        code: "23505",
        constraint: "users_foreign_document_unique",
      }),
    ).toBe(true);
  });
});

import { describe, it, expect } from "vitest";
import type { RegistrationField } from "@shared/eventRegistrationForm";
import { registrationFormsEqual } from "../../utils/registrationFormEqual";

const cargo: RegistrationField = {
  id: "f-cargo",
  type: "text",
  label: "Cargo",
  options: [],
  required: true,
  archived: false,
};
const turno: RegistrationField = {
  id: "f-turno",
  type: "radio",
  label: "Turno",
  options: ["Manhã", "Tarde"],
  required: false,
  archived: false,
};

/** jsonb returns keys sorted by length then alphabetically, the app builds them in another order. */
function reorderKeys<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).reverse()) as T;
}

describe("registrationFormsEqual", () => {
  it("treats the same form with a different key order as unchanged", () => {
    expect(registrationFormsEqual([cargo, turno], [reorderKeys(cargo), reorderKeys(turno)])).toBe(true);
  });

  it("treats a reordered field list as changed", () => {
    expect(registrationFormsEqual([cargo, turno], [turno, cargo])).toBe(false);
  });

  it("detects a changed label, option, required flag or archived flag", () => {
    expect(registrationFormsEqual([cargo], [{ ...cargo, label: "Função" }])).toBe(false);
    expect(registrationFormsEqual([turno], [{ ...turno, options: ["Manhã"] }])).toBe(false);
    expect(registrationFormsEqual([cargo], [{ ...cargo, required: false }])).toBe(false);
    expect(registrationFormsEqual([cargo], [{ ...cargo, archived: true }])).toBe(false);
  });

  it("treats an empty form and a missing one as equal", () => {
    expect(registrationFormsEqual([], null)).toBe(true);
    expect(registrationFormsEqual(undefined, [])).toBe(true);
    expect(registrationFormsEqual([cargo], null)).toBe(false);
  });
});

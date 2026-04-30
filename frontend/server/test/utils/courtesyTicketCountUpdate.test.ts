import { describe, it, expect } from "vitest";
import { validateCourtesyTicketCountUpdate } from "../../utils/courtesyTicketCountUpdate";

describe("validateCourtesyTicketCountUpdate", () => {
  it("accepts integer >= usedCount", () => {
    expect(
      validateCourtesyTicketCountUpdate({ usedCount: 3, nextTicketCount: 5 }),
    ).toBeNull();
    expect(
      validateCourtesyTicketCountUpdate({ usedCount: 3, nextTicketCount: 3 }),
    ).toBeNull();
  });

  it("rejects non-integer or non-number", () => {
    expect(
      validateCourtesyTicketCountUpdate({ usedCount: 0, nextTicketCount: 1.5 }),
    ).toBe("Informe um limite inteiro válido.");
    expect(
      validateCourtesyTicketCountUpdate({ usedCount: 0, nextTicketCount: "5" }),
    ).toBe("Informe um limite inteiro válido.");
  });

  it("rejects below 1", () => {
    expect(
      validateCourtesyTicketCountUpdate({ usedCount: 0, nextTicketCount: 0 }),
    ).toBe("O limite deve ser pelo menos 1.");
  });

  it("rejects when new max < usedCount", () => {
    expect(
      validateCourtesyTicketCountUpdate({ usedCount: 5, nextTicketCount: 4 }),
    ).toBe("Limite não pode ser menor que o número de usos já registrados.");
  });
});

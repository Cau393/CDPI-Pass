import { describe, it, expect } from "vitest";
import type { CourtesyAttendee, User } from "@shared/schema";
import {
  resolveCompanyLineForPrint,
  resolveDisplayNameForPrint,
} from "../../utils/printDisplayName";

describe("resolveDisplayNameForPrint", () => {
  it("prefers courtesy attendee name", () => {
    const buyer = { name: "Buyer" } as User;
    const courtesy = { name: "  Guest Name  " } as CourtesyAttendee;
    expect(resolveDisplayNameForPrint(buyer, courtesy)).toBe("Guest Name");
  });

  it("falls back to buyer name", () => {
    const buyer = { name: "Maria" } as User;
    expect(resolveDisplayNameForPrint(buyer, undefined)).toBe("Maria");
  });

  it("uses Participante when no names", () => {
    expect(resolveDisplayNameForPrint(undefined, undefined)).toBe("Participante");
  });
});

describe("resolveCompanyLineForPrint", () => {
  it("returns trimmed partner company from courtesy", () => {
    const ca = { partnerCompany: "  Acme SA  " } as CourtesyAttendee;
    expect(resolveCompanyLineForPrint(ca)).toBe("Acme SA");
  });

  it("returns null when no courtesy or empty company", () => {
    expect(resolveCompanyLineForPrint(undefined)).toBeNull();
    expect(
      resolveCompanyLineForPrint({ partnerCompany: "  " } as CourtesyAttendee),
    ).toBeNull();
  });
});

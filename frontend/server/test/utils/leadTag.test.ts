import { describe, it, expect } from "vitest";
import {
  LEAD_TAGS,
  LEAD_TAG_LABELS,
  DIRECT_LEAD_LABEL,
  parseLeadTag,
  leadTagLabel,
} from "@shared/leadTag";

describe("parseLeadTag", () => {
  it.each(["email", "parceiros", "patrocinado", "consultores"])("accepts %s", (tag) => {
    expect(parseLeadTag(tag)).toBe(tag);
  });

  it("trims and lowercases", () => {
    expect(parseLeadTag(" Parceiros ")).toBe("parceiros");
    expect(parseLeadTag("EMAIL")).toBe("email");
  });

  it.each([
    "bogus",
    "",
    "   ",
    null,
    undefined,
    42,
    {},
    ["email"],
    "__proto__",
    "constructor",
    "toString",
    "hasOwnProperty",
  ])("rejects %j", (v) => {
    expect(parseLeadTag(v)).toBeNull();
  });
});

describe("leadTagLabel", () => {
  it("maps every tag to its label", () => {
    expect(LEAD_TAGS.map((t) => leadTagLabel(t))).toEqual([
      "E-mail",
      "Parceiros",
      "Patrocinado",
      "Consultores",
    ]);
    expect(LEAD_TAG_LABELS.email).toBe("E-mail");
  });

  it("falls back to Direto for null, unknown and non-string", () => {
    expect(DIRECT_LEAD_LABEL).toBe("Direto");
    for (const v of [null, undefined, "bogus", "__proto__", 7]) {
      expect(leadTagLabel(v)).toBe("Direto");
    }
  });
});

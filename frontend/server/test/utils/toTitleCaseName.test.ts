import { describe, it, expect } from "vitest";
import { toTitleCaseName } from "../../utils/toTitleCaseName";

describe("toTitleCaseName", () => {
  it("returns empty for whitespace", () => {
    expect(toTitleCaseName("   ")).toBe("");
  });

  it("single word", () => {
    expect(toTitleCaseName("josé")).toBe("José");
  });

  it("MARIA DA SILVA", () => {
    expect(toTitleCaseName("MARIA DA SILVA")).toBe("Maria da Silva");
  });

  it("particle at start stays capitalized (Da Silva)", () => {
    expect(toTitleCaseName("da silva")).toBe("Da Silva");
  });

  it("hyphenated name", () => {
    expect(toTitleCaseName("MARIA-CLARA")).toBe("Maria-Clara");
  });

  it("apostrophe (D'Avila style)", () => {
    expect(toTitleCaseName("d'avila")).toBe("D'Avila");
  });

  it("mixed MACARRão", () => {
    expect(toTitleCaseName("MACARRão")).toBe("Macarrão");
  });
});

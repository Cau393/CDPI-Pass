import { describe, it, expect } from "vitest";
import { decodeCsvBuffer } from "../../utils/decodeCsvBuffer";

/** "Cauê" in Windows-1252 / ISO-8859-1 (Excel default in Brazil). */
const LATIN1_CAUE = Buffer.from([0x43, 0x61, 0x75, 0xea]);

describe("decodeCsvBuffer", () => {
  it("keeps ê when the CSV is Windows-1252 / Latin-1", () => {
    expect(decodeCsvBuffer(LATIN1_CAUE)).toBe("Cauê");
  });

  it("does not replace Latin-1 ê with U+FFFD", () => {
    expect(decodeCsvBuffer(LATIN1_CAUE)).not.toContain("\uFFFD");
  });

  it("keeps ê when the CSV is UTF-8", () => {
    expect(decodeCsvBuffer(Buffer.from("Cauê", "utf8"))).toBe("Cauê");
  });

  it("strips a UTF-8 BOM before decoding", () => {
    const bom = Buffer.from([0xef, 0xbb, 0xbf]);
    const body = Buffer.from("Cauê", "utf8");
    expect(decodeCsvBuffer(Buffer.concat([bom, body]))).toBe("Cauê");
  });

  it("keeps ç ã á from a Latin-1 spreadsheet export", () => {
    // "Gonçalves" — ç is 0xE7 in Latin-1
    const latin1 = Buffer.from([0x47, 0x6f, 0x6e, 0xe7, 0x61, 0x6c, 0x76, 0x65, 0x73]);
    expect(decodeCsvBuffer(latin1)).toBe("Gonçalves");
  });

  it("does not turn a UTF-8 ê into mojibake Ãª", () => {
    expect(decodeCsvBuffer(Buffer.from("Cauê", "utf8"))).not.toContain("Ã");
  });
});

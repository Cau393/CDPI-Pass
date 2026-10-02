import { describe, it, expect } from "vitest";
import { courtesyEntryUrl } from "../../utils/courtesyEntryUrl";

const BASE = "https://cdpipass.com.br";
const EVENT_ID = "11111111-1111-1111-1111-111111111111";
const CODE = "CDPITEST123";

describe("courtesyEntryUrl", () => {
  it("sends a free courtesy code to the event page", () => {
    expect(courtesyEntryUrl(BASE, EVENT_ID, CODE, null)).toBe(
      `${BASE}/event/${EVENT_ID}?cortesia=${CODE}`,
    );
    expect(courtesyEntryUrl(BASE, EVENT_ID, CODE)).toBe(
      `${BASE}/event/${EVENT_ID}?cortesia=${CODE}`,
    );
    expect(courtesyEntryUrl(BASE, EVENT_ID, CODE, "")).toBe(
      `${BASE}/event/${EVENT_ID}?cortesia=${CODE}`,
    );
  });

  it("keeps a promo override on the event page promo query", () => {
    expect(courtesyEntryUrl(BASE, EVENT_ID, CODE, "49.90")).toBe(
      `${BASE}/event/${EVENT_ID}?promo=${CODE}`,
    );
    expect(courtesyEntryUrl(BASE, EVENT_ID, CODE, 10)).toBe(
      `${BASE}/event/${EVENT_ID}?promo=${CODE}`,
    );
  });
});

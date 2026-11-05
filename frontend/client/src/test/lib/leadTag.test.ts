import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildTaggedEventUrl,
  captureLeadTagFromUrl,
  getLeadTag,
  resetLeadTagMemoryForTests,
} from "../../lib/leadTag";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

function clearCookies() {
  for (const id of [A, B]) {
    document.cookie = `cdpi_lt_${id}=; Path=/; Max-Age=0`;
  }
}

function setPath(path: string) {
  window.history.replaceState({}, "", path);
}

beforeEach(() => {
  resetLeadTagMemoryForTests();
  clearCookies();
  localStorage.clear();
  sessionStorage.clear();
  setPath("/");
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("captureLeadTagFromUrl", () => {
  it("writes every layer for a valid tag", () => {
    captureLeadTagFromUrl(A, "?tag=parceiros");
    expect(document.cookie).toContain(`cdpi_lt_${A}=parceiros`);
    expect(localStorage.getItem(`cdpi:lt:${A}`)).toBe("parceiros");
    expect(sessionStorage.getItem(`cdpi:lt:${A}`)).toBe("parceiros");
    // memory layer alone still answers once the browser layers are gone
    clearCookies();
    localStorage.clear();
    sessionStorage.clear();
    expect(getLeadTag(A)).toBe("parceiros");
  });

  it("normalizes case and whitespace like the server", () => {
    captureLeadTagFromUrl(A, "?tag=%20Email%20");
    expect(localStorage.getItem(`cdpi:lt:${A}`)).toBe("email");
  });

  it("ignores an invalid or missing tag and writes nothing", () => {
    const cookieSet = vi.spyOn(document, "cookie", "set");
    captureLeadTagFromUrl(A, "?tag=hacker");
    captureLeadTagFromUrl(A, "?tag=__proto__");
    captureLeadTagFromUrl(A, "?promo=X");
    captureLeadTagFromUrl(A, "");
    expect(cookieSet).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
    expect(getLeadTag(A)).toBeNull();
  });

  it("an untagged visit keeps the stored tag", () => {
    captureLeadTagFromUrl(A, "?tag=email");
    captureLeadTagFromUrl(A, "");
    captureLeadTagFromUrl(A, "?tag=bogus");
    expect(getLeadTag(A)).toBe("email");
  });

  it("does not leak event A's tag into event B", () => {
    captureLeadTagFromUrl(A, "?tag=email");
    expect(getLeadTag(B)).toBeNull();
  });

  it("cookie has Path=/, Max-Age=2592000, SameSite=Lax and no Secure on http", () => {
    const cookieSet = vi.spyOn(document, "cookie", "set");
    captureLeadTagFromUrl(A, "?tag=consultores");
    expect(cookieSet).toHaveBeenCalledTimes(1);
    const written = String(cookieSet.mock.calls[0][0]);
    expect(written).toBe(`cdpi_lt_${A}=consultores; Path=/; Max-Age=2592000; SameSite=Lax`);
  });

  it("adds Secure on https", () => {
    vi.stubGlobal("location", { ...window.location, protocol: "https:", pathname: "/", search: "" });
    const cookieSet = vi.spyOn(document, "cookie", "set");
    captureLeadTagFromUrl(A, "?tag=consultores");
    expect(String(cookieSet.mock.calls[0][0])).toBe(
      `cdpi_lt_${A}=consultores; Path=/; Max-Age=2592000; SameSite=Lax; Secure`,
    );
    vi.unstubAllGlobals();
  });

  it("still writes the other layers when localStorage throws", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage) {
      if (this === localStorage) throw new Error("denied");
    });
    expect(() => captureLeadTagFromUrl(A, "?tag=email")).not.toThrow();
    expect(document.cookie).toContain(`cdpi_lt_${A}=email`);
  });
});

describe("unsafe event ids (cookie name comes from a raw route param)", () => {
  const unsafe = ["abc;Domain=evil.test", "a=b", "has space", "x".repeat(65), "x".repeat(3900), ""];

  it.each(unsafe)("writes nothing and reads null for %j", (bad) => {
    const cookieSet = vi.spyOn(document, "cookie", "set");
    const lsSet = vi.spyOn(Storage.prototype, "setItem");
    captureLeadTagFromUrl(bad, "?tag=email");
    expect(cookieSet).not.toHaveBeenCalled();
    expect(lsSet).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
    expect(getLeadTag(bad)).toBeNull();
  });

  it("getLeadTag ignores even a pre-existing value under an unsafe id", () => {
    const bad = "a=b";
    localStorage.setItem(`cdpi:lt:${bad}`, "email");
    expect(getLeadTag(bad)).toBeNull();
  });

  it("accepts a 64-char id and a legacy non-uuid id", () => {
    captureLeadTagFromUrl("a".repeat(64), "?tag=email");
    expect(getLeadTag("a".repeat(64))).toBe("email");
    captureLeadTagFromUrl("legacy_Event-1", "?tag=parceiros");
    expect(getLeadTag("legacy_Event-1")).toBe("parceiros");
  });
});

describe("getLeadTag precedence", () => {
  it("URL > cookie > localStorage > sessionStorage > memory", () => {
    captureLeadTagFromUrl(A, "?tag=consultores"); // memory
    clearCookies();
    localStorage.clear();
    sessionStorage.clear();
    sessionStorage.setItem(`cdpi:lt:${A}`, "patrocinado");
    expect(getLeadTag(A)).toBe("patrocinado");
    localStorage.setItem(`cdpi:lt:${A}`, "parceiros");
    expect(getLeadTag(A)).toBe("parceiros");
    document.cookie = `cdpi_lt_${A}=email; Path=/`;
    expect(getLeadTag(A)).toBe("email");
    setPath(`/event/${A}?tag=consultores`);
    expect(getLeadTag(A)).toBe("consultores");
  });

  it("ignores the URL tag on a different pathname", () => {
    setPath(`/event/${B}?tag=email`);
    expect(getLeadTag(A)).toBeNull();
    expect(getLeadTag(B)).toBe("email");
    setPath(`/cortesia?tag=email`);
    expect(getLeadTag(A)).toBeNull();
    expect(getLeadTag(B)).toBeNull();
  });

  it("skips a tampered stored value and falls to the next layer", () => {
    document.cookie = `cdpi_lt_${A}=evil; Path=/`;
    localStorage.setItem(`cdpi:lt:${A}`, "<script>");
    sessionStorage.setItem(`cdpi:lt:${A}`, "patrocinado");
    expect(getLeadTag(A)).toBe("patrocinado");
  });

  it("falls back when localStorage throws on read", () => {
    sessionStorage.setItem(`cdpi:lt:${A}`, "email");
    const real = Storage.prototype.getItem;
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(function (this: Storage, k: string) {
      if (this === localStorage) throw new Error("denied");
      return real.call(this, k);
    });
    expect(getLeadTag(A)).toBe("email");
  });

  it("falls to memory when both storages throw", () => {
    captureLeadTagFromUrl(A, "?tag=email");
    clearCookies();
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    expect(getLeadTag(A)).toBe("email");
  });
});

describe("buildTaggedEventUrl", () => {
  it("builds origin/event/<id>?tag=<tag>", () => {
    expect(buildTaggedEventUrl("https://pass.example", A, "email")).toBe(
      `https://pass.example/event/${A}?tag=email`,
    );
  });
  it("encodes the id", () => {
    expect(buildTaggedEventUrl("https://pass.example", "a b/c", "parceiros")).toBe(
      "https://pass.example/event/a%20b%2Fc?tag=parceiros",
    );
  });
});

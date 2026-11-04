import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { apiRequest } from "@/lib/queryClient";

describe("apiRequest extra headers", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    localStorage.clear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("merges the 4th-arg headers and keeps Bearer and JSON content type", async () => {
    localStorage.setItem("token", "jwt-1");
    await apiRequest("POST", "/api/orders/7/check-status", { a: 1 }, { "X-Order-Access": "tok" });
    const init = fetchMock.mock.calls[0][1];
    expect(init.headers).toMatchObject({
      Authorization: "Bearer jwt-1",
      "X-Order-Access": "tok",
      "Content-Type": "application/json",
    });
  });

  it("sends the header without a body or a session", async () => {
    await apiRequest("POST", "/api/orders/7/check-status", undefined, { "X-Order-Access": "tok" });
    const init = fetchMock.mock.calls[0][1];
    expect(init.headers).toEqual({ "X-Order-Access": "tok" });
    expect(init.body).toBeUndefined();
  });
});

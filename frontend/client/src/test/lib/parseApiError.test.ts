import { describe, it, expect } from "vitest";
import { parseApiError, parseApiErrorMessage } from "@/lib/eventForm";

describe("parseApiError", () => {
  it("reads status, code, message and body from a JSON error", () => {
    const err = new Error('402: {"code":"card_declined","message":"Cartão recusado."}');
    expect(parseApiError(err)).toEqual({
      status: 402,
      code: "card_declined",
      message: "Cartão recusado.",
      body: { code: "card_declined", message: "Cartão recusado." },
    });
  });

  it("keeps the status for a non-JSON body", () => {
    const r = parseApiError(new Error("504: <html>Gateway Time-out</html>"));
    expect(r.status).toBe(504);
    expect(r.code).toBeUndefined();
    expect(r.body).toBeUndefined();
  });

  it("falls back to `error` when there is no message", () => {
    expect(parseApiError(new Error('400: {"error":"ruim"}')).message).toBe("ruim");
  });

  it("returns status null for network failures and unknown values", () => {
    expect(parseApiError(new TypeError("Failed to fetch")).status).toBeNull();
    expect(parseApiError(new Error("boom")).status).toBeNull();
    expect(parseApiError("x")).toEqual({ status: null });
  });

  it("ignores non-object JSON bodies", () => {
    const r = parseApiError(new Error("500: 42"));
    expect(r.status).toBe(500);
    expect(r.body).toBeUndefined();
  });
});

describe("parseApiErrorMessage (order cancel 409)", () => {
  it("shows the server's PT message, not the raw status and JSON", () => {
    const err = new Error('409: {"message":"Não foi possível cancelar agora; tente novamente em alguns minutos."}');
    expect(parseApiErrorMessage(err)).toBe("Não foi possível cancelar agora; tente novamente em alguns minutos.");
  });
});

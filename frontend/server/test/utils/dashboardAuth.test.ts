import { describe, it, expect, vi, afterEach } from "vitest";
import { dashboardAuth } from "../../utils/dashboardAuth";

const TOKEN = "unit-test-dashboard-token-0123456789abcdef";

function run(authorization?: string) {
  const req: any = { headers: authorization === undefined ? {} : { authorization } };
  const res: any = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(b: unknown) {
      this.body = b;
      return this;
    },
  };
  const next = vi.fn();
  dashboardAuth(req, res, next);
  return { res, next };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("dashboardAuth", () => {
  it("answers 503 when DASHBOARD_API_TOKEN is unset, empty or blank, even with a header", () => {
    for (const v of [undefined, "", "   "]) {
      if (v === undefined) delete process.env.DASHBOARD_API_TOKEN;
      else vi.stubEnv("DASHBOARD_API_TOKEN", v);
      const { res, next } = run(`Bearer ${TOKEN}`);
      expect(res.statusCode).toBe(503);
      expect(res.body).toEqual({ message: expect.any(String) });
      expect(next).not.toHaveBeenCalled();
    }
  });

  it("answers 401 for a missing header, a wrong scheme and a wrong token", () => {
    vi.stubEnv("DASHBOARD_API_TOKEN", TOKEN);
    for (const header of [
      undefined,
      "",
      `Basic ${TOKEN}`,
      TOKEN,
      "Bearer ",
      "Bearer wrong-token-of-another-length",
      `Bearer ${TOKEN.replace(/.$/, "x")}`, // same length, last char differs
      `Bearer ${TOKEN}extra`,
    ]) {
      const { res, next } = run(header);
      expect(res.statusCode, String(header)).toBe(401);
      expect(next).not.toHaveBeenCalled();
    }
  });

  it("calls next() for the right token", () => {
    vi.stubEnv("DASHBOARD_API_TOKEN", TOKEN);
    const { res, next } = run(`Bearer ${TOKEN}`);
    expect(next).toHaveBeenCalledOnce();
    expect(res.body).toBeUndefined();
  });

  it("reads the env per request and never echoes the token", () => {
    vi.stubEnv("DASHBOARD_API_TOKEN", TOKEN);
    expect(run(`Bearer ${TOKEN}`).next).toHaveBeenCalledOnce();
    vi.stubEnv("DASHBOARD_API_TOKEN", "rotated-token");
    const { res } = run(`Bearer ${TOKEN}`);
    expect(res.statusCode).toBe(401);
    expect(JSON.stringify(res.body)).not.toContain(TOKEN);
    expect(JSON.stringify(res.body)).not.toContain("rotated-token");
  });
});

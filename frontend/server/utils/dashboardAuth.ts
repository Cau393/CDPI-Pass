import { createHash, timingSafeEqual } from "crypto";
import type { NextFunction, Request, Response } from "express";

const sha256 = (value: string) => createHash("sha256").update(value).digest();

/**
 * Bearer-token gate for the external Masterclass dashboard (ADR-018). Not a user session: one shared
 * secret in `DASHBOARD_API_TOKEN`, read on every request. Unset or blank closes the endpoint (503)
 * instead of leaving it open. Both sides are hashed first, so `timingSafeEqual` always gets two
 * 32-byte buffers (no throw on different lengths, no length leak). The token is never logged or echoed.
 */
export function dashboardAuth(req: Request, res: Response, next: NextFunction) {
  const expected = (process.env.DASHBOARD_API_TOKEN ?? "").trim();
  if (!expected) {
    return res.status(503).json({ message: "Painel indisponível: token não configurado." });
  }

  const header = req.headers.authorization;
  const match = typeof header === "string" ? /^Bearer (.+)$/.exec(header) : null;
  if (!match || !timingSafeEqual(sha256(match[1].trim()), sha256(expected))) {
    return res.status(401).json({ message: "Não autorizado." });
  }
  next();
}

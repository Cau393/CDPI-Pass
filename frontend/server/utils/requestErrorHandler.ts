import type { NextFunction, Request, Response } from "express";

/**
 * Global Express error handler. A body-parser parse failure gets a fixed answer and is not rethrown:
 * its message holds a snippet of the raw body, which on POST /api/orders can be card data.
 */
export function requestErrorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  if (err?.type === "entity.parse.failed") {
    res.status(400).json({ message: "Requisição inválida." });
    return;
  }
  const status = err.status || err.statusCode || 500;
  const message = err.message || "Internal Server Error";
  res.status(status).json({ message });
  throw err;
}

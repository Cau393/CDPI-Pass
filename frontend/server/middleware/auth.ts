import { createHash } from "crypto";
import jwt from "jsonwebtoken";
import { storage } from "../storage";
import type { Request, Response, NextFunction } from "express";
import type { User } from "@shared/schema";
import { getJwtSecret } from "../utils/requiredSecret";

const JWT_SECRET = getJwtSecret();

interface AuthenticatedRequest extends Request {
  user?: User;
}

/**
 * Short fingerprint of the stored password hash. A session carries it as `pv`,
 * so a password reset or change ends every session issued before it. Since
 * signup has no e-mail code (ADR-017), this is what stops whoever typed
 * someone else's e-mail from keeping a session once the owner resets it.
 */
export function passwordVersion(passwordHash: string): string {
  return createHash("sha256").update(passwordHash).digest("hex").slice(0, 12);
}

export function signSessionToken(user: Pick<User, "id" | "password">): string {
  return jwt.sign({ userId: user.id, pv: passwordVersion(user.password) }, JWT_SECRET, { expiresIn: "7d" });
}

/**
 * The user a session token belongs to, or null. Link tokens signed with the
 * same secret (password-reset, email-verification, ...) carry a `type` claim
 * and never open a session. A token without `pv` predates the claim and is
 * accepted until it expires, so the deploy logs no one out.
 */
export async function sessionUserFromToken(token: string): Promise<User | null> {
  let claims: jwt.JwtPayload;
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (typeof decoded === "string") return null;
    claims = decoded;
  } catch {
    return null;
  }
  if (claims.type !== undefined || typeof claims.userId !== "string") return null;
  const user = await storage.getUser(claims.userId);
  if (!user) return null;
  if (claims.pv !== undefined && claims.pv !== passwordVersion(user.password)) return null;
  return user;
}

export const authenticateToken = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    res.status(401).json({ message: "Token de acesso requerido" });
    return;
  }

  try {
    const user = await sessionUserFromToken(token);
    if (!user) {
      res.status(401).json({ message: "Sessão inválida ou expirada" });
      return;
    }
    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
};

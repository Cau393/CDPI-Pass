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
export function passwordVersion(passwordHash: string | null): string {
  // A guest row has no password yet (NULL); it fingerprints as the empty hash.
  return createHash("sha256").update(passwordHash ?? "").digest("hex").slice(0, 12);
}

/** True for an account that can log in: a guest row (ADR-017) has a NULL password. */
export function hasPassword<T extends Pick<User, "password">>(user: T): user is T & { password: string } {
  return typeof user.password === "string" && user.password.length > 0;
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

/** Same expiry the password e-mail has always used. */
const PASSWORD_RESET_EXPIRES_IN = "30m";

/**
 * Proof of purchase a guest holds to poll check-status (ADR-017). Carries the
 * order id only: it never opens a session, and no other token stands in for it.
 */
export function signOrderAccessToken(orderId: string): string {
  return jwt.sign({ orderId, type: "order-access" }, JWT_SECRET, { expiresIn: "24h" });
}

export function orderIdFromAccessToken(token: string): string | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (typeof decoded === "string") return null;
    if (decoded.type !== "order-access" || typeof decoded.orderId !== "string") return null;
    return decoded.orderId;
  } catch {
    return null;
  }
}

/** Link in the guest ticket e-mail; GET /api/auth/verify-email accepts it. */
export function signEmailVerificationToken(userId: string): string {
  return jwt.sign({ userId, type: "email-verification" }, JWT_SECRET, { expiresIn: "30d" });
}

/**
 * Reset (or create-password) link. `pv` ties it to the current hash, so using it
 * once, or any other password change, invalidates it.
 */
export function signPasswordResetToken(user: Pick<User, "id" | "password">): string {
  return jwt.sign(
    { userId: user.id, type: "password-reset", pv: passwordVersion(user.password) },
    JWT_SECRET,
    { expiresIn: PASSWORD_RESET_EXPIRES_IN },
  );
}

/** The user a valid, still-unused password-reset token belongs to, or null. Expired tokens are null too. */
export async function passwordResetUserFromToken(token: string): Promise<User | null> {
  let claims: jwt.JwtPayload;
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (typeof decoded === "string") return null;
    claims = decoded;
  } catch {
    return null;
  }
  if (claims.type !== "password-reset" || typeof claims.userId !== "string") return null;
  const user = await storage.getUser(claims.userId);
  if (!user) return null;
  if (claims.pv !== passwordVersion(user.password)) return null;
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

/**
 * Optional auth for guest checkout (ADR-017). No Authorization header means a guest
 * (`req.user` unset). A header that does not resolve to a session is refused instead
 * of degrading to a guest, so a stale login never silently buys as someone else.
 */
export const authenticateTokenOrGuest = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const authHeader = req.headers["authorization"];
  if (authHeader === undefined) {
    next();
    return;
  }
  const token = authHeader.split(" ")[1];

  try {
    const user = token ? await sessionUserFromToken(token) : null;
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

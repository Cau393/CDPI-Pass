/** Columns that must never leave the server, not even to the account's owner. */
const SECRET_USER_KEYS = ["password", "emailVerificationCode", "emailVerificationCodeExpiresAt"] as const;

type SecretUserKey = (typeof SECRET_USER_KEYS)[number];

/**
 * The user row as the client may see it: no password hash and no pending
 * e-mail verification code. Use it for every response that returns a user.
 */
export function toPublicUser<T extends object>(user: T): Omit<T, SecretUserKey> {
  const copy = { ...user } as Record<string, unknown>;
  for (const key of SECRET_USER_KEYS) delete copy[key];
  return copy as Omit<T, SecretUserKey>;
}

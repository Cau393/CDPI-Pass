import { z } from "zod";

/**
 * Fields a user may change on their own profile via PUT /api/profile.
 *
 * SECURITY: this is an allowlist, and it must stay one.
 *
 * The route previously spread `req.body` into the update and then deleted a
 * few known-bad keys (password, cpf, emailVerified, id, createdAt, updatedAt).
 * `isAdmin` was not in that list, so any authenticated user could send
 * `{"isAdmin": true}` and promote themselves to administrator. It did not even
 * require the current password, because `isAdmin` is not one of the
 * "sensitive fields" that trigger the password check. That single request
 * granted access to every /api/admin route: participant PII export, marking
 * orders paid (minting free tickets), mass email, and deleting events.
 *
 * A blacklist fails open: every new column added to `users` is writable by
 * default until someone remembers to deny it. An allowlist fails closed.
 *
 * `.strip()` (Zod's default) drops unknown keys instead of rejecting them.
 * That is deliberate: the profile form is seeded from the current user and
 * submits the whole object back, including `isAdmin` and `cpf`. Rejecting
 * unknown keys would break ordinary saves; stripping them means an admin
 * saving their profile keeps their privileges, while an attacker's injected
 * `isAdmin` is silently discarded.
 */
export const profileUpdateSchema = z
  .object({
    name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres"),
    email: z.string().email("Email inválido"),
    phone: z.string().min(1),
    address: z.string().min(10, "Endereço deve ter pelo menos 10 caracteres"),
    birthDate: z.union([z.string(), z.date()]),
    partnerCompany: z.string().nullable(),
  })
  .partial()
  .strip();

export type ProfileUpdate = z.infer<typeof profileUpdateSchema>;

/** Fields that require re-entering the current password before they change. */
export const PROFILE_SENSITIVE_FIELDS = ["name", "email", "phone"] as const;

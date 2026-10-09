import { z } from "zod";
import { accountEmailSchema } from "@shared/schema";

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
 * submits the whole object back, including `isAdmin`, `cpf`, `isForeigner`,
 * and `foreignDocument`. Rejecting
 * unknown keys would break ordinary saves; stripping them means an admin
 * saving their profile keeps their privileges, while an attacker's injected
 * `isAdmin` is silently discarded.
 */
export const profileUpdateSchema = z
  .object({
    name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres"),
    email: accountEmailSchema,
    phone: z.string().min(1),
    address: z.string().min(10, "Endereço deve ter pelo menos 10 caracteres"),
    birthDate: z.union([z.string(), z.date()]),
    partnerCompany: z.string().trim().min(2, "Empresa que trabalha é obrigatória").max(255),
    occupation: z.string().trim().min(2, "Cargo que ocupa é obrigatório").max(255),
    areaOfActivity: z.string().trim().min(2, "Área de Atuação é obrigatória").max(255),
  })
  .partial()
  .strip();

export type ProfileUpdate = z.infer<typeof profileUpdateSchema>;

/** Fields that require re-entering the current password before they change. */
export const PROFILE_SENSITIVE_FIELDS = ["name", "email", "phone"] as const;

/**
 * PUT /api/profile/identity (ADR-016): the document asked at the first
 * in-person or paid inscription, and the address for in-person events.
 * Same allowlist rule as above: every other key is stripped.
 */
export const profileIdentitySchema = z.object({
  isForeigner: z.boolean().optional(),
  cpf: z.string().optional(),
  foreignDocument: z.string().optional(),
  address: z
    .string()
    .trim()
    .min(10, "Endereço deve ter pelo menos 10 caracteres")
    .max(500, "Endereço deve ter no máximo 500 caracteres")
    .optional(),
}).superRefine((data, ctx) => {
  if (data.isForeigner === true && data.cpf?.trim()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["cpf"], message: "Estrangeiro não informa CPF" });
  }
  if (data.isForeigner !== true && data.foreignDocument?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["foreignDocument"],
      message: "Documento estrangeiro só vale para estrangeiros",
    });
  }
});

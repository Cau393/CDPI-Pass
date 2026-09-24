import * as z from "zod";
import { format, isValid, parse } from "date-fns";
import { hasMeaningfulEventDescription } from "@/lib/eventDescriptionHtml";

const npsTypeSchema = z.enum(["cdpi_event", "cdpi_apoiando"]);
const modalitySchema = z.enum(["presencial", "online"]);

function refineOnlineMeetingUrl(
  data: { modality: "presencial" | "online"; meetingUrl?: string },
  ctx: z.RefinementCtx,
) {
  if (data.modality !== "online") return;
  const url = (data.meetingUrl ?? "").trim();
  if (!url) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["meetingUrl"],
      message: "Link da reunião é obrigatório para eventos online",
    });
    return;
  }
  const parsed = z
    .string()
    .url()
    .refine((s) => /^https?:\/\//i.test(s))
    .safeParse(url);
  if (!parsed.success) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["meetingUrl"],
      message: "Informe um URL válido (ex.: https://zoom.us/...)",
    });
  }
}

function refineOptionalWhatsappUrl(
  data: { modality: "presencial" | "online"; whatsappGroupUrl?: string },
  ctx: z.RefinementCtx,
) {
  if (data.modality !== "online") return;
  const url = (data.whatsappGroupUrl ?? "").trim();
  if (!url) return;
  const parsed = z
    .string()
    .url()
    .refine((s) => /^https?:\/\//i.test(s))
    .safeParse(url);
  if (!parsed.success) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["whatsappGroupUrl"],
      message: "Informe um URL válido (ex.: https://chat.whatsapp.com/...)",
    });
  }
}

/** Stored in the form and sent to the API: local `yyyy-MM-dd'T'HH:mm` (no timezone suffix). */
export const API_LOCAL_DATETIME_FMT = "yyyy-MM-dd'T'HH:mm" as const;

export const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => i);
export const MINUTE_OPTIONS = Array.from({ length: 60 }, (_, i) => i);

export function parseApiLocalDateTime(s: string): Date | undefined {
  const trimmed = s.trim();
  if (!trimmed) return undefined;
  const d = parse(trimmed, API_LOCAL_DATETIME_FMT, new Date());
  return isValid(d) ? d : undefined;
}

export function dateToApiLocalString(d: Date): string {
  return format(d, API_LOCAL_DATETIME_FMT);
}

export function brazilianPriceToApiString(display: string): string {
  const t = display.trim();
  if (!t) return "";
  const noThousands = t.replaceAll(".", "");
  return noThousands.replace(",", ".");
}

export function parseBrazilianMoney(display: string): number {
  return Number(brazilianPriceToApiString(display));
}

export function apiPriceToBrazilianDisplay(price: unknown): string {
  const raw = typeof price === "string" ? price.replace(",", ".") : String(price ?? "");
  const n = Number(raw);
  if (!Number.isFinite(n)) return "";
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

export function eventDateToFormString(date: unknown): string {
  const d = date instanceof Date ? date : new Date(date as string);
  if (Number.isNaN(d.getTime())) return "";
  return dateToApiLocalString(d);
}

const coverFileListSchema = z
  .custom<FileList | undefined>((v) => v === undefined || v instanceof FileList)
  .refine(
    (v) => v === undefined || !(v instanceof FileList) || v.length === 0 || v.length === 1,
    "Envie apenas uma imagem.",
  )
  .refine(
    (v) =>
      v === undefined ||
      !(v instanceof FileList) ||
      v.length === 0 ||
      ["image/jpeg", "image/jpg", "image/png", "image/webp"].includes(v[0]?.type ?? ""),
    "Only JPEG, PNG, and WebP images are allowed.",
  )
  .refine(
    (v) =>
      v === undefined ||
      !(v instanceof FileList) ||
      v.length === 0 ||
      ((v[0]?.size ?? 0) > 0 && (v[0]?.size ?? 0) <= 5 * 1024 * 1024),
    "Image must be smaller than 5MB.",
  );

const courtesyLimitField = z
  .string()
  .optional()
  .default("")
  .refine(
    (value) => value.trim() === "" || /^[1-9]\d*$/.test(value.trim()),
    "O limite deve ser um número inteiro maior ou igual a 1.",
  );

export const createEventSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z
    .string()
    .refine(hasMeaningfulEventDescription, "Description is required"),
  date: z
    .string()
    .min(1, "Data é obrigatória")
    .refine((s) => parseApiLocalDateTime(s) !== undefined, "Selecione data e hora válidas"),
  location: z.string().min(1, "Location is required"),
  price: z
    .string()
    .min(1, "Preço é obrigatório")
    .refine((s) => {
      const n = parseBrazilianMoney(s);
      return Number.isFinite(n) && n >= 0;
    }, "Digite um valor válido (ex.: 0,00 ou 1234,56)"),
  npsType: npsTypeSchema.default("cdpi_event"),
  isFree: z.boolean().default(false),
  modality: modalitySchema.default("presencial"),
  meetingUrl: z.string().optional().default(""),
  whatsappGroupUrl: z.string().optional().default(""),
  confirmationEmailHtml: z.string().optional().default(""),
  courtesyLimit: courtesyLimitField,
  coverImage: z
    .custom<FileList | undefined>((v) => v === undefined || v instanceof FileList)
    .refine(
      (v) => v instanceof FileList && v.length === 1,
      "Cover image is required.",
    )
    .refine(
      (v) =>
        v instanceof FileList &&
        ["image/jpeg", "image/jpg", "image/png", "image/webp"].includes(v[0]?.type ?? ""),
      "Only JPEG, PNG, and WebP images are allowed.",
    )
    .refine(
      (v) =>
        v instanceof FileList &&
        (v[0]?.size ?? 0) > 0 &&
        (v[0]?.size ?? 0) <= 5 * 1024 * 1024,
      "Image must be smaller than 5MB.",
    ),
}).superRefine(refineOnlineMeetingUrl).superRefine(refineOptionalWhatsappUrl);

export const editEventSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z
    .string()
    .refine(hasMeaningfulEventDescription, "Description is required"),
  date: z
    .string()
    .min(1, "Data é obrigatória")
    .refine((s) => parseApiLocalDateTime(s) !== undefined, "Selecione data e hora válidas"),
  location: z.string().min(1, "Location is required"),
  price: z
    .string()
    .min(1, "Preço é obrigatório")
    .refine((s) => {
      const n = parseBrazilianMoney(s);
      return Number.isFinite(n) && n >= 0;
    }, "Digite um valor válido (ex.: 0,00 ou 1.234,56)"),
  npsType: npsTypeSchema,
  isFree: z.boolean().default(false),
  modality: modalitySchema.default("presencial"),
  meetingUrl: z.string().optional().default(""),
  whatsappGroupUrl: z.string().optional().default(""),
  confirmationEmailHtml: z.string().optional().default(""),
  courtesyLimit: courtesyLimitField,
  coverImage: coverFileListSchema,
}).superRefine(refineOnlineMeetingUrl).superRefine(refineOptionalWhatsappUrl);

export type CreateEventFormValues = z.infer<typeof createEventSchema>;
export type EditEventFormValues = z.infer<typeof editEventSchema>;

export function parseApiErrorMessage(err: unknown): string {
  if (!(err instanceof Error)) return "Something went wrong.";
  const m = /^(\d+):\s*([\s\S]*)$/.exec(err.message);
  if (!m) return err.message;
  try {
    const body = JSON.parse(m[2]) as { error?: string; message?: string; detail?: string };
    const main = body.error ?? body.message ?? err.message;
    if (body.detail) return `${main} (${body.detail})`;
    return main;
  } catch {
    return err.message;
  }
}

import { z } from "zod";
import {
  EVENT_MODALITIES,
  type EventModality,
} from "@shared/eventModality";

export { isOnlineEvent } from "@shared/eventModality";
export type { EventModality };

const modalitySchema = z.enum(EVENT_MODALITIES);

const httpUrlSchema = z
  .string()
  .trim()
  .url()
  .refine((s) => /^https?:\/\//i.test(s), "must be an http(s) URL");

export function parseOptionalHttpUrl(
  raw: unknown,
  fieldName = "url",
):
  | { ok: true; url: string | null }
  | { ok: false; error: string } {
  if (raw === undefined || raw === null) {
    return { ok: true, url: null };
  }
  if (typeof raw !== "string") {
    return { ok: false, error: `${fieldName} must be a valid URL` };
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: true, url: null };
  }
  const parsed = httpUrlSchema.safeParse(trimmed);
  if (!parsed.success) {
    return { ok: false, error: `${fieldName} must be a valid URL` };
  }
  return { ok: true, url: parsed.data };
}

export function resolveCreateWhatsappGroupUrl(opts: {
  modality: EventModality;
  raw: unknown;
}):
  | { ok: true; whatsappGroupUrl: string | null }
  | { ok: false; error: string } {
  if (opts.modality !== "online") {
    return { ok: true, whatsappGroupUrl: null };
  }
  const parsed = parseOptionalHttpUrl(opts.raw, "whatsapp_group_url");
  if (!parsed.ok) return parsed;
  return { ok: true, whatsappGroupUrl: parsed.url };
}

export function parseModalityField(raw: unknown): EventModality | null {
  const parsed = modalitySchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export function resolveCreateModality(body: Record<string, unknown>):
  | { ok: true; modality: EventModality; meetingUrl: string | null }
  | { ok: false; error: string } {
  const modalityRaw = body.modality;
  let modality: EventModality = "presencial";
  if (
    modalityRaw !== undefined &&
    modalityRaw !== null &&
    String(modalityRaw).trim() !== ""
  ) {
    const parsed = parseModalityField(modalityRaw);
    if (!parsed) {
      return { ok: false, error: "modality must be presencial or online" };
    }
    modality = parsed;
  }

  if (modality === "online") {
    const meetingRaw = body.meeting_url;
    if (typeof meetingRaw !== "string" || !meetingRaw.trim()) {
      return { ok: false, error: "meeting_url is required for online events" };
    }
    const parsed = httpUrlSchema.safeParse(meetingRaw.trim());
    if (!parsed.success) {
      return { ok: false, error: "meeting_url must be a valid URL" };
    }
    return { ok: true, modality, meetingUrl: parsed.data };
  }

  return { ok: true, modality, meetingUrl: null };
}

export function resolvePatchModality(opts: {
  body: Record<string, unknown>;
  existing: { modality?: string | null; meetingUrl?: string | null };
}):
  | { ok: true; updates: { modality?: EventModality; meetingUrl?: string | null } }
  | { ok: false; error: string } {
  const { body, existing } = opts;
  const hasModality = Object.prototype.hasOwnProperty.call(body, "modality");
  const hasUrl = Object.prototype.hasOwnProperty.call(body, "meeting_url");
  if (!hasModality && !hasUrl) {
    return { ok: true, updates: {} };
  }

  const updates: { modality?: EventModality; meetingUrl?: string | null } = {};
  const existingModality: EventModality =
    parseModalityField(existing.modality) ?? "presencial";

  if (hasModality) {
    const parsed = parseModalityField(body.modality);
    if (!parsed) {
      return { ok: false, error: "modality must be presencial or online" };
    }
    if (parsed !== existingModality) {
      updates.modality = parsed;
    }
  }

  const effective: EventModality = updates.modality ?? existingModality;

  if (effective === "presencial") {
    if (hasUrl || existing.meetingUrl) {
      if (existing.meetingUrl !== null) {
        updates.meetingUrl = null;
      }
    }
    return { ok: true, updates };
  }

  let nextUrl = existing.meetingUrl ?? null;
  if (hasUrl) {
    const raw = body.meeting_url;
    if (typeof raw !== "string" || !raw.trim()) {
      return { ok: false, error: "meeting_url is required for online events" };
    }
    const parsed = httpUrlSchema.safeParse(raw.trim());
    if (!parsed.success) {
      return { ok: false, error: "meeting_url must be a valid URL" };
    }
    nextUrl = parsed.data;
    if (parsed.data !== existing.meetingUrl) {
      updates.meetingUrl = parsed.data;
    }
  }

  if (!nextUrl || !nextUrl.trim()) {
    return { ok: false, error: "meeting_url is required for online events" };
  }

  return { ok: true, updates };
}

/** Strip secret access and email fields before returning an event on public APIs. */
export function toPublicEvent<
  T extends {
    meetingUrl?: string | null;
    whatsappGroupUrl?: string | null;
    confirmationEmailHtml?: string | null;
  },
>(
  event: T,
): Omit<T, "meetingUrl" | "whatsappGroupUrl" | "confirmationEmailHtml"> {
  const {
    meetingUrl: _meetingUrl,
    whatsappGroupUrl: _whatsappGroupUrl,
    confirmationEmailHtml: _confirmationEmailHtml,
    ...rest
  } = event;
  return rest;
}

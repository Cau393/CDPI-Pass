import { randomUUID } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
// @ts-ignore pg ships no types (@types/pg is not a dependency); only Pool/Client are used here
import pg from "pg";
import { loadConfig } from "../harness/config";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const prodEvents = JSON.parse(readFileSync(path.join(HERE, "../fixtures/prod-events.json"), "utf8")) as {
  events: { id: string; courtesyLimit: number | null; key: string; title: string; description: string; daysFromNow: number; location: string; price: string; isFree: boolean; modality: string; meetingUrl: string | null; meetingPassword: string | null; maxAttendees: number | null; salesClosed: boolean; registrationForm: RegistrationField[] }[];
};

export const cfg = loadConfig();
export const PASSWORD = "Senha@E2E2026";

const pool = new pg.Pool({ connectionString: cfg.databaseUrl, max: 4 });

export async function sql<T extends Record<string, any> = Record<string, any>>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const res = await pool.query(text, params);
  return res.rows as T[];
}
export async function scalar<T = string>(text: string, params: unknown[] = []): Promise<T | null> {
  const rows = await sql(text, params);
  if (rows.length === 0) return null;
  return Object.values(rows[0])[0] as T;
}
export async function closePool() {
  await pool.end();
}

// Everything the suite creates is recorded so staging cleanup deletes exactly that.
const STATE_DIR = path.resolve(HERE, "../.state");
export const trackFile = () => path.join(STATE_DIR, `created-${cfg.run}.ndjson`);
function track(kind: "event" | "userEmail", value: string) {
  mkdirSync(STATE_DIR, { recursive: true });
  appendFileSync(trackFile(), JSON.stringify({ kind, value }) + "\n");
}
export function readTracked(): { events: string[]; emails: string[] } {
  const file = trackFile();
  const out = { events: [] as string[], emails: [] as string[] };
  if (!existsSync(file)) return out;
  for (const line of readFileSync(file, "utf8").split("\n").filter(Boolean)) {
    const { kind, value } = JSON.parse(line);
    (kind === "event" ? out.events : out.emails).push(value);
  }
  return out;
}

export interface RegistrationField {
  id: string;
  type: "text" | "radio" | "select" | "checkbox" | string;
  label: string;
  options: string[];
  required: boolean;
  archived: boolean;
}
export const question = (id: string, label: string, over: Partial<RegistrationField> = {}): RegistrationField => ({
  id,
  type: "text",
  label,
  options: [],
  required: true,
  archived: false,
  ...over,
});

export type ProdEventKey = "onlineFree" | "presencialFree" | "presencialPaid";
export interface SeededEvent {
  id: string;
  title: string;
  isFree: boolean;
  modality: "online" | "presencial";
}

type FixtureEvent = (typeof prodEvents.events)[number];
export const fixtureEvent = (key: ProdEventKey): FixtureEvent => {
  const base = prodEvents.events.find((e) => e.key === key);
  if (!base) throw new Error(`no fixture event ${key}`);
  return base;
};

async function insertEvent(
  base: FixtureEvent,
  opts: { id: string; title: string; isFree?: boolean; price?: string; salesClosed: boolean; registrationForm: RegistrationField[]; onConflictDoNothing?: boolean },
): Promise<boolean> {
  const date = new Date(Date.now() + base.daysFromNow * 86400_000);
  const rows = await sql(
    `INSERT INTO events (id,title,description,date,location,price,is_free,modality,meeting_url,meeting_password,max_attendees,sales_closed,courtesy_limit,registration_form)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     ${opts.onConflictDoNothing ? "ON CONFLICT (id) DO NOTHING" : ""} RETURNING id`,
    [
      opts.id, opts.title, base.description, date, base.location,
      opts.price ?? (opts.isFree === false && base.isFree ? "100.00" : base.price),
      opts.isFree ?? base.isFree, base.modality, base.meetingUrl, base.meetingPassword, base.maxAttendees,
      opts.salesClosed, base.courtesyLimit, JSON.stringify(opts.registrationForm),
    ],
  );
  return rows.length > 0;
}

/**
 * Inserts a copy of one of the live prod events (fixtures/prod-events.json) with a fresh id, the
 * run's title prefix and OPEN sales. `over.registrationForm` extends the form.
 */
export async function createEvent(
  key: ProdEventKey,
  over: { registrationForm?: RegistrationField[]; titleSuffix?: string; salesClosed?: boolean; isFree?: boolean; price?: string } = {},
): Promise<SeededEvent> {
  const base = fixtureEvent(key);
  const id = randomUUID();
  const title = `${cfg.namePrefix}${base.title}${over.titleSuffix ? ` ${over.titleSuffix}` : ""} ${cfg.run}-${id.slice(0, 5)}`;
  track("event", id);
  await insertEvent(base, {
    id, title, isFree: over.isFree, price: over.price,
    salesClosed: over.salesClosed ?? false,
    registrationForm: over.registrationForm ?? base.registrationForm,
  });
  return { id, title, isFree: over.isFree ?? base.isFree, modality: base.modality as "online" | "presencial" };
}

/**
 * Global setup: the three events with their REAL prod ids (the legacy-questions SQL targets them).
 * Existing rows are never touched; only the ones inserted here are tracked for cleanup.
 * Returns the keys this run inserted.
 */
export async function seedProdIdEvents(): Promise<ProdEventKey[]> {
  const inserted: ProdEventKey[] = [];
  for (const base of prodEvents.events) {
    const ok = await insertEvent(base, {
      id: base.id,
      title: `${cfg.namePrefix}${base.title}`,
      salesClosed: base.salesClosed,
      registrationForm: base.registrationForm,
      onConflictDoNothing: true,
    });
    if (ok) {
      track("event", base.id);
      inserted.push(base.key as ProdEventKey);
    }
  }
  return inserted;
}

export const prodId = (key: ProdEventKey) => fixtureEvent(key).id;

/** True when the three prod-id events carry the three legacy questions (C1). */
export async function legacyQuestionsAttached(): Promise<boolean> {
  const rows = await sql<{ n: string }>(
    `SELECT count(*) AS n FROM events e WHERE e.id = ANY($1) AND (
       SELECT count(*) FROM jsonb_array_elements(e.registration_form) f
        WHERE f->>'id' IN ('legacy-occupation','legacy-partner-company','legacy-area-of-activity')) = 3`,
    [prodEvents.events.map((e) => e.id)],
  );
  return Number(rows[0].n) === 3;
}

/** A unique e-mail for this run; recorded for staging cleanup. */
export function newEmail(tag: string): string {
  const email = `${tag}.${cfg.run}.${randomUUID().slice(0, 6)}@e2e.test`;
  track("userEmail", email.toLowerCase());
  return email;
}

export const personName = (name: string) => `${cfg.namePrefix}${name}`;

/** Staging cleanup: deletes only rows this run created. Safe to call in local mode too. */
export async function cleanupTracked() {
  const { events, emails } = readTracked();
  const users = emails.length ? await sql(`SELECT id FROM users WHERE lower(email) = ANY($1)`, [emails]) : [];
  const userIds = users.map((u) => u.id as string);
  const orders = await sql(
    `SELECT id, courtesy_attendee_id FROM orders WHERE event_id = ANY($1) OR user_id = ANY($2)`,
    [events, userIds],
  );
  const attendeeIds = orders.map((o) => o.courtesy_attendee_id).filter(Boolean);
  await sql(`DELETE FROM orders WHERE id = ANY($1)`, [orders.map((o) => o.id)]);
  if (attendeeIds.length) await sql(`DELETE FROM courtesy_attendees WHERE id = ANY($1)`, [attendeeIds]);
  await sql(`DELETE FROM courtesy_links WHERE event_id = ANY($1)`, [events]);
  if (emails.length) await sql(`DELETE FROM email_queue WHERE lower("to") = ANY($1)`, [emails]);
  await sql(`DELETE FROM events WHERE id = ANY($1)`, [events]);
  if (userIds.length) await sql(`DELETE FROM users WHERE id = ANY($1)`, [userIds]);
}

/** Valid CPF digits from a numeric seed. */
export function cpfDigits(seed: number | string): string {
  const n = String(seed).padStart(9, "0").slice(-9).split("").map(Number);
  const d = (len: number) => {
    const s = n.slice(0, len).reduce((a, v, i) => a + v * (len + 1 - i), 0);
    const r = (s * 10) % 11;
    return r === 10 ? 0 : r;
  };
  n.push(d(9));
  n.push(d(10));
  return n.join("");
}
export const fmtCpf = (d: string) => `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
let cpfCounter = 0;
/** A CPF unlikely to collide across parallel workers and runs. */
export const uniqueCpf = () =>
  cpfDigits((Date.now() * 7 + process.pid * 131 + ++cpfCounter * 7919) % 1_000_000_000);

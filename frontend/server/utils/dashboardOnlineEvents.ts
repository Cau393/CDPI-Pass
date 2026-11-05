import { and, desc, eq, sql } from "drizzle-orm";
import { events, orders } from "@shared/schema";
import { LEAD_TAGS, type LeadTag } from "@shared/leadTag";
import { db } from "../db";

export type OnlineEventLeadCounts = Record<LeadTag | "none", number>;

export type OnlineEventLeadRow = {
  id: string;
  title: string;
  /** ISO 8601 (UTC) of `events.date`. */
  date: string;
  counts: OnlineEventLeadCounts;
  total: number;
};

/**
 * ONE grouped query: every active online event with its PAID orders split by lead tag. Same unit as
 * the admin participants page (one row = one paid order, `orders.status = 'paid'`, courtesy and free
 * included, no quantity column), so `total` equals that page's paid rows. The status test sits in the
 * JOIN condition, not the WHERE, so an event with no paid order still shows up with zeros.
 * `count()` comes back as bigint (a string in node-postgres): the `::int` cast makes it a number.
 * No personal data is selected.
 */
export function onlineEventsLeadQuery() {
  const tagCounts = Object.fromEntries(
    LEAD_TAGS.map((tag) => [
      tag,
      sql<number>`(count(${orders.id}) filter (where ${orders.leadTag} = ${tag}))::int`,
    ]),
  ) as Record<LeadTag, ReturnType<typeof sql<number>>>;

  return db
    .select({
      id: events.id,
      title: events.title,
      date: events.date,
      ...tagCounts,
      none: sql<number>`(count(${orders.id}) filter (where ${orders.leadTag} is null))::int`,
      total: sql<number>`count(${orders.id})::int`,
    })
    .from(events)
    .leftJoin(orders, and(eq(orders.eventId, events.id), eq(orders.status, "paid")))
    .where(and(eq(events.modality, "online"), eq(events.isActive, true)))
    .groupBy(events.id)
    .orderBy(desc(events.date), desc(events.id));
}

export async function loadOnlineEventLeadCounts(): Promise<OnlineEventLeadRow[]> {
  const rows = await onlineEventsLeadQuery();
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    date: r.date.toISOString(),
    counts: {
      email: r.email,
      parceiros: r.parceiros,
      patrocinado: r.patrocinado,
      consultores: r.consultores,
      none: r.none,
    },
    total: r.total,
  }));
}

import { parseLeadTag, type LeadTag } from "@shared/leadTag";

/**
 * ADR-018 lead tags, client side. A valid `?tag=` on an event link is remembered per event
 * through four layers (cookie, localStorage, sessionStorage, memory) so it survives a
 * blocked or cleared store until the buyer submits. Every read goes through `parseLeadTag`.
 */
const COOKIE_MAX_AGE_SECONDS = 2592000; // 30 days

const memory = new Map<string, LeadTag>();

const cookieName = (eventId: string) => `cdpi_lt_${eventId}`;
const storageKey = (eventId: string) => `cdpi:lt:${eventId}`;

/** Test-only: drops the in-memory layer. */
export function resetLeadTagMemoryForTests(): void {
  memory.clear();
}

export function captureLeadTagFromUrl(eventId: string, search: string): void {
  const tag = parseLeadTag(new URLSearchParams(search).get("tag"));
  if (!tag) return; // an untagged or invalid visit never erases a stored tag

  try {
    const secure = location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${cookieName(eventId)}=${tag}; Path=/; Max-Age=${COOKIE_MAX_AGE_SECONDS}; SameSite=Lax${secure}`;
  } catch {
    /* cookies blocked */
  }
  try {
    localStorage.setItem(storageKey(eventId), tag);
  } catch {
    /* localStorage blocked */
  }
  try {
    sessionStorage.setItem(storageKey(eventId), tag);
  } catch {
    /* sessionStorage blocked */
  }
  memory.set(eventId, tag);
}

function readCookie(eventId: string): unknown {
  const prefix = `${cookieName(eventId)}=`;
  for (const part of document.cookie.split(";")) {
    const entry = part.trim();
    if (entry.startsWith(prefix)) return entry.slice(prefix.length);
  }
  return null;
}

/** First valid tag of: URL (this event's page only), cookie, localStorage, sessionStorage, memory. */
export function getLeadTag(eventId: string): LeadTag | null {
  const readers: Array<() => unknown> = [
    () =>
      location.pathname === `/event/${eventId}`
        ? new URLSearchParams(location.search).get("tag")
        : null,
    () => readCookie(eventId),
    () => localStorage.getItem(storageKey(eventId)),
    () => sessionStorage.getItem(storageKey(eventId)),
    () => memory.get(eventId),
  ];
  for (const read of readers) {
    try {
      const tag = parseLeadTag(read());
      if (tag) return tag;
    } catch {
      /* layer unavailable: try the next one */
    }
  }
  return null;
}

export function buildTaggedEventUrl(origin: string, eventId: string, tag: LeadTag): string {
  return `${origin}/event/${encodeURIComponent(eventId)}?tag=${tag}`;
}

/** Body fragment for the order senders: the key is absent when there is no tag. */
export function leadTagBody(eventId: string): { leadTag?: LeadTag } {
  const leadTag = getLeadTag(eventId);
  return leadTag ? { leadTag } : {};
}

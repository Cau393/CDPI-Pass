import type { CourtesyLinkMassSendLike } from "./massSendCourtesyQueries";

export function filterEligibleReminderLinks(
  links: CourtesyLinkMassSendLike[],
): CourtesyLinkMassSendLike[] {
  return links.filter((l) => {
    const remaining = l.ticketCount - (l.usedCount ?? 0);
    return remaining > 0 && l.isActive === true;
  });
}

export function deduplicateReminderLinksByEmail(
  links: CourtesyLinkMassSendLike[],
): CourtesyLinkMassSendLike[] {
  const seen = new Set<string>();
  return links.filter((l) => {
    const email = (l.recipientEmail ?? "").toLowerCase();
    if (seen.has(email)) return false;
    seen.add(email);
    return true;
  });
}

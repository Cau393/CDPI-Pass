import type { CourtesyAttendee, User } from "@shared/schema";

/**
 * BR-01: name for badge — courtesy attendee over buyer account.
 */
export function resolveDisplayNameForPrint(
  buyer: User | undefined,
  courtesy: CourtesyAttendee | null | undefined,
): string {
  const fromCourtesy = courtesy?.name?.trim();
  if (fromCourtesy) {
    return fromCourtesy.slice(0, 255);
  }
  return (buyer?.name?.trim() || "Participante").slice(0, 255);
}

/** Second badge line for courtesy attendees (company); omit for paid-only flow. */
export function resolveCompanyLineForPrint(
  courtesy: CourtesyAttendee | null | undefined,
): string | null {
  const c = courtesy?.partnerCompany?.trim();
  return c ? c.slice(0, 255) : null;
}

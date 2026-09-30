export const EVENT_MODALITIES = ["presencial", "online"] as const;
export type EventModality = (typeof EVENT_MODALITIES)[number];

export function isOnlineEvent(event: {
  modality?: string | null;
}): boolean {
  return event.modality === "online";
}

/** Public-facing location line. Never exposes the meeting URL. */
export function publicEventLocationLabel(event: {
  modality?: string | null;
  location?: string | null;
}): string {
  if (isOnlineEvent(event)) return "Online";
  const location = event.location?.trim();
  return location && location.length > 0 ? location : "Local não disponível";
}

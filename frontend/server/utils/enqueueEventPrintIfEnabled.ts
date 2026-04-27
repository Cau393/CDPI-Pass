import type { Order } from "@shared/schema";
import { storage } from "../storage";
import { resolveDisplayNameForPrint } from "./printDisplayName";

/**
 * Resolves the badge/label name, and when the event has printing enabled, creates a
 * print job and wakes the print coordinator. Print enqueue errors are logged only.
 * @returns display name (courtesy attendee over buyer)
 */
export async function enqueueEventPrintIfEnabled(order: Order): Promise<string> {
  const buyer = await storage.getUser(order.userId);
  const courtesy = order.courtesyAttendeeId
    ? await storage.getCourtesyAttendeeById(order.courtesyAttendeeId)
    : undefined;
  const displayName = resolveDisplayNameForPrint(buyer, courtesy);

  const { isEnabled } = await storage.getEventPrintSetting(order.eventId);
  if (!isEnabled) {
    return displayName;
  }
  try {
    await storage.createPrintJob({
      eventId: order.eventId,
      orderId: order.id,
      displayName,
    });
    const { notifyNewPrintJob } = await import("../print/printCoordinator");
    void notifyNewPrintJob(order.eventId).catch((e) =>
      console.error("notifyNewPrintJob:", e),
    );
  } catch (e) {
    console.error("enqueue print job:", e);
  }
  return displayName;
}

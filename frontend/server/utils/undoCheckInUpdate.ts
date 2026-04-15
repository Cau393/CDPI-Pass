import type { Order } from "@shared/schema";

/** Builds DB patch for reversing one check-in (decrement amntUsed, sync flags). */
export function buildUndoCheckInPatch(order: Order): {
  amntUsed: number;
  qrCodeUsed: boolean;
  qrCodeUsedAt: Date | null;
} {
  const used = order.amntUsed ?? 0;
  const newAmntUsed = used - 1;
  const isStillUsed = newAmntUsed > 0;
  return {
    amntUsed: newAmntUsed,
    qrCodeUsed: isStillUsed,
    qrCodeUsedAt: isStillUsed ? (order.qrCodeUsedAt ?? null) : null,
  };
}

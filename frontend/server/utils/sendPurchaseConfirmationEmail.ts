import type { Event } from "@shared/schema";
import { isOnlineEvent } from "@shared/eventModality";
import { emailService } from "../services/emailService";
import type { TicketConfirmationKind } from "./ticketEmailTemplate";

/**
 * After a purchase is confirmed (paid, free, or courtesy): send the QR ticket
 * e-mail for presencial events, or the meeting-link e-mail for online events.
 */
export async function sendPurchaseConfirmationEmail(opts: {
  to: string;
  userName: string;
  event: Event;
  orderId: string;
  qrCodeData?: string | null;
  qrCodeS3Url?: string | null;
  confirmationKind: TicketConfirmationKind;
}): Promise<boolean> {
  const { to, userName, event, orderId, confirmationKind } = opts;

  if (isOnlineEvent(event)) {
    if (!event.meetingUrl) {
      console.error(
        `sendPurchaseConfirmationEmail: online event ${event.id} has no meetingUrl; e-mail will have an empty link`,
      );
    }
    return emailService.sendOnlineEventEmail(to, {
      userName,
      eventTitle: event.title,
      eventDate: event.date,
      meetingUrl: event.meetingUrl || "",
      orderId,
      confirmationKind,
      customHtml: event.confirmationEmailHtml,
    });
  }

  return emailService.sendTicketEmail(to, {
    userName,
    eventTitle: event.title,
    eventDate: event.date,
    eventLocation: event.location,
    qrCodeData: opts.qrCodeData || "",
    orderId,
    qrCodeS3Url: opts.qrCodeS3Url || "",
    confirmationKind,
    customHtml: event.confirmationEmailHtml,
  });
}

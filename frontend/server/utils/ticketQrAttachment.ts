/**
 * The `content_id` the ticket email template references as
 * <img src="cid:qrcode">. Keep the two in sync or the image will not resolve.
 */
export const TICKET_QR_CID = "qrcode";

export interface TicketQrAttachment {
  filename: string;
  content: string;
  type: string;
  disposition: string;
  content_id: string;
}

/**
 * Build the inline QR attachment for a ticket email.
 *
 * The email used to hot-link the S3 object (`<img src="{qr_code_s3_url}">`),
 * which only worked while the whole `cdpi-pass-qr-codes` bucket was
 * world-readable. `qr-codes/` is now private, since those objects are the
 * ticket credentials presented at the door, so hot-linking would show a broken
 * image in every ticket email.
 *
 * Attaching inline is also more robust than a presigned URL: it cannot expire
 * before the attendee arrives, and it renders in clients that block remote
 * images by default (Outlook, Gmail's "ask before displaying").
 *
 * Accepts either a data URL ("data:image/png;base64,...") as stored in
 * `orders.qr_code_data`, or bare base64. Returns null when there is nothing to
 * attach, so callers can log instead of sending an empty, broken image.
 */
export function buildTicketQrAttachment(
  qrCodeData: string | null | undefined,
): TicketQrAttachment | null {
  const base64 = (qrCodeData ?? "").replace(/^data:image\/png;base64,/, "").trim();
  if (!base64) return null;

  return {
    filename: "ingresso-qrcode.png",
    content: base64,
    type: "image/png",
    disposition: "inline",
    content_id: TICKET_QR_CID,
  };
}

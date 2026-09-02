import { describe, it, expect } from "vitest";
import { buildTicketQrAttachment } from "../../utils/ticketQrAttachment";

/**
 * The ticket email used to embed the QR with <img src="{S3 url}">, which only
 * worked because the `qr-codes/` prefix was world-readable. That prefix now
 * holds 333 ticket credentials and is private, so a hot-linked image would
 * render as a broken icon in every ticket email.
 *
 * The QR is therefore attached inline (cid:qrcode) from the base64 already
 * stored on the order. These tests pin that behaviour, because a silently
 * QR-less ticket email means an attendee cannot get through the door.
 */
describe("buildTicketQrAttachment", () => {
  // 1x1 transparent PNG
  const PNG_B64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

  it("strips the data URL prefix and emits an inline attachment", () => {
    const att = buildTicketQrAttachment(`data:image/png;base64,${PNG_B64}`);
    expect(att).not.toBeNull();
    expect(att!.content).toBe(PNG_B64);
    expect(att!.disposition).toBe("inline");
    expect(att!.content_id).toBe("qrcode");
    expect(att!.type).toBe("image/png");
  });

  it("produces content that decodes to a real PNG", () => {
    const att = buildTicketQrAttachment(`data:image/png;base64,${PNG_B64}`)!;
    const buf = Buffer.from(att.content, "base64");
    // PNG magic number; if this breaks, mail clients show a broken image.
    expect(buf.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  });

  it("accepts bare base64 without the data URL prefix", () => {
    const att = buildTicketQrAttachment(PNG_B64);
    expect(att?.content).toBe(PNG_B64);
  });

  it("returns null for missing data rather than an empty attachment", () => {
    // 8 of 573 production orders have no qr_code_data. An empty attachment
    // would render as a broken image; null lets the caller log and send the
    // rest of the ticket details.
    expect(buildTicketQrAttachment("")).toBeNull();
    expect(buildTicketQrAttachment(null)).toBeNull();
    expect(buildTicketQrAttachment(undefined)).toBeNull();
  });

  it("uses a content_id that matches the cid: reference in the email HTML", () => {
    // The template hardcodes <img src="cid:qrcode">. If these drift apart the
    // image silently fails to resolve.
    expect(buildTicketQrAttachment(PNG_B64)!.content_id).toBe("qrcode");
  });
});

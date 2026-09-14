import { describe, it, expect } from "vitest";
import {
  resolveCreateModality,
  resolveCreateWhatsappGroupUrl,
  resolvePatchModality,
  toPublicEvent,
} from "../../utils/eventModality";
import { publicEventLocationLabel } from "@shared/eventModality";

describe("resolveCreateModality", () => {
  it("defaults to presencial with a null meeting URL", () => {
    expect(resolveCreateModality({})).toEqual({
      ok: true,
      modality: "presencial",
      meetingUrl: null,
      whatsappGroupUrl: null,
      confirmationEmailHtml: null,
    });
  });

  it("rejects an unknown modality", () => {
    expect(resolveCreateModality({ modality: "hybrid" })).toEqual({
      ok: false,
      error: "modality must be presencial or online",
    });
  });

  it("rejects online without a meeting URL", () => {
    expect(resolveCreateModality({ modality: "online" })).toEqual({
      ok: false,
      error: "meeting_url is required for online events",
    });
  });

  it("rejects online with an invalid URL", () => {
    expect(
      resolveCreateModality({
        modality: "online",
        meeting_url: "not-a-url",
      }),
    ).toEqual({
      ok: false,
      error: "meeting_url must be a valid URL",
    });
  });

  it("accepts online with an https URL", () => {
    expect(
      resolveCreateModality({
        modality: "online",
        meeting_url: "https://zoom.us/j/123",
      }),
    ).toEqual({
      ok: true,
      modality: "online",
      meetingUrl: "https://zoom.us/j/123",
      whatsappGroupUrl: null,
      confirmationEmailHtml: null,
    });
  });

  it("stores a null meeting URL for presencial even if one was sent", () => {
    expect(
      resolveCreateModality({
        modality: "presencial",
        meeting_url: "https://zoom.us/j/123",
      }),
    ).toEqual({
      ok: true,
      modality: "presencial",
      meetingUrl: null,
      whatsappGroupUrl: null,
      confirmationEmailHtml: null,
    });
  });

  it("accepts online with WhatsApp and confirmation HTML", () => {
    expect(
      resolveCreateModality({
        modality: "online",
        meeting_url: "https://zoom.us/j/123",
        whatsapp_group_url: "https://chat.whatsapp.com/AbC",
        confirmation_email_html: "<p>Traga o material</p>",
      }),
    ).toEqual({
      ok: true,
      modality: "online",
      meetingUrl: "https://zoom.us/j/123",
      whatsappGroupUrl: "https://chat.whatsapp.com/AbC",
      confirmationEmailHtml: "<p>Traga o material</p>",
    });
  });

  it("rejects online with an invalid WhatsApp URL", () => {
    expect(
      resolveCreateModality({
        modality: "online",
        meeting_url: "https://zoom.us/j/123",
        whatsapp_group_url: "not-a-url",
      }),
    ).toEqual({
      ok: false,
      error: "whatsapp_group_url must be a valid URL",
    });
  });
});

describe("resolvePatchModality", () => {
  it("returns empty updates when neither field is present", () => {
    expect(
      resolvePatchModality({
        body: {},
        existing: { modality: "presencial", meetingUrl: null },
      }),
    ).toEqual({ ok: true, updates: {} });
  });

  it("rejects switching presencial to online without a URL", () => {
    expect(
      resolvePatchModality({
        body: { modality: "online" },
        existing: { modality: "presencial", meetingUrl: null },
      }),
    ).toEqual({
      ok: false,
      error: "meeting_url is required for online events",
    });
  });

  it("accepts switching to online with a valid URL", () => {
    expect(
      resolvePatchModality({
        body: { modality: "online", meeting_url: "https://meet.google.com/abc" },
        existing: { modality: "presencial", meetingUrl: null },
      }),
    ).toEqual({
      ok: true,
      updates: {
        modality: "online",
        meetingUrl: "https://meet.google.com/abc",
      },
    });
  });

  it("clears the meeting URL when switching back to presencial", () => {
    expect(
      resolvePatchModality({
        body: { modality: "presencial" },
        existing: {
          modality: "online",
          meetingUrl: "https://zoom.us/j/123",
        },
      }),
    ).toEqual({
      ok: true,
      updates: { modality: "presencial", meetingUrl: null },
    });
  });

  it("adds a WhatsApp URL later on an online event", () => {
    expect(
      resolvePatchModality({
        body: { whatsapp_group_url: "https://chat.whatsapp.com/AbC" },
        existing: {
          modality: "online",
          meetingUrl: "https://zoom.us/j/123",
          whatsappGroupUrl: null,
        },
      }),
    ).toEqual({
      ok: true,
      updates: { whatsappGroupUrl: "https://chat.whatsapp.com/AbC" },
    });
  });

  it("clears WhatsApp when switching back to presencial", () => {
    expect(
      resolvePatchModality({
        body: { modality: "presencial" },
        existing: {
          modality: "online",
          meetingUrl: "https://zoom.us/j/123",
          whatsappGroupUrl: "https://chat.whatsapp.com/AbC",
        },
      }),
    ).toEqual({
      ok: true,
      updates: {
        modality: "presencial",
        meetingUrl: null,
        whatsappGroupUrl: null,
      },
    });
  });

  it("rejects an invalid WhatsApp URL on patch", () => {
    expect(
      resolvePatchModality({
        body: { whatsapp_group_url: "not-a-url" },
        existing: {
          modality: "online",
          meetingUrl: "https://zoom.us/j/123",
          whatsappGroupUrl: null,
        },
      }),
    ).toEqual({
      ok: false,
      error: "whatsapp_group_url must be a valid URL",
    });
  });

  it("stores confirmation HTML on patch", () => {
    expect(
      resolvePatchModality({
        body: { confirmation_email_html: "<p>Traga o material</p>" },
        existing: {
          modality: "presencial",
          meetingUrl: null,
        },
      }),
    ).toEqual({
      ok: true,
      updates: { confirmationEmailHtml: "<p>Traga o material</p>" },
    });
  });
});

describe("resolveCreateWhatsappGroupUrl", () => {
  it("returns null when the WhatsApp field is empty on an online event", () => {
    expect(
      resolveCreateWhatsappGroupUrl({ modality: "online", raw: "" }),
    ).toEqual({ ok: true, whatsappGroupUrl: null });
    expect(
      resolveCreateWhatsappGroupUrl({ modality: "online", raw: "   " }),
    ).toEqual({ ok: true, whatsappGroupUrl: null });
    expect(
      resolveCreateWhatsappGroupUrl({ modality: "online", raw: undefined }),
    ).toEqual({ ok: true, whatsappGroupUrl: null });
  });

  it("rejects an invalid WhatsApp URL", () => {
    expect(
      resolveCreateWhatsappGroupUrl({
        modality: "online",
        raw: "not-a-url",
      }),
    ).toEqual({
      ok: false,
      error: "whatsapp_group_url must be a valid URL",
    });
  });

  it("accepts a WhatsApp group invite URL", () => {
    expect(
      resolveCreateWhatsappGroupUrl({
        modality: "online",
        raw: "https://chat.whatsapp.com/AbC",
      }),
    ).toEqual({
      ok: true,
      whatsappGroupUrl: "https://chat.whatsapp.com/AbC",
    });
  });

  it("stores null for presencial even if a WhatsApp URL was sent", () => {
    expect(
      resolveCreateWhatsappGroupUrl({
        modality: "presencial",
        raw: "https://chat.whatsapp.com/AbC",
      }),
    ).toEqual({ ok: true, whatsappGroupUrl: null });
  });
});

describe("toPublicEvent", () => {
  it("omits meetingUrl from the public payload", () => {
    const publicEvent = toPublicEvent({
      id: "e1",
      title: "Online",
      modality: "online",
      meetingUrl: "https://secret.example/meet",
    });
    expect(publicEvent).toEqual({
      id: "e1",
      title: "Online",
      modality: "online",
    });
    expect("meetingUrl" in publicEvent).toBe(false);
  });

  it("omits meetingUrl, whatsappGroupUrl and confirmationEmailHtml", () => {
    const publicEvent = toPublicEvent({
      id: "e1",
      title: "Online",
      modality: "online",
      meetingUrl: "https://secret.example/meet",
      whatsappGroupUrl: "https://chat.whatsapp.com/AbC",
      confirmationEmailHtml: "<p>Traga o material</p>",
    });
    expect(publicEvent).toEqual({
      id: "e1",
      title: "Online",
      modality: "online",
    });
    expect("meetingUrl" in publicEvent).toBe(false);
    expect("whatsappGroupUrl" in publicEvent).toBe(false);
    expect("confirmationEmailHtml" in publicEvent).toBe(false);
  });
});

describe("publicEventLocationLabel", () => {
  it("returns Online for online events", () => {
    expect(
      publicEventLocationLabel({ modality: "online", location: "Zoom" }),
    ).toBe("Online");
  });

  it("returns the stored location for presencial events", () => {
    expect(
      publicEventLocationLabel({
        modality: "presencial",
        location: "São Paulo",
      }),
    ).toBe("São Paulo");
  });
});

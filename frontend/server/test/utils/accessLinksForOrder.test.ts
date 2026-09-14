import { describe, it, expect } from "vitest";
import { accessLinksForOrder } from "../../utils/accessLinksForOrder";

const onlineEvent = {
  modality: "online" as const,
  meetingUrl: "https://zoom.us/j/1",
  whatsappGroupUrl: "https://chat.whatsapp.com/AbC",
};

describe("accessLinksForOrder", () => {
  it("returns meeting and WhatsApp URLs for a paid online order", () => {
    expect(
      accessLinksForOrder({ orderStatus: "paid", event: onlineEvent }),
    ).toEqual({
      meetingUrl: "https://zoom.us/j/1",
      whatsappGroupUrl: "https://chat.whatsapp.com/AbC",
    });
  });

  it("returns meeting URL with null WhatsApp when the group is unset", () => {
    expect(
      accessLinksForOrder({
        orderStatus: "paid",
        event: { ...onlineEvent, whatsappGroupUrl: null },
      }),
    ).toEqual({
      meetingUrl: "https://zoom.us/j/1",
      whatsappGroupUrl: null,
    });
  });

  it("returns links for courtesy status", () => {
    expect(
      accessLinksForOrder({ orderStatus: "courtesy", event: onlineEvent }),
    ).toEqual({
      meetingUrl: "https://zoom.us/j/1",
      whatsappGroupUrl: "https://chat.whatsapp.com/AbC",
    });
  });

  it("hides links on a pending order", () => {
    expect(
      accessLinksForOrder({ orderStatus: "pending", event: onlineEvent }),
    ).toBeNull();
  });

  it("hides links for a presencial event", () => {
    expect(
      accessLinksForOrder({
        orderStatus: "paid",
        event: {
          modality: "presencial",
          meetingUrl: null,
          whatsappGroupUrl: "https://chat.whatsapp.com/AbC",
        },
      }),
    ).toBeNull();
  });
});

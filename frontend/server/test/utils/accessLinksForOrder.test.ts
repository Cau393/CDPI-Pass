import { describe, it, expect } from "vitest";
import {
  accessLinksForOrder,
  withOrderAccessLinks,
} from "../../utils/accessLinksForOrder";

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
      meetingPassword: null,
    });
  });

  it("includes the meeting password for a paid online order", () => {
    expect(
      accessLinksForOrder({
        orderStatus: "paid",
        event: { ...onlineEvent, meetingPassword: "segredo" },
      }),
    ).toEqual({
      meetingUrl: "https://zoom.us/j/1",
      whatsappGroupUrl: "https://chat.whatsapp.com/AbC",
      meetingPassword: "segredo",
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
      meetingPassword: null,
    });
  });

  it("returns a null password while still returning the meeting URL", () => {
    expect(
      accessLinksForOrder({
        orderStatus: "paid",
        event: { ...onlineEvent, meetingPassword: null },
      }),
    ).toEqual({
      meetingUrl: "https://zoom.us/j/1",
      whatsappGroupUrl: "https://chat.whatsapp.com/AbC",
      meetingPassword: null,
    });
  });

  it("returns links for courtesy status", () => {
    expect(
      accessLinksForOrder({ orderStatus: "courtesy", event: onlineEvent }),
    ).toEqual({
      meetingUrl: "https://zoom.us/j/1",
      whatsappGroupUrl: "https://chat.whatsapp.com/AbC",
      meetingPassword: null,
    });
  });

  it("includes the meeting password for a courtesy online order", () => {
    expect(
      accessLinksForOrder({
        orderStatus: "courtesy",
        event: { ...onlineEvent, meetingPassword: "cortesia" },
      }),
    ).toEqual({
      meetingUrl: "https://zoom.us/j/1",
      whatsappGroupUrl: "https://chat.whatsapp.com/AbC",
      meetingPassword: "cortesia",
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

  it("does not return a password for a pending online order", () => {
    expect(
      accessLinksForOrder({
        orderStatus: "pending",
        event: { ...onlineEvent, meetingPassword: "segredo" },
      }),
    ).toBeNull();
  });

  it("does not return a password for a presencial event", () => {
    expect(
      accessLinksForOrder({
        orderStatus: "paid",
        event: {
          modality: "presencial",
          meetingUrl: null,
          meetingPassword: "segredo",
        },
      }),
    ).toBeNull();
  });
});

describe("withOrderAccessLinks", () => {
  it("attaches the meeting password for a confirmed online order", () => {
    const order = withOrderAccessLinks({
      status: "paid",
      event: {
        title: "Curso",
        modality: "online",
        meetingUrl: "https://zoom.us/j/1",
        whatsappGroupUrl: null,
        meetingPassword: "segredo",
        confirmationEmailHtml: "<p>secreto</p>",
      },
    });
    expect(order.event).toMatchObject({
      meetingUrl: "https://zoom.us/j/1",
      meetingPassword: "segredo",
    });
    expect(order.event).not.toHaveProperty("confirmationEmailHtml");
  });

  it("omits the meeting password on a pending order", () => {
    const order = withOrderAccessLinks({
      status: "pending",
      event: {
        modality: "online",
        meetingUrl: "https://zoom.us/j/1",
        meetingPassword: "segredo",
      },
    });
    expect(order.event).not.toHaveProperty("meetingPassword");
    expect(order.event).not.toHaveProperty("meetingUrl");
  });
});

import { describe, it, expect } from "vitest";
import {
  buildOnlineEventEmailHtml,
  buildOnlineEventEmailText,
} from "../../utils/onlineEventEmailTemplate";

const base = {
  userName: "Maria",
  eventTitle: "Workshop Online",
  eventDate: new Date("2026-10-20T11:30:00.000Z"),
  meetingUrl: "https://zoom.us/j/123456",
  orderId: "abc-123",
};

describe("buildOnlineEventEmailHtml", () => {
  it("includes the meeting URL as a link", () => {
    const html = buildOnlineEventEmailHtml({ ...base, confirmationKind: "paid" });
    expect(html).toContain('href="https://zoom.us/j/123456"');
    expect(html).toContain("Acessar reunião");
  });

  it("does not mention a QR code", () => {
    const html = buildOnlineEventEmailHtml({ ...base, confirmationKind: "paid" });
    expect(html.toLowerCase()).not.toContain("qr");
    expect(html).not.toContain("ingresso");
  });

  it("confirms registration for a free event", () => {
    expect(
      buildOnlineEventEmailHtml({ ...base, confirmationKind: "free" }),
    ).toContain("Sua inscrição está confirmada!");
  });

  it("confirms presence for a courtesy ticket", () => {
    expect(
      buildOnlineEventEmailHtml({ ...base, confirmationKind: "courtesy" }),
    ).toContain("Sua presença foi confirmada!");
  });

  it("shows the event title", () => {
    expect(
      buildOnlineEventEmailHtml({ ...base, confirmationKind: "paid" }),
    ).toContain("Workshop Online");
  });

  it("injects custom confirmation HTML before the meeting card", () => {
    const html = buildOnlineEventEmailHtml({
      ...base,
      confirmationKind: "paid",
      customHtml: "<p>Traga o material</p>",
    });
    expect(html).toContain("Traga o material");
    expect(html).toContain("Acessar reunião");
    expect(html.indexOf("Traga o material")).toBeLessThan(
      html.indexOf("Acessar reunião"),
    );
  });

  it("does not inject a custom block when customHtml is omitted", () => {
    const html = buildOnlineEventEmailHtml({
      ...base,
      confirmationKind: "paid",
    });
    expect(html).not.toContain("custom-message");
    expect(html).toContain("Acessar reunião");
  });

  it("does not keep script tags from custom HTML", () => {
    const html = buildOnlineEventEmailHtml({
      ...base,
      confirmationKind: "paid",
      customHtml: "<script>alert(1)</script><p>Oi</p>",
    });
    expect(html).toContain("Oi");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("alert(1)");
  });
});

describe("buildOnlineEventEmailText", () => {
  it("includes the meeting URL in the plain-text body", () => {
    expect(
      buildOnlineEventEmailText({ ...base, confirmationKind: "paid" }),
    ).toContain("https://zoom.us/j/123456");
  });

  it("includes custom copy in the plain-text body", () => {
    expect(
      buildOnlineEventEmailText({
        ...base,
        confirmationKind: "paid",
        customHtml: "<p>Traga o material</p>",
      }),
    ).toContain("Traga o material");
  });

  it("does not mention a QR code in the plain-text body", () => {
    expect(
      buildOnlineEventEmailText({ ...base, confirmationKind: "paid" }).toLowerCase(),
    ).not.toContain("qr");
  });
});

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

  it("mentions the attached calendar invite", () => {
    const html = buildOnlineEventEmailHtml({ ...base, confirmationKind: "paid" });
    expect(html).toContain("invite.ics");
    expect(html).toContain("adicionar o evento à sua agenda");
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

  it("shows an escaped meeting password under the URL and above the calendar note", () => {
    const html = buildOnlineEventEmailHtml({
      ...base,
      confirmationKind: "paid",
      meetingPassword: `<script>alert("x")</script>`,
    });
    expect(html).toContain("Senha para a Reunião");
    expect(html).toContain('href="https://zoom.us/j/123456"');
    expect(html).toContain("https://zoom.us/j/123456");
    const visibleUrlAt = html.lastIndexOf("https://zoom.us/j/123456");
    const passwordAt = html.indexOf("Senha para a Reunião");
    const icsAt = html.indexOf("invite.ics");
    expect(passwordAt).toBeGreaterThan(visibleUrlAt);
    expect(icsAt).toBeGreaterThan(passwordAt);

    const passwordBlock = html.slice(passwordAt, icsAt);
    expect(passwordBlock).toContain("font-size: 18px");
    expect(passwordBlock).toContain("monospace");
    expect(passwordBlock).toContain("font-weight: bold");
    expect(passwordBlock).toMatch(/#0F4C75|#BBE1FA/);
    expect(passwordBlock).toContain(
      "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;",
    );
    expect(passwordBlock).not.toContain("<script>");
  });

  it.each(["paid", "free", "courtesy"] as const)(
    "keeps the %s confirmation line when a password is present",
    (confirmationKind) => {
      const lines = {
        paid: "Seu pagamento foi confirmado!",
        free: "Sua inscrição está confirmada!",
        courtesy: "Sua presença foi confirmada!",
      };
      expect(
        buildOnlineEventEmailHtml({
          ...base,
          confirmationKind,
          meetingPassword: "sala-42",
        }),
      ).toContain(lines[confirmationKind]);
    },
  );

  it.each([undefined, null, "", "   "] as const)(
    "omits the password label when the password is %j",
    (meetingPassword) => {
      const html = buildOnlineEventEmailHtml({
        ...base,
        confirmationKind: "paid",
        meetingPassword,
      });
      expect(html).not.toContain("Senha para a Reunião");
      expect(html).toContain('href="https://zoom.us/j/123456"');
    },
  );
});

describe("buildOnlineEventEmailText", () => {
  it("includes the meeting URL in the plain-text body", () => {
    expect(
      buildOnlineEventEmailText({ ...base, confirmationKind: "paid" }),
    ).toContain("https://zoom.us/j/123456");
  });

  it("mentions the attached calendar invite in the plain-text body", () => {
    expect(
      buildOnlineEventEmailText({ ...base, confirmationKind: "paid" }),
    ).toContain("invite.ics");
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

  it("includes a dedicated meeting-password line", () => {
    const text = buildOnlineEventEmailText({
      ...base,
      confirmationKind: "paid",
      meetingPassword: "sala-42",
    });
    expect(text).toContain("https://zoom.us/j/123456");
    expect(text).toContain("Senha para a Reunião: sala-42");
    expect(text.indexOf("Link da reunião:")).toBeLessThan(
      text.indexOf("Senha para a Reunião:"),
    );
    expect(text.indexOf("Senha para a Reunião:")).toBeLessThan(
      text.indexOf("invite.ics"),
    );
  });

  it("omits the password line when the password is blank", () => {
    const text = buildOnlineEventEmailText({
      ...base,
      confirmationKind: "courtesy",
      meetingPassword: "   ",
    });
    expect(text).not.toContain("Senha para a Reunião");
    expect(text).toContain("Sua presença foi confirmada!");
  });
});

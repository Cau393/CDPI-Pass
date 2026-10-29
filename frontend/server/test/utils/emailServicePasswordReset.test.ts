import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../storage", () => ({ storage: {} }));

import { emailService } from "../../services/emailService";

const user = { id: "u1", email: "a@example.com", password: "hash" };

describe("sendPasswordResetEmail wording", () => {
  const sendEmail = vi.spyOn(emailService, "sendEmail");
  beforeEach(() => {
    sendEmail.mockReset();
    sendEmail.mockResolvedValue(true);
  });

  function sent() {
    const [, subject, html, text] = sendEmail.mock.calls[0];
    return { subject, html: String(html), text: String(text) };
  }

  it("keeps the user-requested wording by default", async () => {
    await emailService.sendPasswordResetEmail(user);
    const { subject, html } = sent();
    expect(subject).toBe("Redefinição de Senha - CDPI Pass");
    expect(html).toContain("Você solicitou a redefinição de sua senha. Clique no link abaixo para criar uma nova:");
  });

  it("does not claim the person asked for it when a ticket link triggered it", async () => {
    await emailService.sendPasswordResetEmail(user, { purpose: "link" });
    const { subject, html, text } = sent();
    expect(html).not.toContain("Você solicitou");
    expect(html).toContain("link do ingresso");
    expect(html).toContain("/reset-password?token=");
    expect(text).toContain("/reset-password?token=");
    expect(subject).not.toContain("solicitou");
  });
});

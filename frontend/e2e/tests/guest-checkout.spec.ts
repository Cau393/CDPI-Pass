import type { Page } from "@playwright/test";
import { test, expect, expectNoHorizontalScroll } from "../support/fixtures";
import { createEvent, newEmail, personName, scalar, PASSWORD } from "../support/db";
import { clickEventCta, createAccount, login, makeUser, orderCount } from "../support/ui";
import { ADDRESS, newPassport, uniqueCpf } from "../support/flows";
import {
  confirmFakePayment,
  latestEmailLink,
  orderIdOf,
  paymentIdOf,
  payWithCard,
} from "../support/payments";
import { FAKE_CARDS } from "../harness/fakeCards";

interface GuestInput {
  name: string;
  email: string;
  /** National digits typed into the phone field (Brazil, +55 preset). */
  phone?: string;
}

const newGuest = (tag: string): GuestInput => ({
  name: personName(`Convidado ${tag}`),
  email: newEmail(tag),
  phone: "61987654321",
});

/** Waits for the guest dialog ("Complete sua inscrição" with "Seus dados") to settle. */
async function guestDialog(page: Page) {
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Seus dados")).toBeVisible({ timeout: 15_000 });
  const confirm = page.getByTestId("button-confirm-registration");
  let previous = "";
  await expect
    .poll(async () => {
      const now = JSON.stringify(await confirm.boundingBox());
      const settled = now === previous;
      previous = now;
      return settled;
    })
    .toBe(true);
  return dialog;
}

async function fillGuest(page: Page, g: GuestInput) {
  await page.getByTestId("input-guest-name").fill(g.name);
  await page.getByTestId("input-guest-email").fill(g.email);
  const phone = page.getByTestId("input-guest-phone");
  await phone.click();
  await page.keyboard.press("End");
  await phone.pressSequentially(g.phone ?? "61987654321");
}

/** Logged out: opens the event, fills "Seus dados" (+ document/address when given) and confirms. */
async function openAndFillDialog(
  page: Page,
  eventId: string,
  g: GuestInput,
  extra: { cpf?: string; passport?: string; address?: string } = {},
) {
  await clickEventCta(page, eventId);
  await guestDialog(page);
  await fillGuest(page, g);
  if (extra.passport) {
    await page.getByTestId("checkbox-foreigner").click();
    await page.getByTestId("input-foreign-document").fill(extra.passport);
  } else if (extra.cpf) {
    await page.getByTestId("input-cpf").pressSequentially(extra.cpf);
  }
  if (extra.address) await page.getByLabel("Endereço").fill(extra.address);
  await expectNoHorizontalScroll(page, "guest dialog");
  await page.getByTestId("button-confirm-registration").click();
}

/** After the dialog: waits for the payment modal and picks a tab. */
async function paymentModal(page: Page, tab: "PIX" | "Cartão") {
  const modal = page.getByRole("dialog");
  await modal.getByTestId("button-confirm-payment").waitFor({ timeout: 15_000 });
  await modal.getByRole("tab", { name: tab }).click();
  await expectNoHorizontalScroll(page, "payment modal");
  return modal;
}

const SUCCESS = "checkout-success";

test.describe("guest checkout (logged out)", () => {
  test("free online event: guest subscribes, success screen, order is a guest order", async ({ page }) => {
    const ev = await createEvent("onlineFree");
    const g = newGuest("gonfree");
    await openAndFillDialog(page, ev.id, g);
    const ok = page.getByTestId(SUCCESS);
    await expect(ok.getByText("Inscrição confirmada!")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("button-success-create-password")).toBeVisible();
    await expectNoHorizontalScroll(page, "free success");
    await expect.poll(() => orderCount(g.email, ev.id, "paid"), { timeout: 15_000 }).toBe("1");
    expect(
      await scalar(`SELECT o.placed_as_guest FROM orders o JOIN users x ON x.id=o.user_id WHERE lower(x.email)=lower($1)`, [g.email]),
    ).toBe(true);
    await page.getByTestId("button-success-close").click();
    await expect(page).toHaveURL(new RegExp(`/event/${ev.id}`));
  });

  test("free in-person event: guest sends CPF + address, gets a QR ticket", async ({ page }) => {
    const ev = await createEvent("presencialFree");
    const g = newGuest("gpresfree");
    await openAndFillDialog(page, ev.id, g, { cpf: uniqueCpf(), address: ADDRESS });
    await expect(page.getByTestId(SUCCESS).getByText("Inscrição confirmada!")).toBeVisible({ timeout: 20_000 });
    await expect.poll(() => orderCount(g.email, ev.id, "paid"), { timeout: 15_000 }).toBe("1");
    await expect
      .poll(() => scalar(`SELECT o.qr_code_data IS NOT NULL FROM orders o JOIN users x ON x.id=o.user_id WHERE lower(x.email)=lower($1)`, [g.email]), { timeout: 15_000 })
      .toBe(true);
    await expectNoHorizontalScroll(page, "free in-person success");
  });

  test("foreign free event: guest with passport subscribes", async ({ page }) => {
    const ev = await createEvent("presencialFree");
    const g = newGuest("gpyfree");
    const passport = newPassport("PY");
    await openAndFillDialog(page, ev.id, g, { passport, address: "Av. Mariscal López 1234, Asunción, Paraguay" });
    await expect(page.getByTestId(SUCCESS).getByText("Inscrição confirmada!")).toBeVisible({ timeout: 20_000 });
    await expect.poll(() => orderCount(g.email, ev.id, "paid"), { timeout: 15_000 }).toBe("1");
    expect(
      await scalar<string>(`SELECT is_foreigner || ' ' || foreign_document || ' ' || coalesce(cpf,'-') FROM users WHERE lower(email)=lower($1)`, [g.email]),
    ).toBe(`true ${passport} -`);
  });

  test("PIX: guest pays, webhook confirms, success screen appears without a reload", async ({ page, request }) => {
    const ev = await createEvent("presencialPaid");
    const g = newGuest("gpix");
    await openAndFillDialog(page, ev.id, g, { cpf: uniqueCpf(), address: ADDRESS });
    const modal = await paymentModal(page, "PIX");
    await page.evaluate(() => ((window as unknown as { __noReload: boolean }).__noReload = true));
    await modal.getByTestId("button-confirm-payment").click();
    await expect(modal.getByText("PIX Gerado com Sucesso!")).toBeVisible({ timeout: 15_000 });
    await expectNoHorizontalScroll(page, "PIX generated");
    await expect.poll(() => orderCount(g.email, ev.id, "pending")).toBe("1");
    await confirmFakePayment(request, {
      paymentId: await paymentIdOf(g.email, ev.id),
      orderId: await orderIdOf(g.email, ev.id),
    });
    await expect(page.getByTestId(SUCCESS).getByText("Pagamento confirmado!")).toBeVisible({ timeout: 30_000 });
    expect(await page.evaluate(() => (window as unknown as { __noReload?: boolean }).__noReload)).toBe(true);
    await expect(page.getByTestId("text-success-total")).toBeVisible();
    await expect.poll(() => orderCount(g.email, ev.id, "paid")).toBe("1");
    await expectNoHorizontalScroll(page, "PIX success");
  });

  test("card approved: success immediately", async ({ page }) => {
    const ev = await createEvent("presencialPaid");
    const g = newGuest("gcardok");
    await openAndFillDialog(page, ev.id, g, { cpf: uniqueCpf(), address: ADDRESS });
    const modal = await paymentModal(page, "Cartão");
    await payWithCard(modal, { number: FAKE_CARDS.approved });
    await expect(page.getByTestId(SUCCESS).getByText("Pagamento confirmado!")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("text-success-email")).toBeVisible();
    await expect.poll(() => orderCount(g.email, ev.id, "paid")).toBe("1");
    await expectNoHorizontalScroll(page, "card success");
  });

  test("card declined: message, retry with the approved card succeeds", async ({ page }) => {
    const ev = await createEvent("presencialPaid");
    const g = newGuest("gcarddec");
    await openAndFillDialog(page, ev.id, g, { cpf: uniqueCpf(), address: ADDRESS });
    const modal = await paymentModal(page, "Cartão");
    await payWithCard(modal, { number: FAKE_CARDS.declined });
    await expect(modal.getByTestId("text-card-error")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId(SUCCESS)).toHaveCount(0);
    await expectNoHorizontalScroll(page, "card declined");
    await payWithCard(modal, { number: FAKE_CARDS.approved });
    await expect(page.getByTestId(SUCCESS).getByText("Pagamento confirmado!")).toBeVisible({ timeout: 20_000 });
    await expect.poll(() => orderCount(g.email, ev.id, "paid")).toBe("1");
  });

  test("card in risk analysis: 'em análise', then flip + webhook shows success", async ({ page, request }) => {
    const ev = await createEvent("presencialPaid");
    const g = newGuest("gcardrisk");
    await openAndFillDialog(page, ev.id, g, { cpf: uniqueCpf(), address: ADDRESS });
    const modal = await paymentModal(page, "Cartão");
    await payWithCard(modal, { number: FAKE_CARDS.risk });
    await expect(modal.getByText("Pagamento em análise")).toBeVisible({ timeout: 20_000 });
    await expect(modal.getByTestId("text-payment-review")).toBeVisible();
    await expectNoHorizontalScroll(page, "card in review");
    await confirmFakePayment(request, {
      paymentId: await paymentIdOf(g.email, ev.id),
      orderId: await orderIdOf(g.email, ev.id),
      billingType: "CREDIT_CARD",
    });
    await expect.poll(() => orderCount(g.email, ev.id, "paid"), { timeout: 20_000 }).toBe("1");
    await expect(page.getByTestId(SUCCESS).getByText("Pagamento confirmado!")).toBeVisible({ timeout: 30_000 });
  });
});

test.describe("guest checkout and accounts", () => {
  test("password account e-mail: guest order stays hidden until the reset link sets a password", async ({ page }) => {
    const ev = await createEvent("onlineFree");
    // Signup-without-code path: a password row with email_verified false.
    const u = makeUser("gpwd");
    await createAccount(u);
    expect(await scalar(`SELECT email_verified FROM users WHERE lower(email)=lower($1)`, [u.email])).toBeFalsy();

    await openAndFillDialog(page, ev.id, { name: u.name, email: u.email });
    await expect(page.getByTestId(SUCCESS).getByText("Inscrição confirmada!")).toBeVisible({ timeout: 20_000 });
    await expect.poll(() => orderCount(u.email, ev.id, "paid"), { timeout: 15_000 }).toBe("1");

    // Logging in with the password does not list the guest order.
    await login(page, u.email);
    await page.goto("/profile");
    await expect(page.getByTestId("text-no-orders")).toBeVisible({ timeout: 15_000 });
    const orderId = await orderIdOf(u.email, ev.id);
    await expect(page.getByTestId(`order-${orderId}`)).toHaveCount(0);
    await page.evaluate(() => localStorage.clear());

    // The ticket e-mail link verifies nothing for a password row: the page shows the 409 and a reset
    // e-mail is queued (none existed before the click).
    let ticketLink: string | null = null;
    await expect.poll(async () => (ticketLink = await latestEmailLink(u.email, "/verify-email")), { timeout: 20_000 }).not.toBeNull();
    expect(await latestEmailLink(u.email, "/reset-password")).toBeNull();
    const [verifyResponse] = await Promise.all([
      page.waitForResponse((r) => r.url().includes("/api/auth/verify-email")),
      page.goto(new URL(ticketLink!).pathname + new URL(ticketLink!).search),
    ]);
    expect(verifyResponse.status()).toBe(409);
    await expect(page.getByRole("heading", { name: "Crie sua senha" })).toBeVisible();
    await expect(page.getByText("Para ver seus ingressos, crie uma nova senha pelo link que enviamos para o seu e-mail.")).toBeVisible();
    await expectNoHorizontalScroll(page, "verify-email 409");
    expect(await scalar(`SELECT email_verified FROM users WHERE lower(email)=lower($1)`, [u.email])).toBeFalsy();

    let resetLink: string | null = null;
    await expect.poll(async () => (resetLink = await latestEmailLink(u.email, "/reset-password")), { timeout: 20_000 }).not.toBeNull();
    await page.goto(new URL(resetLink!).pathname + new URL(resetLink!).search);
    await page.getByLabel("Nova Senha", { exact: true }).fill(PASSWORD);
    await page.getByLabel("Confirmar Nova Senha").fill(PASSWORD);
    await expectNoHorizontalScroll(page, "reset password page");
    await page.getByRole("button", { name: /Redefinir|Salvar|Criar|Alterar/i }).click();
    await page.waitForURL(/\/login/, { timeout: 15_000 });
    expect(await scalar(`SELECT email_verified FROM users WHERE lower(email)=lower($1)`, [u.email])).toBe(true);

    await login(page, u.email);
    await page.goto("/profile");
    await expect(page.getByTestId(`order-${orderId}`)).toBeVisible({ timeout: 15_000 });
    await expectNoHorizontalScroll(page, "Meus Ingressos after claim");
  });

  test("claim: a new guest buys, asks for a password, sets it, logs in and sees the order", async ({ page }) => {
    const ev = await createEvent("onlineFree");
    const g = newGuest("gclaim");
    await openAndFillDialog(page, ev.id, g);
    await expect(page.getByTestId(SUCCESS).getByText("Inscrição confirmada!")).toBeVisible({ timeout: 20_000 });
    await expect.poll(() => orderCount(g.email, ev.id, "paid"), { timeout: 15_000 }).toBe("1");
    const orderId = await orderIdOf(g.email, ev.id);

    // "Crie sua senha" leads to the forgot-password page (no e-mail in the URL).
    await page.getByTestId("button-success-create-password").click();
    await page.waitForURL(/\/forgot-password/, { timeout: 15_000 });
    expect(page.url()).not.toContain(encodeURIComponent(g.email));
    expect(page.url()).not.toContain("@");
    await page.getByLabel("E-mail").fill(g.email);
    await expectNoHorizontalScroll(page, "forgot password");
    await page.getByRole("button", { name: "Enviar Link de Redefinição" }).click();

    let resetLink: string | null = null;
    await expect.poll(async () => (resetLink = await latestEmailLink(g.email, "/reset-password")), { timeout: 20_000 }).not.toBeNull();
    await page.goto(new URL(resetLink!).pathname + new URL(resetLink!).search);
    await page.getByLabel("Nova Senha", { exact: true }).fill(PASSWORD);
    await page.getByLabel("Confirmar Nova Senha").fill(PASSWORD);
    await page.getByRole("button", { name: /Redefinir|Salvar|Criar|Alterar/i }).click();
    await page.waitForURL(/\/login/, { timeout: 15_000 });

    await login(page, g.email);
    await page.goto("/profile");
    await expect(page.getByTestId(`order-${orderId}`)).toBeVisible({ timeout: 15_000 });
    await expectNoHorizontalScroll(page, "Meus Ingressos after claim");
  });
});

import { test, expect, expectNoHorizontalScroll } from "../support/fixtures";
import { createEvent, fmtCpf, scalar, sql } from "../support/db";
import { clickEventCta, createAccount, login, makeUser, orderCount, waitForRegistrationDialog } from "../support/ui";
import { ADDRESS, completeRegistrationDialog, newPassport, paymentMethods, uniqueCpf } from "../support/flows";

test.describe("online free event", () => {
  test("BR 4-field account subscribes without any dialog", async ({ page }) => {
    const ev = await createEvent("onlineFree");
    const u = makeUser("onfree");
    await createAccount(u);
    await login(page, u.email);
    await clickEventCta(page, ev.id);
    await expect.poll(() => orderCount(u.email, ev.id, "paid"), { timeout: 15_000 }).toBe("1");
    await expect(page.getByText("Complete sua inscrição")).toHaveCount(0);
    expect(await scalar(`SELECT o.cpf IS NULL FROM orders o JOIN users x ON x.id=o.user_id WHERE lower(x.email)=lower($1)`, [u.email])).toBe(true);
    await expectNoHorizontalScroll(page, "event page after subscribe");
  });

  test("foreigner (+595) subscribes without any dialog or document", async ({ page }) => {
    const ev = await createEvent("onlineFree");
    const u = makeUser("onfreepy", { phone: "595981123456" });
    await createAccount(u);
    await login(page, u.email);
    await clickEventCta(page, ev.id);
    await expect.poll(() => orderCount(u.email, ev.id, "paid"), { timeout: 15_000 }).toBe("1");
    await expect(page.getByText("Complete sua inscrição")).toHaveCount(0);
  });
});

test.describe("presencial free event", () => {
  test("BR: dialog asks CPF + address, saves them on the account, confirms with a QR ticket", async ({ page }) => {
    const ev = await createEvent("presencialFree");
    const u = makeUser("presfree");
    await createAccount(u);
    await login(page, u.email);
    await clickEventCta(page, ev.id);
    const cpf = uniqueCpf();
    await completeRegistrationDialog(page, { cpf, address: ADDRESS });
    await expect.poll(() => orderCount(u.email, ev.id, "paid"), { timeout: 15_000 }).toBe("1");
    const row = await scalar<string>(`SELECT cpf || ' | ' || address FROM users WHERE lower(email)=lower($1)`, [u.email]);
    expect(row).toBe(`${fmtCpf(cpf)} | ${ADDRESS}`);
    await expect
      .poll(() => scalar(`SELECT o.qr_code_data IS NOT NULL FROM orders o JOIN users x ON x.id=o.user_id WHERE lower(x.email)=lower($1)`, [u.email]), { timeout: 15_000 })
      .toBe(true);
    // Asked once: the second in-person event only asks nothing about identity.
    const ev2 = await createEvent("presencialFree");
    await clickEventCta(page, ev2.id);
    await expect.poll(() => orderCount(u.email, ev2.id, "paid"), { timeout: 15_000 }).toBe("1");
    await expect(page.getByText("Complete sua inscrição")).toHaveCount(0);
  });

  test("foreigner: dialog asks passport + address", async ({ page }) => {
    const ev = await createEvent("presencialFree");
    const u = makeUser("presfreepy", { phone: "595981123456" });
    await createAccount(u);
    await login(page, u.email);
    await clickEventCta(page, ev.id);
    const passport = newPassport("PY");
    await completeRegistrationDialog(page, { passport, address: "Av. Mariscal López 1234, Asunción, Paraguay" });
    await expect.poll(() => orderCount(u.email, ev.id, "paid"), { timeout: 15_000 }).toBe("1");
    const row = await scalar<string>(`SELECT is_foreigner || ' ' || foreign_document || ' ' || coalesce(cpf,'-') FROM users WHERE lower(email)=lower($1)`, [u.email]);
    expect(row).toBe(`true ${passport} -`);
  });

  test("empty submit shows inline errors and creates no order", async ({ page }) => {
    const ev = await createEvent("presencialFree");
    const u = makeUser("presfreeerr");
    await createAccount(u);
    await login(page, u.email);
    await clickEventCta(page, ev.id);
    await waitForRegistrationDialog(page);
    await page.getByTestId("button-confirm-registration").click();
    await expect(page.locator(".text-destructive, .text-red-600").first()).toBeVisible();
    expect(await orderCount(u.email, ev.id)).toBe("0");
  });
});

test.describe("presencial paid event", () => {
  for (const method of ["PIX", "Boleto", "Cartão"] as const) {
    test(`BR pays with ${method}`, async ({ page, context }) => {
      const ev = await createEvent("presencialPaid");
      const u = makeUser(`paid${method.slice(0, 3).toLowerCase()}`);
      await createAccount(u);
      await login(page, u.email);
      await clickEventCta(page, ev.id);
      await completeRegistrationDialog(page, { cpf: uniqueCpf(), address: ADDRESS });
      const methods = await paymentMethods(page);
      expect(methods).toEqual(expect.arrayContaining(["PIX", "Cartão", "Boleto"]));
      const dialog = page.getByRole("dialog");
      await expectNoHorizontalScroll(page, "payment modal");
      await dialog.getByRole("tab", { name: method }).click();
      if (method === "Cartão") {
        const popup = context.waitForEvent("page");
        await dialog.getByTestId("button-confirm-payment").click();
        const opened = await popup;
        expect(opened.url()).toContain("/link/");
        await opened.close();
        await expect(dialog.getByText("Pagamento pendente")).toBeVisible();
      } else {
        await dialog.getByTestId("button-confirm-payment").click();
        if (method === "PIX") {
          await expect(dialog.getByText("PIX Gerado com Sucesso!")).toBeVisible();
          await expect(dialog.locator("input[readonly]")).toHaveValue(/FAKE-PIX/);
        } else {
          await expect(dialog.getByTestId("link-boleto")).toHaveAttribute("href", /\/boleto\/pay_fake/);
        }
      }
      await expectNoHorizontalScroll(page, `payment ${method}`);
      expect(await orderCount(u.email, ev.id, "pending")).toBe("1");
      expect(
        await scalar(`SELECT o.payment_method FROM orders o JOIN users x ON x.id=o.user_id WHERE lower(x.email)=lower($1)`, [u.email]),
      ).toBe(method === "PIX" ? "pix" : method === "Boleto" ? "boleto" : "credit_card");
    });
  }

  test("foreigner pays by international card only", async ({ page, context }) => {
    const ev = await createEvent("presencialPaid");
    const u = makeUser("paidpy", { phone: "595981123456" });
    await createAccount(u);
    await login(page, u.email);
    await clickEventCta(page, ev.id);
    await completeRegistrationDialog(page, { passport: newPassport("PY"), address: "Av. Mariscal López 1234, Asunción" });
    const methods = await paymentMethods(page);
    expect(methods).toEqual(["Cartão"]);
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText(/Pagamento internacional somente com cartão/)).toBeVisible();
    const popup = context.waitForEvent("page");
    await dialog.getByTestId("button-confirm-payment").click();
    const opened = await popup;
    expect(opened.url()).toContain("/invoice/pay_fake");
    await opened.close();
    await expect(dialog.getByText("Pagamento pendente")).toBeVisible();
    expect(await orderCount(u.email, ev.id, "pending")).toBe("1");
  });

  test("foreigner: Asaas 'foreign payers not enabled' shows the 503 message and creates no order", async ({ page }) => {
    const ev = await createEvent("presencialPaid");
    const u = makeUser("blocked", { phone: "595981123456" }); // fake Asaas rejects foreign customers whose e-mail starts "blocked."
    expect(u.email.startsWith("blocked.")).toBe(true);
    await createAccount(u);
    await login(page, u.email);
    await clickEventCta(page, ev.id);
    await completeRegistrationDialog(page, { passport: newPassport("PY"), address: "Av. Mariscal López 1234, Asunción" });
    await paymentMethods(page);
    const [resp] = await Promise.all([
      page.waitForResponse((r) => r.url().endsWith("/api/orders") && r.request().method() === "POST"),
      page.getByRole("dialog").getByTestId("button-confirm-payment").click(),
    ]);
    expect(resp.status()).toBe(503);
    expect((await resp.json()).code).toBe("foreign_payment_unavailable");
    await expect(page.getByLabel("Notifications (F8)").getByText(/International card payment is temporarily unavailable/)).toBeVisible();
    await expectNoHorizontalScroll(page, "503 toast");
    expect(await orderCount(u.email, ev.id)).toBe("0");
    // sanity: nothing else was created for the account
    expect(await sql(`SELECT 1 FROM orders o JOIN users x ON x.id=o.user_id WHERE lower(x.email)=lower($1)`, [u.email])).toHaveLength(0);
  });
});

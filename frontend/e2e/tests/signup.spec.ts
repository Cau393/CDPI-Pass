import { test, expect, expectNoHorizontalScroll } from "../support/fixtures";
import { createEvent, scalar } from "../support/db";
import { fillSignup, makeUser, submitAndVerify } from "../support/ui";

test.describe("signup (ADR-016 four fields)", () => {
  test("BR: top-bar Cadastre-se keeps ?next=, 4 fields, e-mail code, back to the event", async ({ page }, info) => {
    const ev = await createEvent("presencialFree");
    const u = makeUser("br");
    await page.goto(`/event/${ev.id}`);
    if (info.project.name === "w1280") {
      await page.getByTestId("nav-register").click();
    } else {
      await page.getByTestId("nav-register-mobile").click();
    }
    await page.waitForURL(/\/register\?next=/, { timeout: 15_000 });
    expect(decodeURIComponent(page.url())).toContain(`/event/${ev.id}`);

    await fillSignup(page, u);
    await expectNoHorizontalScroll(page, "signup form");
    await submitAndVerify(page, u.email);
    await page.waitForURL(new RegExp(`/event/${ev.id}`), { timeout: 20_000 });
    await expectNoHorizontalScroll(page, "event page after verify");

    const row = await scalar<string>(
      `SELECT coalesce(cpf,'-') || ' ' || coalesce(address,'-') || ' ' || phone || ' ' || occupation FROM users WHERE lower(email)=lower($1)`,
      [u.email],
    );
    expect(row).toBe("- - 5561987654321 Nao aplicavel");
  });

  test("foreigner: +595 phone, no document asked at signup", async ({ page }) => {
    const ev = await createEvent("onlineFree");
    const u = makeUser("py", { phone: "595981123456" });
    await page.goto(`/register?next=${encodeURIComponent(`/event/${ev.id}`)}`);
    await fillSignup(page, { ...u, country: "PY", phoneDisplayDigits: "981123456" });
    await expectNoHorizontalScroll(page, "foreigner signup form");
    await submitAndVerify(page, u.email);
    await page.waitForURL(new RegExp(`/event/${ev.id}`), { timeout: 20_000 });
    const row = await scalar<string>(
      `SELECT phone || ' ' || coalesce(cpf,'-') || ' ' || is_foreigner FROM users WHERE lower(email)=lower($1)`,
      [u.email],
    );
    expect(row).toBe("595981123456 - false");
  });
});

test.describe("phone field keyboard cases", () => {
  const cases = [
    { name: "Tab into Telefone keeps +55", via: "tab", typed: "11987654321", expect: "5511987654321" },
    { name: "click Telefone, type +595981123456", via: "click", typed: "+595981123456", expect: "595981123456" },
    { name: "click Telefone, type 11987654321 (control)", via: "click", typed: "11987654321", expect: "5511987654321" },
  ] as const;
  for (const c of cases) {
    test(c.name, async ({ page }) => {
      const u = makeUser("phone");
      await page.goto("/register");
      await page.getByTestId("input-name").fill(u.name);
      await page.getByTestId("input-email").fill(u.email);
      await page.getByTestId("input-email-confirm").fill(u.email);
      const phone = page.getByTestId("input-phone");
      if (c.via === "tab") {
        await page.getByTestId("input-email-confirm").focus();
        for (let t = 0; t < 5 && !(await phone.evaluate((el) => el === document.activeElement)); t++) {
          await page.keyboard.press("Tab");
        }
        expect(await phone.evaluate((el) => el === document.activeElement), "Tab reached the phone field").toBe(true);
        await page.keyboard.type(c.typed);
      } else {
        await phone.click();
        await page.keyboard.type(c.typed);
      }
      await page.getByTestId("input-password").fill("Senha@E2E2026");
      await page.getByTestId("input-password-confirm").fill("Senha@E2E2026");
      await page.getByTestId("checkbox-terms").click();
      await expectNoHorizontalScroll(page, "register page");
      const [resp] = await Promise.all([
        page.waitForResponse((r) => r.url().endsWith("/api/auth/register") && r.request().method() === "POST"),
        page.getByTestId("button-register").click(),
      ]);
      expect(resp.status()).toBe(201);
      const stored = await scalar<string>(`SELECT phone FROM users WHERE lower(email)=lower($1)`, [u.email]);
      expect(stored).toBe(c.expect);
    });
  }
});

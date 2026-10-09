import type { Page } from "@playwright/test";
import { expect } from "./fixtures";
import { cfg, newEmail, PASSWORD, personName, scalar, sql } from "./db";

export interface NewUser {
  name: string;
  email: string;
  phone: string; // digits with country code, no "+"
}

export function makeUser(tag: string, over: Partial<NewUser> = {}): NewUser {
  return {
    name: personName(`Teste ${tag}`),
    email: newEmail(tag),
    phone: "5561987654321",
    ...over,
  };
}

/** Creates a verified 4-field account through the API (the shape ADR-016 signup produces). */
export async function createAccount(u: NewUser, opts: { admin?: boolean } = {}) {
  const res = await fetch(`${cfg.baseUrl}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": `10.9.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` },
    body: JSON.stringify({ name: u.name, email: u.email, phone: u.phone, password: PASSWORD }),
  });
  if (res.status !== 201) throw new Error(`register ${res.status}`);
  await sql(`UPDATE users SET email_verified = true, is_admin = $2 WHERE lower(email) = lower($1)`, [u.email, opts.admin === true]);
}

export async function login(page: Page, email: string, password = PASSWORD) {
  await page.goto("/login");
  await page.getByTestId("input-email").fill(email);
  await page.getByTestId("input-password").fill(password);
  await page.getByTestId("button-login").click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20_000 });
}

/** Fills the 4-field signup form and submits it. Does not verify. */
export async function fillSignup(
  page: Page,
  u: NewUser & { country?: string; phoneDisplayDigits?: string },
) {
  for (const t of ["input-cpf", "checkbox-foreigner", "input-birth-date", "input-address", "input-occupation", "input-partner-company", "input-area-of-activity"]) {
    expect(await page.getByTestId(t).count(), `${t} still on the signup form`).toBe(0);
  }
  await page.getByTestId("input-name").fill(u.name);
  await page.getByTestId("input-email").fill(u.email);
  await page.getByTestId("input-email-confirm").fill(u.email);
  if (u.country) await page.locator(".PhoneInputCountrySelect").selectOption(u.country);
  await page.getByTestId("input-phone").click();
  await page.keyboard.press("End");
  await page.getByTestId("input-phone").pressSequentially(u.phoneDisplayDigits ?? u.phone.replace(/^55/, ""));
  await page.getByTestId("input-password").fill(PASSWORD);
  await page.getByTestId("input-password-confirm").fill(PASSWORD);
  await page.getByTestId("checkbox-terms").click();
}

/** Submits the signup form, reads the e-mail code from the database and verifies. */
export async function submitAndVerify(page: Page, email: string) {
  await page.getByTestId("button-register").click();
  await page.waitForURL(/\/verify-email\?/, { timeout: 20_000 });
  const code = await scalar<string>(`SELECT email_verification_code FROM users WHERE lower(email) = lower($1)`, [email]);
  expect(code, `no verification code for ${email}`).toMatch(/^\d{6}$/);
  await page.locator("#code").fill(code!);
  await page.getByRole("button", { name: "Verificar" }).click();
}

/** Opens an event page and clicks its main call to action. */
export async function clickEventCta(page: Page, eventId: string) {
  await page.goto(`/event/${eventId}`);
  await page.getByTestId("button-event-cta").click();
}

export async function waitForRegistrationDialog(page: Page) {
  await page.getByText("Complete sua inscrição").waitFor({ timeout: 10_000 });
  // The dialog zooms in: wait until the confirm button stopped moving.
  const confirm = page.getByTestId("button-confirm-registration");
  await expect(confirm).toBeVisible();
  let previous = "";
  await expect
    .poll(async () => {
      const now = JSON.stringify(await confirm.boundingBox());
      const settled = now === previous;
      previous = now;
      return settled;
    })
    .toBe(true);
}

export const orderCount = (email: string, eventId: string, status?: string) =>
  scalar<string>(
    `SELECT count(*) FROM orders o JOIN users u ON u.id = o.user_id WHERE lower(u.email) = lower($1) AND o.event_id = $2 ${status ? "AND o.status = $3" : ""}`,
    status ? [email, eventId, status] : [email, eventId],
  );

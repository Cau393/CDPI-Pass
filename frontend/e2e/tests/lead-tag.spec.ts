import type { Browser, Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { createEvent, newEmail, personName, scalar } from "../support/db";
import { createAccount, login, makeUser, orderCount } from "../support/ui";

/** ADR-018 lead tags: ?tag= on the event link ends up as "Origem" on the admin participants page. */

const newGuest = (tag: string) => ({ name: personName(`Convidado ${tag}`), email: newEmail(tag) });

/** Logged-out free subscribe through the real guest dialog, starting from the already-open event page. */
async function subscribeAsGuest(page: Page, g: { name: string; email: string }) {
  await page.getByTestId("button-event-cta").click();
  await expect(page.getByRole("dialog").getByText("Seus dados")).toBeVisible({ timeout: 15_000 });
  await page.getByTestId("input-guest-name").fill(g.name);
  await page.getByTestId("input-guest-email").fill(g.email);
  const phone = page.getByTestId("input-guest-phone");
  await phone.click();
  await page.keyboard.press("End");
  await phone.pressSequentially("61987654321");
  await page.getByTestId("button-confirm-registration").click();
  await expect(page.getByTestId("checkout-success").getByText("Inscrição confirmada!")).toBeVisible({ timeout: 20_000 });
}

/** A fresh admin session in its own context (the guest page may carry hostile storage). */
async function adminPage(browser: Browser, page: Page) {
  const context = await browser.newContext({
    baseURL: test.info().project.use.baseURL,
    viewport: page.viewportSize() ?? undefined,
    isMobile: test.info().project.use.isMobile,
    hasTouch: test.info().project.use.hasTouch,
  });
  const admin = await context.newPage();
  const u = makeUser("ltadmin");
  await createAccount(u, { admin: true });
  await login(admin, u.email);
  return { admin, context };
}

async function originOnParticipantsPage(admin: Page, eventId: string, email: string) {
  await admin.goto("/admin/participants");
  await admin.getByRole("combobox").first().click();
  await admin.locator(`[role="option"][data-value="${eventId}"]`).click();
  const row = admin.getByRole("row").filter({ hasText: email });
  await expect(row).toBeVisible({ timeout: 15_000 });
  await expect(admin.getByRole("columnheader", { name: "Origem" })).toBeVisible();
  return row;
}

const storedTag = (email: string, eventId: string) =>
  scalar<string>(
    `SELECT o.lead_tag FROM orders o JOIN users u ON u.id = o.user_id WHERE lower(u.email) = lower($1) AND o.event_id = $2`,
    [email, eventId],
  );

test.describe("lead tags", () => {
  test("tagged link, untagged revisit, free guest subscribe: Origem is Parceiros", async ({ page, browser }) => {
    const ev = await createEvent("onlineFree", { titleSuffix: "lt1" });
    const g = newGuest("lt1");
    await page.goto(`/event/${ev.id}?tag=parceiros`);
    await expect(page.getByTestId("button-event-cta")).toBeVisible();
    // Full reload on the bare URL: only the persisted layers (cookie / localStorage / sessionStorage) can carry the tag.
    await page.goto(`/event/${ev.id}`);
    expect(new URL(page.url()).search).toBe("");
    await subscribeAsGuest(page, g);
    await expect.poll(() => orderCount(g.email, ev.id, "paid"), { timeout: 15_000 }).toBe("1");
    expect(await storedTag(g.email, ev.id)).toBe("parceiros");

    const { admin, context } = await adminPage(browser, page);
    try {
      const row = await originOnParticipantsPage(admin, ev.id, g.email);
      await expect(row).toContainText("Parceiros");
      await expect(row).not.toContainText("Direto");
    } finally {
      await context.close();
    }
  });

  // Hostile storage. The app's own auth code reads localStorage("token") unguarded, so a wholesale
  // throwing localStorage would crash unrelated pages; instead the lead-tag keys (`cdpi:lt:*`) throw on
  // localStorage (and on sessionStorage with `sessionStorageToo`), and document.cookie is a no-op.
  const hostile = (sessionStorageToo: boolean) => async (page: Page) => {
    await page.addInitScript((blockSession) => {
      for (const method of ["getItem", "setItem"] as const) {
        const original = Storage.prototype[method] as (this: Storage, ...a: string[]) => string | null | void;
        Storage.prototype[method] = function (this: Storage, key: string, value?: string) {
          const blocked = this === window.localStorage || (blockSession && this === window.sessionStorage);
          if (blocked && String(key).startsWith("cdpi:lt:")) throw new DOMException("denied", "SecurityError");
          return original.call(this, key, value as string);
        } as typeof Storage.prototype.getItem;
      }
      Object.defineProperty(Document.prototype, "cookie", { configurable: true, get: () => "", set: () => {} });
    }, sessionStorageToo);
  };

  test("hostile storage (lead-tag localStorage throws, cookies dead): sessionStorage carries the tag across a full reload", async ({ page, browser }) => {
    await hostile(false)(page);
    const ev = await createEvent("onlineFree", { titleSuffix: "lt2" });
    const g = newGuest("lt2");
    await page.goto(`/event/${ev.id}?tag=parceiros`);
    await expect(page.getByTestId("button-event-cta")).toBeVisible();
    expect(await page.evaluate(() => document.cookie)).toBe("");
    await page.goto(`/event/${ev.id}`);
    expect(new URL(page.url()).search).toBe("");
    await subscribeAsGuest(page, g);
    await expect.poll(() => orderCount(g.email, ev.id, "paid"), { timeout: 15_000 }).toBe("1");
    expect(await storedTag(g.email, ev.id)).toBe("parceiros");

    const { admin, context } = await adminPage(browser, page);
    try {
      await expect(await originOnParticipantsPage(admin, ev.id, g.email)).toContainText("Parceiros");
    } finally {
      await context.close();
    }
  });

  test("every store dead: the in-memory layer carries the tag through an in-app (SPA) navigation", async ({ page, browser }) => {
    await hostile(true)(page);
    const ev = await createEvent("onlineFree", { titleSuffix: "lt3" });
    const g = newGuest("lt3");
    await page.goto(`/event/${ev.id}?tag=parceiros`);
    await expect(page.getByTestId("button-event-cta")).toBeVisible();
    // Client-side navigation to the bare URL (no reload, so the module-level memory survives).
    await page.evaluate((path) => {
      history.pushState({}, "", path);
      window.dispatchEvent(new PopStateEvent("popstate"));
    }, `/event/${ev.id}`);
    await expect(page).toHaveURL(new RegExp(`/event/${ev.id}$`));
    await expect(page.getByTestId("button-event-cta")).toBeVisible();
    await subscribeAsGuest(page, g);
    await expect.poll(() => orderCount(g.email, ev.id, "paid"), { timeout: 15_000 }).toBe("1");
    expect(await storedTag(g.email, ev.id)).toBe("parceiros");

    const { admin, context } = await adminPage(browser, page);
    try {
      await expect(await originOnParticipantsPage(admin, ev.id, g.email)).toContainText("Parceiros");
    } finally {
      await context.close();
    }
  });

  test("admin events list: Copiar link > E-mail copies the tagged event URL", async ({ page, context }) => {
    test.skip((page.viewportSize()?.width ?? 0) < 768, "the copy buttons are hidden below the md breakpoint");
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    const ev = await createEvent("onlineFree", { titleSuffix: "lt4" });
    const u = makeUser("ltadmin2");
    await createAccount(u, { admin: true });
    await login(page, u.email);
    await page.goto("/admin/events");
    await page.getByTestId("input-search-admin-events").fill(ev.title); // the list is paginated and shared with other specs
    await page.getByRole("button", { name: `Copiar link (${ev.title})` }).click();
    await page.getByRole("menuitem", { name: "E-mail" }).click();
    await expect(page.getByText("O link (E-mail) foi copiado para a área de transferência.", { exact: true })).toBeVisible();
    const origin = new URL(page.url()).origin;
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(`${origin}/event/${ev.id}?tag=email`);
  });
});

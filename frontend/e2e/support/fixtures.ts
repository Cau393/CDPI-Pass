import { test as base, expect, type Page } from "@playwright/test";
import { randomInt } from "node:crypto";

/**
 * Every test gets: a unique X-Forwarded-For (the app's auth rate limiter keys on it, and
 * every test would otherwise share 127.0.0.1), and a hard failure on any uncaught
 * page error in any page of the test's context.
 */
export const test = base.extend<{ pageErrors: string[] }>({
  context: async ({ context }, use) => {
    await context.setExtraHTTPHeaders({
      "x-forwarded-for": `10.${randomInt(1, 255)}.${randomInt(1, 255)}.${randomInt(1, 255)}`,
    });
    await use(context);
  },
  pageErrors: [
    async ({ context }, use) => {
      const errors: string[] = [];
      const watch = (p: Page) => p.on("pageerror", (e) => errors.push(String(e.message).split("\n")[0]));
      context.pages().forEach(watch);
      context.on("page", watch);
      await use(errors);
      expect(errors, "uncaught page errors").toEqual([]);
    },
    { auto: true },
  ],
});
export { expect };

/** `document.documentElement.scrollWidth <= innerWidth`. Call with the page settled. */
export async function expectNoHorizontalScroll(page: Page, where = "") {
  const { sw, vw } = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    vw: window.innerWidth,
  }));
  expect(sw, `horizontal scroll ${where} (scrollWidth ${sw} > innerWidth ${vw})`).toBeLessThanOrEqual(vw);
}

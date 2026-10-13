import { test as base, expect, type Page } from "@playwright/test";

/**
 * Every test gets a hard failure on any uncaught page error in any page of the test's
 * context. All tests log in from 127.0.0.1, so the harness raises the auth rate limit
 * (AUTH_RATE_LIMIT_MAX in harness/serve.ts) instead of spoofing X-Forwarded-For, which
 * the limiter no longer reads (security backlog #15).
 */
export const test = base.extend<{ pageErrors: string[] }>({
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

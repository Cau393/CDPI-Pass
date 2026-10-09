import type { Page } from "@playwright/test";
import { expect, expectNoHorizontalScroll } from "./fixtures";
import { uniqueCpf } from "./db";
import { waitForRegistrationDialog } from "./ui";

export const ADDRESS = "SQN 210 Bloco A, Asa Norte, Brasília - DF";

/** Fills the "Complete sua inscrição" dialog and confirms. */
export async function completeRegistrationDialog(
  page: Page,
  opts: { cpf?: string; passport?: string; address?: string; answers?: Record<string, string> } = {},
) {
  await waitForRegistrationDialog(page);
  if (opts.passport) {
    await page.getByTestId("checkbox-foreigner").click();
    await page.getByTestId("input-foreign-document").fill(opts.passport);
  } else if (opts.cpf) {
    await page.getByTestId("input-cpf").pressSequentially(opts.cpf);
  }
  if (opts.address) await page.getByLabel("Endereço").fill(opts.address);
  for (const [label, value] of Object.entries(opts.answers ?? {})) {
    await page.getByLabel(new RegExp(label)).fill(value);
  }
  await expectNoHorizontalScroll(page, "registration dialog");
  await page.getByTestId("button-confirm-registration").click();
}

export const newPassport = (tag: string) => `${tag}${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 14);
export { uniqueCpf };

/** Payment modal tab labels. */
export async function paymentMethods(page: Page): Promise<string[]> {
  const dialog = page.getByRole("dialog");
  await dialog.getByTestId("button-confirm-payment").waitFor({ timeout: 15_000 });
  return (await dialog.getByRole("tab").allInnerTexts()).map((t) => t.trim());
}

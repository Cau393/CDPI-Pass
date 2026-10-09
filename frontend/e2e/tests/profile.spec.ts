import { test, expect, expectNoHorizontalScroll } from "../support/fixtures";
import { scalar } from "../support/db";
import { createAccount, login, makeUser } from "../support/ui";

test("profile save for a 4-field account: work fields empty, saved, no overflow", async ({ page }) => {
  const u = makeUser("profile");
  await createAccount(u);
  await login(page, u.email);
  await page.goto("/profile");
  await page.getByTestId("tab-profile").click();
  expect(await page.getByTestId("input-profile-occupation").inputValue()).toBe("");
  expect(await page.getByTestId("input-profile-cpf").inputValue()).toBe("");
  // First save with nothing changed must work (p4 step 5).
  const saveProfile = async () => {
    const [resp] = await Promise.all([
      page.waitForResponse((r) => /\/api\/profile$/.test(r.url()) && ["PUT", "PATCH"].includes(r.request().method())),
      page.getByRole("button", { name: "Salvar Alterações" }).click(),
    ]);
    expect(resp.status()).toBe(200);
  };
  await saveProfile();
  await expect(page.getByText(/Perfil atualizado/).first()).toBeVisible();
  await page.reload(); // the saved account refreshes the form; start the next edit from the settled state
  await page.getByTestId("tab-profile").click();
  // Then fill the work fields.
  await page.getByTestId("input-profile-occupation").fill("Analista");
  await page.getByTestId("input-profile-partner-company").fill("Empresa Parceira");
  await page.getByTestId("input-profile-area-of-activity").fill("Farmácia");
  await page.getByTestId("input-profile-address").fill("SQN 210 Bloco A, Asa Norte, Brasília - DF");
  await expectNoHorizontalScroll(page, "profile");
  await saveProfile();
  await expect.poll(() =>
    scalar<string>(`SELECT occupation || '|' || partner_company || '|' || area_of_activity || '|' || coalesce(address,'-') FROM users WHERE lower(email)=lower($1)`, [u.email]),
  ).toBe("Analista|Empresa Parceira|Farmácia|SQN 210 Bloco A, Asa Norte, Brasília - DF");
});

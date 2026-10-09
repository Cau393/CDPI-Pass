import { randomBytes } from "node:crypto";
import { test, expect, expectNoHorizontalScroll } from "../support/fixtures";
import { createEvent, question, scalar, sql, uniqueCpf, fmtCpf } from "../support/db";
import { createAccount, login, makeUser } from "../support/ui";
import { ADDRESS, newPassport } from "../support/flows";

async function courtesyLink(eventId: string, adminEmail: string) {
  const code = `E2E${randomBytes(4).toString("hex").toUpperCase()}`;
  const adminId = await scalar<string>(`SELECT id FROM users WHERE lower(email)=lower($1)`, [adminEmail]);
  await sql(
    `INSERT INTO courtesy_links (event_id, code, ticket_count, used_count, is_active, created_by) VALUES ($1,$2,5,0,true,$3)`,
    [eventId, code, adminId],
  );
  return code;
}

test.describe("courtesy redemption", () => {
  test("online (+595, 4-field account): no CPF / birth date / address, question answered", async ({ page }) => {
    const ev = await createEvent("onlineFree", { titleSuffix: "cortesia", isFree: false, registrationForm: [question("q-origem", "Como soube do evento?")] });
    const admin = makeUser("cadmin");
    await createAccount(admin, { admin: true });
    const guest = makeUser("cguest", { phone: "595981654321" });
    await createAccount(guest);
    const code = await courtesyLink(ev.id, admin.email);
    await login(page, guest.email);
    await page.goto(`/cortesia?code=${code}`);
    await page.getByTestId("input-name").waitFor({ timeout: 20_000 });
    for (const t of ["input-cpf", "input-birth-date", "input-address", "checkbox-foreigner"]) {
      await expect(page.getByTestId(t), `${t} shown on an online courtesy`).toHaveCount(0);
    }
    await page.getByTestId("input-partner-company").fill("Empresa Parceira");
    await page.getByTestId("input-occupation").fill("Analista");
    await page.getByLabel(/Como soube do evento/).fill("Instagram da CDPI");
    await expectNoHorizontalScroll(page, "online courtesy form");
    await page.getByTestId("button-redeem").click();
    await expect(page.getByText("Cortesia Resgatada!")).toBeVisible({ timeout: 20_000 });
    const row = await scalar<string>(
      `SELECT coalesce(a.cpf,'-') || ' ' || coalesce(a.address,'-') || ' ' || o.registration_answers::text
         FROM orders o JOIN courtesy_attendees a ON a.id=o.courtesy_attendee_id WHERE o.event_id=$1`,
      [ev.id],
    );
    expect(row.startsWith("- - ")).toBe(true);
    expect(row).toContain("Instagram da CDPI");
    await expectNoHorizontalScroll(page, "courtesy success");
  });

  test("in-person BR: CPF, birth date and address are required and stored on the attendee", async ({ page }) => {
    const ev = await createEvent("presencialPaid", { titleSuffix: "cortesia" });
    const admin = makeUser("cadmin2");
    await createAccount(admin, { admin: true });
    const guest = makeUser("cguest2");
    await createAccount(guest);
    const code = await courtesyLink(ev.id, admin.email);
    await login(page, guest.email);
    await page.goto(`/cortesia?code=${code}`);
    await page.getByTestId("input-name").waitFor({ timeout: 20_000 });
    for (const t of ["input-cpf", "input-birth-date", "input-address"]) await expect(page.getByTestId(t)).toBeVisible();
    const cpf = uniqueCpf();
    await page.getByTestId("input-cpf").pressSequentially(cpf);
    await page.getByTestId("input-birth-date").fill("1988-08-11");
    await page.getByTestId("input-partner-company").fill("Empresa Parceira");
    await page.getByTestId("input-occupation").fill("Analista");
    await page.getByTestId("input-address").fill(ADDRESS);
    await expectNoHorizontalScroll(page, "in-person courtesy form");
    await page.getByTestId("button-redeem").click();
    await expect(page.getByText("Cortesia Resgatada!")).toBeVisible({ timeout: 20_000 });
    const row = await scalar<string>(
      `SELECT a.cpf || ' | ' || a.address FROM orders o JOIN courtesy_attendees a ON a.id=o.courtesy_attendee_id WHERE o.event_id=$1`,
      [ev.id],
    );
    expect(row).toBe(`${fmtCpf(cpf)} | ${ADDRESS}`);
  });

  test("in-person foreigner: passport instead of CPF", async ({ page }) => {
    const ev = await createEvent("presencialFree", { titleSuffix: "cortesia", isFree: false });
    const admin = makeUser("cadmin3");
    await createAccount(admin, { admin: true });
    const guest = makeUser("cguest3", { phone: "595981654321" });
    await createAccount(guest);
    const code = await courtesyLink(ev.id, admin.email);
    await login(page, guest.email);
    await page.goto(`/cortesia?code=${code}`);
    await page.getByTestId("input-name").waitFor({ timeout: 20_000 });
    const passport = newPassport("PY");
    await page.getByTestId("checkbox-foreigner").click();
    await page.getByTestId("input-foreign-document").fill(passport);
    await page.getByTestId("input-birth-date").fill("1990-01-02");
    await page.getByTestId("input-partner-company").fill("Empresa");
    await page.getByTestId("input-occupation").fill("Analista");
    await page.getByTestId("input-address").fill("Av. Mariscal López 1234, Asunción");
    await page.getByTestId("button-redeem").click();
    await expect(page.getByText("Cortesia Resgatada!")).toBeVisible({ timeout: 20_000 });
    expect(
      await scalar<string>(`SELECT a.foreign_document FROM orders o JOIN courtesy_attendees a ON a.id=o.courtesy_attendee_id WHERE o.event_id=$1`, [ev.id]),
    ).toBe(passport);
  });
});

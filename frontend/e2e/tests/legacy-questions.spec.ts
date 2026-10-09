import { randomBytes } from "node:crypto";
import path from "node:path";
import { createRequire } from "node:module";
import { test, expect, expectNoHorizontalScroll } from "../support/fixtures";
import { cfg, fmtCpf, legacyQuestionsAttached, PASSWORD, prodId, scalar, sql, uniqueCpf } from "../support/db";
import { clickEventCta, createAccount, login, makeUser, orderCount, waitForRegistrationDialog } from "../support/ui";
import { ADDRESS, paymentMethods } from "../support/flows";

const XLSX = createRequire(import.meta.url)("xlsx") as typeof import("xlsx");

const L = {
  cargo: /^Cargo que ocupa/,
  empresa: /^Empresa que trabalha/,
  area: /^Área de atuação/,
};
const OLD_PROFILE = { occupation: "Farmacêutica Sênior", company: "Laboratório Aurora", area: "Assuntos Regulatórios" };

/** The prod ids carry the three legacy questions (global setup applied sql/adr016_attach_legacy_questions.sql). */
test.beforeAll(async () => {
  test.skip(!(await legacyQuestionsAttached()), "legacy questions are not attached to the prod-id events in this database");
});

/** An account made by the OLD full signup: document, address and the three work fields set. */
async function createOldFullProfileAccount(tag: string) {
  const u = makeUser(tag);
  await createAccount(u);
  const cpf = uniqueCpf();
  await sql(
    `UPDATE users SET cpf=$2, birth_date='1988-08-11', address=$3, occupation=$4, partner_company=$5, area_of_activity=$6 WHERE lower(email)=lower($1)`,
    [u.email, fmtCpf(cpf), ADDRESS, OLD_PROFILE.occupation, OLD_PROFILE.company, OLD_PROFILE.area],
  );
  return { u, cpf: fmtCpf(cpf) };
}

const answersOf = async (email: string, eventId: string) => {
  const raw = await scalar<string>(
    `SELECT o.registration_answers::text FROM orders o JOIN users x ON x.id=o.user_id WHERE lower(x.email)=lower($1) AND o.event_id=$2 ORDER BY o.created_at DESC LIMIT 1`,
    [email, eventId],
  );
  const list = JSON.parse(raw ?? "[]") as { fieldId: string; value: string }[];
  return Object.fromEntries(list.map((a) => [a.fieldId, a.value]));
};

async function bearerFor(email: string): Promise<string> {
  const res = await fetch(`${cfg.baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": `10.8.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  return (await res.json()).token as string;
}

test.describe("legacy questions (C1)", () => {
  test("old full-profile account: the 3 questions come prefilled and editable; document/address are never asked again", async ({ page }) => {
    const { u } = await createOldFullProfileAccount("legold");
    const eventId = prodId("onlineFree");
    await login(page, u.email);
    await clickEventCta(page, eventId);
    await waitForRegistrationDialog(page);
    await expect(page.getByLabel(L.cargo)).toHaveValue(OLD_PROFILE.occupation);
    await expect(page.getByLabel(L.empresa)).toHaveValue(OLD_PROFILE.company);
    await expect(page.getByLabel(L.area)).toHaveValue(OLD_PROFILE.area);
    await expect(page.getByTestId("input-cpf")).toHaveCount(0);
    await expect(page.getByTestId("checkbox-foreigner")).toHaveCount(0);
    await expect(page.getByLabel("Endereço")).toHaveCount(0);
    await expectNoHorizontalScroll(page, "legacy dialog");
    // editable: the attendee changes the cargo for this inscription
    await page.getByLabel(L.cargo).fill("Diretora Técnica");
    await page.getByTestId("button-confirm-registration").click();
    await expect.poll(() => orderCount(u.email, eventId, "paid"), { timeout: 20_000 }).toBe("1");
    expect(await answersOf(u.email, eventId)).toEqual({
      "legacy-occupation": "Diretora Técnica",
      "legacy-partner-company": OLD_PROFILE.company,
      "legacy-area-of-activity": OLD_PROFILE.area,
    });
  });

  test("old full-profile account on the paid in-person event: 3 prefilled, no CPF/address, straight to checkout", async ({ page }) => {
    const { u } = await createOldFullProfileAccount("legoldpaid");
    await login(page, u.email);
    await clickEventCta(page, prodId("presencialPaid"));
    await waitForRegistrationDialog(page);
    await expect(page.getByLabel(L.area)).toHaveValue(OLD_PROFILE.area);
    await expect(page.getByTestId("input-cpf")).toHaveCount(0);
    await expect(page.getByLabel("Endereço")).toHaveCount(0);
    await page.getByTestId("button-confirm-registration").click();
    expect(await paymentMethods(page)).toEqual(expect.arrayContaining(["PIX", "Cartão", "Boleto"]));
    await expectNoHorizontalScroll(page, "legacy checkout");
  });

  test("4-field account must answer them: blocked in the UI and 400 from the API until filled", async ({ page }) => {
    const u = makeUser("legnew");
    await createAccount(u);
    const eventId = prodId("onlineFree");

    // API: no answers -> 400 naming a question; nothing is created
    const token = await bearerFor(u.email);
    const res = await fetch(`${cfg.baseUrl}/api/events/${eventId}/subscribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, "x-forwarded-for": "10.7.1.1" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    expect(await orderCount(u.email, eventId)).toBe("0");

    await login(page, u.email);
    await clickEventCta(page, eventId);
    await waitForRegistrationDialog(page);
    for (const label of Object.values(L)) await expect(page.getByLabel(label)).toHaveValue("");
    await page.getByTestId("button-confirm-registration").click();
    await expect.poll(() => page.locator(".text-destructive, .text-red-600").count()).toBeGreaterThanOrEqual(3);
    expect(await orderCount(u.email, eventId)).toBe("0");

    await page.getByLabel(L.cargo).fill("Analista");
    await page.getByLabel(L.empresa).fill("Empresa Nova");
    await page.getByLabel(L.area).fill("Qualidade");
    await page.getByTestId("button-confirm-registration").click();
    await expect.poll(() => orderCount(u.email, eventId, "paid"), { timeout: 20_000 }).toBe("1");
    expect(await answersOf(u.email, eventId)).toEqual({
      "legacy-occupation": "Analista",
      "legacy-partner-company": "Empresa Nova",
      "legacy-area-of-activity": "Qualidade",
    });
  });

  test("courtesy page (in-person, sales closed): Cargo/Empresa questions hidden and fed by the form's own fields, Área asked", async ({ page }) => {
    const eventId = prodId("presencialFree");
    const admin = makeUser("legadmin");
    await createAccount(admin, { admin: true });
    const guest = makeUser("legguest");
    await createAccount(guest);
    const code = `E2E${randomBytes(4).toString("hex").toUpperCase()}`;
    const adminId = await scalar<string>(`SELECT id FROM users WHERE lower(email)=lower($1)`, [admin.email]);
    await sql(`INSERT INTO courtesy_links (event_id, code, ticket_count, used_count, is_active, created_by) VALUES ($1,$2,5,0,true,$3)`, [eventId, code, adminId]);
    await login(page, guest.email);
    await page.goto(`/cortesia?code=${code}`);
    await page.getByTestId("input-name").waitFor({ timeout: 30_000 });
    await expect(page.locator("label", { hasText: L.cargo })).toHaveCount(0);
    await expect(page.locator("label", { hasText: L.empresa })).toHaveCount(0);
    await expect(page.locator("label", { hasText: L.area })).toHaveCount(1);

    await page.getByTestId("input-cpf").pressSequentially(uniqueCpf());
    await page.getByTestId("input-birth-date").fill("1988-08-11");
    await page.getByTestId("input-partner-company").fill("Empresa da Cortesia");
    await page.getByTestId("input-occupation").fill("Gerente da Cortesia");
    await page.getByTestId("input-address").fill(ADDRESS);
    await expectNoHorizontalScroll(page, "courtesy with legacy area");
    // Área is required: blocked until answered
    await page.getByTestId("button-redeem").click();
    await expect(page.getByTestId("button-redeem")).toBeVisible();
    expect(await scalar<string>(`SELECT count(*) FROM orders WHERE event_id=$1 AND courtesy_attendee_id IS NOT NULL AND user_id=(SELECT id FROM users WHERE lower(email)=lower($2))`, [eventId, guest.email])).toBe("0");
    await page.getByLabel(L.area).fill("Assuntos Regulatórios");
    await page.getByTestId("button-redeem").click();
    await expect(page.getByText("Cortesia Resgatada!")).toBeVisible({ timeout: 30_000 });
    const raw = await scalar<string>(
      `SELECT o.registration_answers::text FROM orders o JOIN users x ON x.id=o.user_id WHERE lower(x.email)=lower($1) AND o.event_id=$2`,
      [guest.email, eventId],
    );
    const answers = Object.fromEntries((JSON.parse(raw!) as { fieldId: string; value: string }[]).map((a) => [a.fieldId, a.value]));
    expect(answers).toEqual({
      "legacy-occupation": "Gerente da Cortesia",
      "legacy-partner-company": "Empresa da Cortesia",
      "legacy-area-of-activity": "Assuntos Regulatórios",
    });
  });

  test("participants Excel: 'Área de atuação' is the last fixed column after 'Status'; no duplicate legacy columns", async ({ page }) => {
    const eventId = prodId("presencialPaid");
    const eventTitle = (await scalar<string>(`SELECT title FROM events WHERE id=$1`, [eventId]))!;
    const buyer = makeUser("legxls");
    await createAccount(buyer);
    const buyerId = await scalar<string>(`SELECT id FROM users WHERE lower(email)=lower($1)`, [buyer.email]);
    await sql(
      `INSERT INTO orders (user_id,event_id,payment_method,amount,status,registration_answers) VALUES ($1,$2,'free','0','paid',$3)`,
      [buyerId, eventId, JSON.stringify([
        { fieldId: "legacy-occupation", label: "Cargo que ocupa", value: "Cargo Planilha" },
        { fieldId: "legacy-partner-company", label: "Empresa que trabalha", value: "Empresa Planilha" },
        { fieldId: "legacy-area-of-activity", label: "Área de atuação", value: "Área Planilha" },
      ])],
    );
    const admin = makeUser("legxlsadmin");
    await createAccount(admin, { admin: true });
    await login(page, admin.email);
    await page.goto("/admin/participants");
    await page.getByRole("combobox").first().click();
    await page.getByRole("option", { name: eventTitle }).click();
    const [dl] = await Promise.all([
      page.waitForEvent("download", { timeout: 30_000 }),
      page.getByRole("button", { name: /Exportar/ }).click(),
    ]);
    const file = path.join(test.info().outputDir, `legacy-${Date.now()}.xlsx`);
    await dl.saveAs(file);
    const wb = XLSX.readFile(file);
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1 });
    const headers = rows[0] as string[];
    expect(headers.indexOf("Área de atuação")).toBe(headers.indexOf("Status") + 1);
    for (const h of ["Cargo que ocupa", "Empresa que trabalha", "Área de atuação"]) {
      expect(headers.filter((x) => x === h || x.startsWith(`${h} (`)), `column ${h}`).toEqual([h]);
    }
    expect(headers.filter((x) => /legacy/i.test(x))).toEqual([]);
    const mine = rows.slice(1).find((r) => (r as unknown[])[headers.indexOf("E-mail")] === buyer.email) as unknown[];
    expect(mine[headers.indexOf("Cargo que ocupa")]).toBe("Cargo Planilha");
    expect(mine[headers.indexOf("Empresa que trabalha")]).toBe("Empresa Planilha");
    expect(mine[headers.indexOf("Área de atuação")]).toBe("Área Planilha");
  });
});

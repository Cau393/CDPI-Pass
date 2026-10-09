import path from "node:path";
import { createRequire } from "node:module";
import { test, expect, expectNoHorizontalScroll } from "../support/fixtures";
import { createEvent, question, scalar, sql } from "../support/db";
import { createAccount, login, makeUser } from "../support/ui";

const XLSX = createRequire(import.meta.url)("xlsx") as typeof import("xlsx");

async function adminLogin(page: import("@playwright/test").Page) {
  const admin = makeUser("admin");
  await createAccount(admin, { admin: true });
  await login(page, admin.email);
  return admin;
}

const formOf = async (eventId: string) =>
  JSON.parse((await scalar<string>(`SELECT registration_form::text FROM events WHERE id=$1`, [eventId]))!) as {
    id: string; label: string; type: string; options: string[]; archived?: boolean;
  }[];

async function save(page: import("@playwright/test").Page) {
  const [resp] = await Promise.all([
    page.waitForResponse((r) => /\/api\/admin\/events\/[^/]+$/.test(r.url()) && r.request().method() === "PATCH"),
    page.getByRole("button", { name: /Salvar/ }).last().click(),
  ]);
  expect(resp.status(), "event PATCH").toBe(200);
}

test.describe("admin: registration form builder", () => {
  test("shows the locked Documento row; adds a text + dropdown question; reorders; archives", async ({ page }) => {
    const ev = await createEvent("onlineFree", { titleSuffix: "builder", isFree: false });
    await adminLogin(page);
    await page.goto(`/admin/events/${ev.id}`);
    await page.getByText("Formulário de inscrição").first().waitFor({ timeout: 20_000 });
    const locked = await page.getByTestId("registration-locked-row").allInnerTexts();
    expect(locked).toHaveLength(1);
    expect(locked[0]).toMatch(/Documento/);

    // add a text and a dropdown question
    await page.getByRole("button", { name: /Adicionar pergunta/ }).click();
    await page.getByLabel("Pergunta 1", { exact: true }).fill("Empresa");
    await page.getByRole("button", { name: /Adicionar pergunta/ }).click();
    await page.getByLabel("Pergunta 2", { exact: true }).fill("Área");
    await page.getByRole("combobox", { name: "Tipo de resposta" }).nth(1).click();
    await page.getByRole("option", { name: "Lista suspensa" }).click();
    await page.getByLabel("Opções (uma por linha)").fill("Clínica\nIndústria");
    await expectNoHorizontalScroll(page, "builder");
    const remove = await page.getByRole("button", { name: "Remover pergunta 1" }).boundingBox();
    expect(remove!.height).toBeGreaterThanOrEqual(44);
    expect(remove!.width).toBeGreaterThanOrEqual(44);
    await save(page);
    let form = await formOf(ev.id);
    expect(form.map((f) => f.label)).toEqual(["Empresa", "Área"]);
    expect(form[1].type).toBe("select");
    expect(form[1].options).toEqual(["Clínica", "Indústria"]);
    const [empresaId, areaId] = form.map((f) => f.id);

    // reorder: move question 1 down
    await page.reload();
    await page.getByText("Formulário de inscrição").first().waitFor({ timeout: 20_000 });
    await page.getByRole("button", { name: "Mover pergunta 1 para baixo" }).click();
    await save(page);
    form = await formOf(ev.id);
    expect(form.filter((f) => !f.archived).map((f) => f.id)).toEqual([areaId, empresaId]);

    // archive: remove question 1 (Área); the server keeps it archived, same id
    await page.reload();
    await page.getByText("Formulário de inscrição").first().waitFor({ timeout: 20_000 });
    await page.getByRole("button", { name: "Remover pergunta 1" }).click();
    await save(page);
    form = await formOf(ev.id);
    expect(form.find((f) => f.id === areaId)?.archived).toBe(true);
    expect(form.find((f) => f.id === empresaId)?.archived).toBeFalsy();
  });
});

test.describe("admin: participants Excel", () => {
  test("columns for the questions; archived question becomes '(removida)' and keeps the answers", async ({ page }) => {
    const cargo = question("q-cargo", "Cargo");
    const turno = question("q-turno", "Turno", { type: "radio", options: ["Manhã", "Tarde"], required: false });
    const ev = await createEvent("presencialFree", { titleSuffix: "excel", registrationForm: [cargo, turno] });
    const buyer = makeUser("xlsbuyer");
    await createAccount(buyer);
    const buyerId = await scalar<string>(`SELECT id FROM users WHERE lower(email)=lower($1)`, [buyer.email]);
    await sql(
      `INSERT INTO orders (user_id,event_id,cpf,payment_method,amount,status,registration_answers)
       VALUES ($1,$2,NULL,'free','0','paid',$3)`,
      [
        buyerId, ev.id,
        JSON.stringify([
          { fieldId: "q-cargo", label: "Cargo", value: "Farmacêutica" },
          { fieldId: "q-turno", label: "Turno", value: "Tarde" },
        ]),
      ],
    );
    await adminLogin(page);

    const exportRows = async () => {
      await page.goto("/admin/participants");
      await page.getByRole("combobox").first().click();
      await page.getByRole("option", { name: ev.title }).click();
      const [dl] = await Promise.all([
        page.waitForEvent("download", { timeout: 20_000 }),
        page.getByRole("button", { name: /Exportar/ }).click(),
      ]);
      const file = path.join(test.info().outputDir, `export-${Date.now()}.xlsx`);
      await dl.saveAs(file);
      const wb = XLSX.readFile(file);
      const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1 });
      return { headers: rows[0] as string[], row: rows[1] as unknown[] };
    };

    let { headers, row } = await exportRows();
    for (const h of ["CPF / Passaporte", "Estrangeiro", "Endereço", "Cargo", "Turno"]) {
      expect(headers, `missing header ${h}`).toContain(h);
    }
    expect(row[headers.indexOf("Cargo")]).toBe("Farmacêutica");
    expect(row[headers.indexOf("Turno")]).toBe("Tarde");
    expect(row[headers.indexOf("Estrangeiro")]).toBe("Não");

    await page.goto(`/admin/events/${ev.id}`);
    await page.getByText("Formulário de inscrição").first().waitFor({ timeout: 20_000 });
    await page.getByRole("button", { name: "Remover pergunta 1" }).click();
    await save(page);
    ({ headers, row } = await exportRows());
    expect(headers).toContain("Cargo (removida)");
    expect(row[headers.indexOf("Cargo (removida)")]).toBe("Farmacêutica");
  });
});

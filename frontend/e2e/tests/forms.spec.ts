// Port of the reference p3-e2e.mjs (steps 2-7, 12) and p4-signup-e2e.mjs (steps 3-7).
import { test, expect, expectNoHorizontalScroll } from "../support/fixtures";
import { createEvent, fmtCpf, question, scalar } from "../support/db";
import { clickEventCta, createAccount, fillSignup, login, makeUser, orderCount, submitAndVerify, waitForRegistrationDialog } from "../support/ui";
import { ADDRESS, completeRegistrationDialog, newPassport, paymentMethods, uniqueCpf } from "../support/flows";
import { FOREIGN_PAID_CHECKOUT_ENABLED } from "../../shared/foreignCheckout";

const cargo = question("q-cargo", "Cargo");
const turno = question("q-turno", "Turno", { type: "radio", options: ["Manhã", "Tarde"], required: false });
const origem = question("q-origem", "Como soube do evento?");

test.describe("event registration forms", () => {
  test("in-person: dialog shows CPF, address and the event questions; fits the screen; 44px targets", async ({ page }) => {
    const ev = await createEvent("presencialFree", { registrationForm: [cargo, turno] });
    const u = makeUser("form");
    await createAccount(u);
    await login(page, u.email);
    await clickEventCta(page, ev.id);
    await waitForRegistrationDialog(page);
    await expect(page.getByTestId("input-cpf")).toBeVisible();
    await expect(page.getByLabel("Endereço")).toBeVisible();
    await expect(page.getByLabel(/Cargo/)).toBeVisible();
    await expect(page.getByText("Turno")).toBeVisible();
    await expectNoHorizontalScroll(page, "registration dialog with questions");
    const confirm = await page.getByTestId("button-confirm-registration").boundingBox();
    const cpfBox = await page.getByTestId("input-cpf").boundingBox();
    expect(confirm!.height, "confirm button height").toBeGreaterThanOrEqual(44);
    expect(cpfBox!.height, "cpf input height").toBeGreaterThanOrEqual(44);

    // Empty submit: inline errors, nothing created.
    await page.getByTestId("button-confirm-registration").click();
    await expect.poll(() => page.locator(".text-destructive, .text-red-600").count()).toBeGreaterThanOrEqual(2);
    expect(await orderCount(u.email, ev.id)).toBe("0");

    // Filled: CPF + address on the account, answers on the order.
    const cpf = uniqueCpf();
    await page.getByTestId("input-cpf").pressSequentially(cpf);
    await page.getByLabel("Endereço").fill("Rua das Flores, 123 - Centro, Brasília - DF");
    await page.getByLabel(/Cargo/).fill("Farmacêutica");
    await page.getByRole("radio", { name: "Tarde" }).click();
    await page.getByTestId("button-confirm-registration").click();
    await expect.poll(() => orderCount(u.email, ev.id, "paid"), { timeout: 15_000 }).toBe("1");
    const userRow = await scalar<string>(`SELECT cpf || ' | ' || address FROM users WHERE lower(email)=lower($1)`, [u.email]);
    expect(userRow).toBe(`${fmtCpf(cpf)} | Rua das Flores, 123 - Centro, Brasília - DF`);
    const answers = await scalar<string>(
      `SELECT o.registration_answers::text FROM orders o JOIN users x ON x.id=o.user_id WHERE lower(x.email)=lower($1) AND o.event_id=$2`,
      [u.email, ev.id],
    );
    expect(answers).toContain('"Farmacêutica"');
    expect(answers).toContain('"Tarde"');
  });

  test("foreigner on a paid online event: passport only (no address), card-only hint, then card-only checkout", async ({ page }) => {
    test.skip(!FOREIGN_PAID_CHECKOUT_ENABLED, "Asaas has not enabled foreign payers yet: paid checkout refuses foreigners");
    const ev = await createEvent("onlineFree", { titleSuffix: "pago", isFree: false });
    const u = makeUser("onpaidpy", { phone: "595981123456" });
    await createAccount(u);
    await login(page, u.email);
    await clickEventCta(page, ev.id);
    await waitForRegistrationDialog(page);
    await expect(page.getByLabel("Endereço")).toHaveCount(0);
    await expect(page.getByText(/Foreign visitors pay by/)).toBeVisible();
    await expectNoHorizontalScroll(page, "foreigner dialog");
    const passport = newPassport("PY");
    await page.getByTestId("checkbox-foreigner").click();
    await page.getByTestId("input-foreign-document").fill(passport);
    await page.getByTestId("button-confirm-registration").click();
    expect(await paymentMethods(page)).toEqual(["Cartão"]);
    expect(await scalar<string>(`SELECT is_foreigner || ' ' || foreign_document || ' ' || coalesce(cpf,'-') FROM users WHERE lower(email)=lower($1)`, [u.email])).toBe(`true ${passport} -`);
  });

  test("new 4-field account: online free needs nothing; in-person asks CPF + address + question once; profile keeps the CPF read-only", async ({ page }) => {
    const free = await createEvent("onlineFree");
    const pres = await createEvent("presencialFree", { registrationForm: [question("q-cargo2", "Qual é o seu cargo?")] });
    const u = makeUser("p4");
    await page.goto(`/register?next=${encodeURIComponent(`/event/${pres.id}`)}`);
    await fillSignup(page, u);
    await submitAndVerify(page, u.email);
    await page.waitForURL(new RegExp(`/event/${pres.id}`), { timeout: 20_000 });

    await clickEventCta(page, free.id);
    await expect.poll(() => orderCount(u.email, free.id, "paid"), { timeout: 15_000 }).toBe("1");
    await expect(page.getByText("Complete sua inscrição")).toHaveCount(0);

    await clickEventCta(page, pres.id);
    const cpf = uniqueCpf();
    await completeRegistrationDialog(page, { cpf, address: ADDRESS, answers: { "Qual é o seu cargo": "Farmacêutica" } });
    await expect.poll(() => orderCount(u.email, pres.id, "paid"), { timeout: 15_000 }).toBe("1");
    expect(await scalar<string>(`SELECT o.cpf || ' ' || o.registration_answers::text FROM orders o JOIN users x ON x.id=o.user_id WHERE lower(x.email)=lower($1) AND o.event_id=$2`, [u.email, pres.id])).toContain("Farmacêutica");

    await page.goto("/profile");
    await page.getByTestId("tab-profile").click();
    const shownCpf = await page.getByTestId("input-profile-cpf").inputValue();
    expect(shownCpf).toBe(fmtCpf(cpf));
    expect(await page.getByTestId("input-profile-cpf").isDisabled() || (await page.getByTestId("input-profile-cpf").getAttribute("readonly")) !== null).toBe(true);
    expect(await page.getByTestId("input-profile-occupation").inputValue()).toBe("");
    await expectNoHorizontalScroll(page, "profile");
  });
});

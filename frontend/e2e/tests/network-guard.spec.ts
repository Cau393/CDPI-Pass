import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect } from "../support/fixtures";
import { cfg, createEvent, scalar, serverLogPath } from "../support/db";
import { clickEventCta, createAccount, login, makeUser } from "../support/ui";
import { ADDRESS, completeRegistrationDialog, paymentMethods, uniqueCpf } from "../support/flows";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND = path.resolve(HERE, "../..");

test.describe("network guard", () => {
  test("the harness rejects fetch / axios / http(s) to non-local hosts and still reaches localhost", () => {
    const out = execFileSync(
      process.execPath,
      ["--import", path.join(FRONTEND, "e2e/harness/register.mjs"), path.join(FRONTEND, "e2e/harness/netcheck.mjs"), cfg.asaasUrl],
      { cwd: FRONTEND, env: { PATH: process.env.PATH, APP_ROOT: FRONTEND }, encoding: "utf8", timeout: 30_000 },
    );
    const results = Object.fromEntries(
      out.split("\n").filter((l) => l.startsWith("{")).map((l) => JSON.parse(l)).map((r) => [r.name, r]),
    );
    for (const name of ["fetchRemote", "axiosRemote", "axiosMake", "httpsRemote", "httpRemote"]) {
      expect(results[name], name).toMatchObject({ ok: false });
      expect(results[name].error, name).toMatch(/e2e guard/);
    }
    expect(results.fetchLocal).toMatchObject({ ok: true, status: 200 });
    expect(results.axiosLocal).toMatchObject({ ok: true, status: 200 });
  });

  test("a paid finalize in the running app blocks the Make.com call instead of sending it", async ({ page, request }) => {
    const ev = await createEvent("presencialPaid");
    const u = makeUser("netpaid");
    await createAccount(u);
    await login(page, u.email);
    await clickEventCta(page, ev.id);
    await completeRegistrationDialog(page, { cpf: uniqueCpf(), address: ADDRESS });
    await paymentMethods(page);
    await page.getByRole("dialog").getByRole("tab", { name: "PIX" }).click();
    await page.getByRole("dialog").getByTestId("button-confirm-payment").click();
    await expect(page.getByRole("dialog").getByText("PIX Gerado com Sucesso!")).toBeVisible();
    const orderId = await scalar<string>(
      `SELECT o.id FROM orders o JOIN users x ON x.id=o.user_id WHERE lower(x.email)=lower($1) AND o.event_id=$2`,
      [u.email, ev.id],
    );

    // The same call Asaas makes when the PIX is paid.
    const res = await request.post("/api/webhooks/asaas", {
      headers: { "asaas-access-token": "e2e-dummy" },
      data: { event: "PAYMENT_CONFIRMED", payment: { id: "pay_fake_net", externalReference: orderId, billingType: "PIX", value: 155 } },
    });
    expect(res.status()).toBe(200);
    await expect
      .poll(() => scalar(`SELECT status FROM orders WHERE id=$1`, [orderId]), { timeout: 20_000 })
      .toBe("paid");

    expect(existsSync(serverLogPath()), "server log written by harness/serve.ts").toBe(true);
    await expect
      .poll(() => readFileSync(serverLogPath(), "utf8").includes("[e2e-guard] blocked outbound request to hook.us2.make.com"), { timeout: 15_000 })
      .toBe(true);
  });
});

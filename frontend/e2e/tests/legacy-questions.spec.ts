import { test } from "../support/fixtures";

/**
 * Pending C1: three "legacy" required text questions (`legacy-occupation`,
 * `legacy-partner-company`, `legacy-area-of-activity`) with profile prefill.
 * Enable (drop `.skip`) after C1 merges and extend the event fixture's
 * `registrationForm` (e2e/fixtures/prod-events.json) with the three questions.
 */
test.describe.skip("legacy questions (pending C1)", () => {
  test("old full-profile account sees the 3 questions prefilled and is never asked for document/address again", async () => {
    // Steps once enabled: createAccount with occupation/partner_company/area_of_activity + cpf + address set in SQL,
    // login, subscribe to a presencial event whose form has the 3 legacy questions; expect the three inputs prefilled
    // from the profile, no CPF/address fields, and the order's registration_answers to hold the three values.
  });

  test("a 4-field account must answer the 3 legacy questions", async () => {
    // Steps once enabled: createAccount (4 fields only), open the same event; expect the three questions empty and
    // required; empty submit shows inline errors; filled submit stores the answers.
  });
});

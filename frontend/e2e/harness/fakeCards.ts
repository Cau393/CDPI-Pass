/**
 * Test card numbers the fake Asaas understands (all Luhn-valid).
 * `declined` is the Asaas sandbox decline card (docs.asaas.com), so the sandbox
 * rehearsal can reuse it. The sandbox approves any other Luhn-valid number.
 */
export const FAKE_CARDS = {
  approved: "4111111111111111",
  risk: "4000000000009995",
  declined: "5184019740373151",
} as const;

import { describe, it, expect } from "vitest";
import { npsCdpiApoiandoResponses, npsCdpiEventResponses } from "@shared/schema";

describe("NPS table shapes (drift guard)", () => {
  it("npsCdpiEventResponses model is defined", () => {
    expect(npsCdpiEventResponses).toBeDefined();
    expect(npsCdpiEventResponses.userId).toBeDefined();
    expect(npsCdpiEventResponses.workshopFeeling).toBeDefined();
    expect(npsCdpiEventResponses.privacyConsent).toBeDefined();
  });

  it("npsCdpiApoiandoResponses model is defined", () => {
    expect(npsCdpiApoiandoResponses).toBeDefined();
    expect(npsCdpiApoiandoResponses.eventId).toBeDefined();
    expect(npsCdpiApoiandoResponses.overallScore).toBeDefined();
    expect(npsCdpiApoiandoResponses.organizationOtherText).toBeDefined();
  });
});

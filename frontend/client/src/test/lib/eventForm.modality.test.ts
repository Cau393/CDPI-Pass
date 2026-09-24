import { describe, it, expect } from "vitest";
import { editEventSchema } from "../../lib/eventForm";

const base = {
  title: "Evento",
  description: "<p>desc</p>",
  date: "2026-09-03T09:00",
  location: "Local",
  price: "100,00",
  npsType: "cdpi_event" as const,
  isFree: false,
  modality: "presencial" as const,
  meetingUrl: "",
  whatsappGroupUrl: "",
  confirmationEmailHtml: "",
};

describe("editEventSchema — modality", () => {
  it("accepts a presencial event without a meeting URL", () => {
    const result = editEventSchema.safeParse(base);
    expect(result.success).toBe(true);
  });

  it("rejects an online event without a meeting URL", () => {
    const result = editEventSchema.safeParse({
      ...base,
      modality: "online",
      meetingUrl: "",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes("meetingUrl"))).toBe(
        true,
      );
    }
  });

  it("rejects an online event with a non-http URL", () => {
    const result = editEventSchema.safeParse({
      ...base,
      modality: "online",
      meetingUrl: "javascript:alert(1)",
    });
    expect(result.success).toBe(false);
  });

  it("accepts an online event with an https meeting URL", () => {
    const result = editEventSchema.safeParse({
      ...base,
      modality: "online",
      meetingUrl: "https://zoom.us/j/123",
    });
    expect(result.success).toBe(true);
  });

  it("accepts an online event without a WhatsApp URL", () => {
    const result = editEventSchema.safeParse({
      ...base,
      modality: "online",
      meetingUrl: "https://zoom.us/j/123",
      whatsappGroupUrl: "",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an online event with an invalid WhatsApp URL", () => {
    const result = editEventSchema.safeParse({
      ...base,
      modality: "online",
      meetingUrl: "https://zoom.us/j/123",
      whatsappGroupUrl: "not-a-url",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((i) => i.path.includes("whatsappGroupUrl")),
      ).toBe(true);
    }
  });

  it("accepts a blank courtesy limit and a positive integer", () => {
    expect(editEventSchema.safeParse({ ...base, courtesyLimit: "" }).success).toBe(true);
    expect(editEventSchema.safeParse({ ...base, courtesyLimit: "3" }).success).toBe(true);
  });

  it("rejects zero and non-integers for the courtesy limit", () => {
    expect(editEventSchema.safeParse({ ...base, courtesyLimit: "0" }).success).toBe(false);
    expect(editEventSchema.safeParse({ ...base, courtesyLimit: "1,5" }).success).toBe(false);
  });

  it("accepts an online event with a WhatsApp group URL", () => {
    const result = editEventSchema.safeParse({
      ...base,
      modality: "online",
      meetingUrl: "https://zoom.us/j/123",
      whatsappGroupUrl: "https://chat.whatsapp.com/AbC",
    });
    expect(result.success).toBe(true);
  });
});

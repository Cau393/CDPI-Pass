import { describe, it, expect } from "vitest";
import {
  REGISTRATION_FIELD_LABEL_INVALID,
  REGISTRATION_FIELD_OPTIONS_INVALID,
  type RegistrationField,
} from "@shared/eventRegistrationForm";
import {
  editEventSchema,
  registrationFormPayload,
  toRegistrationFormRows,
  type RegistrationFormRow,
} from "../../lib/eventForm";

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

const savedSelect: RegistrationField = {
  id: "q-area",
  type: "select",
  label: "Área",
  options: ["Pesquisa", "Indústria"],
  required: true,
  archived: false,
};

function row(overrides: Partial<RegistrationFormRow> = {}): RegistrationFormRow {
  return {
    fieldId: null,
    type: "text",
    label: "Cargo",
    optionsText: "",
    required: false,
    ...overrides,
  };
}

function issuePaths(rows: RegistrationFormRow[]): Record<string, string> {
  const result = editEventSchema.safeParse({ ...base, registrationForm: rows });
  if (result.success) return {};
  return Object.fromEntries(result.error.issues.map((i) => [i.path.join("."), i.message]));
}

describe("toRegistrationFormRows", () => {
  it("prefills the active questions only, one option per line", () => {
    const archived = { ...savedSelect, id: "q-old", archived: true };
    expect(toRegistrationFormRows([savedSelect, archived])).toEqual([
      {
        fieldId: "q-area",
        type: "select",
        label: "Área",
        optionsText: "Pesquisa\nIndústria",
        required: true,
      },
    ]);
  });
});

describe("registrationFormPayload", () => {
  it("sends a new question without an id and a saved one with its id, never 'archived'", () => {
    const payload = registrationFormPayload([
      row({ fieldId: "q-area", type: "select", label: " Área ", optionsText: "Pesquisa\n\n Indústria \n" }),
      row({ label: "Cargo", required: true }),
    ]);
    expect(JSON.parse(payload)).toEqual([
      { id: "q-area", type: "select", label: "Área", options: ["Pesquisa", "Indústria"], required: false },
      { type: "text", label: "Cargo", options: [], required: true },
    ]);
  });
});

describe("editEventSchema — registrationForm", () => {
  it("accepts an event without questions", () => {
    expect(issuePaths([])).toEqual({});
  });

  it("rejects a question without text, on the label", () => {
    expect(issuePaths([row({ label: "  " })])).toEqual({
      "registrationForm.0.label": REGISTRATION_FIELD_LABEL_INVALID,
    });
  });

  it("rejects a dropdown with a single option, on the options", () => {
    expect(issuePaths([row({ type: "radio", optionsText: "Sim" })])).toEqual({
      "registrationForm.0.optionsText": REGISTRATION_FIELD_OPTIONS_INVALID,
    });
  });

  it("rejects repeated options", () => {
    expect(issuePaths([row({ type: "select", optionsText: "Sim\nsim" })])).toEqual({
      "registrationForm.0.optionsText": REGISTRATION_FIELD_OPTIONS_INVALID,
    });
  });
});

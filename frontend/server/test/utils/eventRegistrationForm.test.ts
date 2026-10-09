import { describe, it, expect } from "vitest";
import {
  REGISTRATION_ANSWER_REQUIRED,
  REGISTRATION_ANSWER_INVALID_OPTION,
  REGISTRATION_ANSWER_TOO_LONG,
  REGISTRATION_ANSWER_UNKNOWN_FIELD,
  REGISTRATION_FORM_INVALID,
  REGISTRATION_FORM_TOO_MANY,
  REGISTRATION_FIELD_LABEL_INVALID,
  REGISTRATION_FIELD_OPTIONS_INVALID,
  REGISTRATION_FIELD_TYPE_CHANGED,
  parseRegistrationFormField,
  participantAnswers,
  registrationFormMultipartValue,
  resolveRegistrationAnswers,
  systemFieldsFor,
  withoutBuyerAnswers,
  type RegistrationField,
} from "@shared/eventRegistrationForm";

const cargo: RegistrationField = {
  id: "f-cargo",
  type: "text",
  label: "Cargo",
  options: [],
  required: true,
  archived: false,
};
const area: RegistrationField = {
  id: "f-area",
  type: "select",
  label: "Área de interesse",
  options: ["Farmácia", "Regulatório"],
  required: false,
  archived: false,
};
const turno: RegistrationField = {
  id: "f-turno",
  type: "radio",
  label: "Turno",
  options: ["Manhã", "Tarde"],
  required: true,
  archived: false,
};

let counter = 0;
const newId = () => `new-${++counter}`;

function parse(fields: unknown, previous: RegistrationField[] = []) {
  return parseRegistrationFormField(JSON.stringify(fields), previous, newId);
}

describe("parseRegistrationFormField", () => {
  it("stores an empty form when the field is missing, blank or []", () => {
    expect(parseRegistrationFormField(undefined, [], newId)).toEqual({ ok: true, value: [] });
    expect(parseRegistrationFormField("", [], newId)).toEqual({ ok: true, value: [] });
    expect(parseRegistrationFormField("[]", [], newId)).toEqual({ ok: true, value: [] });
  });

  it("archives every saved question when the form is cleared with null, [] or blank", () => {
    for (const raw of [null, "[]", ""]) {
      expect(parseRegistrationFormField(raw, [cargo], newId)).toEqual({ ok: true, value: [{ ...cargo, archived: true }] });
    }
  });

  it("rejects a body that is not a JSON array", () => {
    expect(parseRegistrationFormField("{", [], newId)).toEqual({ ok: false, error: REGISTRATION_FORM_INVALID });
    expect(parseRegistrationFormField('{"a":1}', [], newId)).toEqual({ ok: false, error: REGISTRATION_FORM_INVALID });
    expect(parseRegistrationFormField(42, [], newId)).toEqual({ ok: false, error: REGISTRATION_FORM_INVALID });
  });

  it("gives new fields a server id, trims labels and options, and ignores a client-sent id it does not know", () => {
    counter = 0;
    const parsed = parse([
      { type: "text", label: "  Cargo  ", required: true },
      { id: "client-made", type: "radio", label: "Turno", options: [" Manhã ", "Tarde"], required: false },
    ]);

    expect(parsed).toEqual({
      ok: true,
      value: [
        { id: "new-1", type: "text", label: "Cargo", options: [], required: true, archived: false },
        { id: "new-2", type: "radio", label: "Turno", options: ["Manhã", "Tarde"], required: false, archived: false },
      ],
    });
  });

  it("keeps the id of an existing field when it is edited", () => {
    const parsed = parse([{ ...cargo, label: "Cargo atual", required: false }], [cargo]);

    expect(parsed).toEqual({
      ok: true,
      value: [{ ...cargo, label: "Cargo atual", required: false }],
    });
  });

  it("archives a saved field that the admin removed, after the active ones", () => {
    const parsed = parse([turno], [cargo, turno]);

    expect(parsed).toEqual({ ok: true, value: [turno, { ...cargo, archived: true }] });
  });

  it("restores an archived field when it is sent again", () => {
    const parsed = parse([cargo], [{ ...cargo, archived: true }]);

    expect(parsed).toEqual({ ok: true, value: [cargo] });
  });

  it("rejects a type change on a saved field", () => {
    expect(parse([{ ...cargo, type: "select", options: ["A", "B"] }], [cargo])).toEqual({
      ok: false,
      error: REGISTRATION_FIELD_TYPE_CHANGED,
    });
  });

  it("rejects more than 20 active fields", () => {
    const fields = Array.from({ length: 21 }, (_, i) => ({ type: "text", label: `Pergunta ${i}` }));

    expect(parse(fields)).toEqual({ ok: false, error: REGISTRATION_FORM_TOO_MANY });
  });

  it("rejects a blank label or one over 120 characters", () => {
    expect(parse([{ type: "text", label: "   " }])).toEqual({ ok: false, error: REGISTRATION_FIELD_LABEL_INVALID });
    expect(parse([{ type: "text", label: "a".repeat(121) }])).toEqual({
      ok: false,
      error: REGISTRATION_FIELD_LABEL_INVALID,
    });
  });

  it("rejects an unknown type", () => {
    expect(parse([{ type: "checkbox", label: "Pergunta" }])).toEqual({ ok: false, error: REGISTRATION_FORM_INVALID });
  });

  it("needs 2 to 50 unique options of at most 80 characters on select and radio", () => {
    const tooFew = parse([{ type: "select", label: "Área", options: ["Única"] }]);
    const duplicate = parse([{ type: "radio", label: "Turno", options: ["Manhã", "manhã"] }]);
    const blank = parse([{ type: "select", label: "Área", options: ["A", " "] }]);
    const tooLong = parse([{ type: "select", label: "Área", options: ["A", "b".repeat(81)] }]);
    const tooMany = parse([
      { type: "select", label: "Área", options: Array.from({ length: 51 }, (_, i) => `Opção ${i}`) },
    ]);

    for (const result of [tooFew, duplicate, blank, tooLong, tooMany]) {
      expect(result).toEqual({ ok: false, error: REGISTRATION_FIELD_OPTIONS_INVALID });
    }
  });

  it("drops options sent on a text field", () => {
    const parsed = parse([{ ...cargo, options: ["ignored"] }], [cargo]);

    expect(parsed).toEqual({ ok: true, value: [cargo] });
  });

  it("round-trips through the multipart value the admin form sends", () => {
    expect(parseRegistrationFormField(registrationFormMultipartValue([cargo, area]), [cargo, area], newId)).toEqual({
      ok: true,
      value: [cargo, area],
    });
  });
});

describe("systemFieldsFor", () => {
  it("asks document and address on any in-person event", () => {
    expect(systemFieldsFor({ modality: "presencial", isFree: true })).toEqual(["document", "address"]);
    expect(systemFieldsFor({ modality: "presencial", isFree: false })).toEqual(["document", "address"]);
  });

  it("asks only the document on a paid online event (Asaas needs it)", () => {
    expect(systemFieldsFor({ modality: "online", isFree: false })).toEqual(["document"]);
  });

  it("asks nothing on a free online event", () => {
    expect(systemFieldsFor({ modality: "online", isFree: true })).toEqual([]);
  });
});

describe("resolveRegistrationAnswers", () => {
  const fields = [cargo, area, turno, { ...turno, id: "f-old", label: "Antiga", archived: true }];

  it("accepts a body with no answers when the form is empty", () => {
    expect(resolveRegistrationAnswers({ fields: [], body: {} })).toEqual({ ok: true, answers: [] });
  });

  it("returns a snapshot in form order with the label at answer time, skipping a blank optional answer", () => {
    const resolved = resolveRegistrationAnswers({
      fields,
      body: { answers: { "f-turno": " Tarde ", "f-cargo": " Farmacêutica ", "f-area": "" } },
    });

    expect(resolved).toEqual({
      ok: true,
      answers: [
        { fieldId: "f-cargo", label: "Cargo", value: "Farmacêutica" },
        { fieldId: "f-turno", label: "Turno", value: "Tarde" },
      ],
    });
  });

  it("rejects a missing or blank required answer, naming the question", () => {
    expect(resolveRegistrationAnswers({ fields, body: { answers: { "f-turno": "Tarde" } } })).toEqual({
      ok: false,
      message: `${REGISTRATION_ANSWER_REQUIRED}: Cargo`,
    });
    expect(resolveRegistrationAnswers({ fields, body: {} })).toEqual({
      ok: false,
      message: `${REGISTRATION_ANSWER_REQUIRED}: Cargo`,
    });
  });

  it("rejects an option that is not on the list", () => {
    const resolved = resolveRegistrationAnswers({
      fields,
      body: { answers: { "f-cargo": "Gerente", "f-turno": "Noite" } },
    });

    expect(resolved).toEqual({ ok: false, message: `${REGISTRATION_ANSWER_INVALID_OPTION}: Turno` });
  });

  it("rejects a text answer over 500 characters", () => {
    const resolved = resolveRegistrationAnswers({
      fields,
      body: { answers: { "f-cargo": "x".repeat(501), "f-turno": "Tarde" } },
    });

    expect(resolved).toEqual({ ok: false, message: `${REGISTRATION_ANSWER_TOO_LONG}: Cargo` });
  });

  it("rejects an unknown or archived field id", () => {
    const base = { "f-cargo": "Gerente", "f-turno": "Tarde" };

    expect(resolveRegistrationAnswers({ fields, body: { answers: { ...base, nope: "x" } } })).toEqual({
      ok: false,
      message: REGISTRATION_ANSWER_UNKNOWN_FIELD,
    });
    expect(resolveRegistrationAnswers({ fields, body: { answers: { ...base, "f-old": "Manhã" } } })).toEqual({
      ok: false,
      message: REGISTRATION_ANSWER_UNKNOWN_FIELD,
    });
  });

  it("rejects answers that are not an object of strings", () => {
    expect(resolveRegistrationAnswers({ fields: [], body: { answers: ["x"] } })).toEqual({
      ok: false,
      message: REGISTRATION_ANSWER_UNKNOWN_FIELD,
    });
    expect(resolveRegistrationAnswers({ fields: [cargo], body: { answers: { "f-cargo": 3 } } })).toEqual({
      ok: false,
      message: `${REGISTRATION_ANSWER_REQUIRED}: Cargo`,
    });
  });
});

describe("withoutBuyerAnswers", () => {
  it("removes the answers and the legacy interest area from buyer payloads", () => {
    expect(
      withoutBuyerAnswers({ id: "o1", status: "paid", interestArea: "Farmácia", registrationAnswers: [] }),
    ).toEqual({ id: "o1", status: "paid" });
  });
});

describe("participantAnswers", () => {
  it("returns the stored answers when the order has them", () => {
    const answers = [{ fieldId: "f-cargo", label: "Cargo", value: "Gerente" }];

    expect(participantAnswers(answers, "Farmácia")).toEqual(answers);
  });

  it("turns a pre-ADR-016 interest area into the backfilled question's answer", () => {
    expect(participantAnswers([], "Farmácia")).toEqual([
      { fieldId: "interest-area", label: "Área de interesse", value: "Farmácia" },
    ]);
  });

  it("returns no answers when the order has neither", () => {
    expect(participantAnswers([], null)).toEqual([]);
    expect(participantAnswers(null, null)).toEqual([]);
  });
});

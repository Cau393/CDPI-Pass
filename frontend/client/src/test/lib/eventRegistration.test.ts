import { describe, it, expect } from "vitest";
import type { RegistrationField } from "@shared/eventRegistrationForm";
import {
  identityRequiredMissing,
  legacyPrefill,
  staleRegistrationError,
  needsRegistrationDialog,
  registrationAnswerErrors,
  registrationAnswersPayload,
  registrationQuestionsFor,
} from "../../lib/eventRegistration";

const cargo: RegistrationField = {
  id: "q-cargo",
  type: "text",
  label: "Cargo",
  options: [],
  required: true,
  archived: false,
};
const area: RegistrationField = {
  id: "q-area",
  type: "radio",
  label: "Área",
  options: ["Pesquisa", "Indústria"],
  required: false,
  archived: false,
};
const removed: RegistrationField = { ...cargo, id: "q-old", label: "Antiga", archived: true };

const brazilian = { cpf: "123.456.789-09", foreignDocument: null, address: "Rua A, 100, São Paulo" };
const foreignVisitor = {
  cpf: null,
  foreignDocument: "AB123456",
  address: "Av. Mariscal López 1234, Asunción",
};
const newAccount = { cpf: null, foreignDocument: null, address: null };

const paidInPerson = { modality: "presencial" as const, isFree: false, registrationForm: [] };
const paidOnline = { modality: "online" as const, isFree: false, registrationForm: [] };
const freeOnline = { modality: "online" as const, isFree: true, registrationForm: [] };

describe("registrationQuestionsFor", () => {
  it("asks a new account for document and address on an in-person event", () => {
    expect(registrationQuestionsFor(paidInPerson, newAccount)).toEqual({
      document: true,
      address: true,
      fields: [],
    });
  });

  it("asks only the document on a paid online event", () => {
    expect(registrationQuestionsFor(paidOnline, newAccount)).toMatchObject({
      document: true,
      address: false,
    });
  });

  it("never re-asks a foreign visitor who already has a passport and an address", () => {
    expect(registrationQuestionsFor(paidInPerson, foreignVisitor)).toMatchObject({
      document: false,
      address: false,
    });
  });

  it("treats a blank address as missing", () => {
    expect(
      registrationQuestionsFor(paidInPerson, { ...brazilian, address: "   " }).address,
    ).toBe(true);
  });

  it("asks what the server reported missing even if the cached account has it", () => {
    expect(registrationQuestionsFor(paidInPerson, brazilian, ["address"])).toMatchObject({
      document: false,
      address: true,
    });
  });

  it("lists only the active custom questions", () => {
    expect(
      registrationQuestionsFor(
        { ...freeOnline, registrationForm: [cargo, removed, area] },
        brazilian,
      ).fields,
    ).toEqual([cargo, area]);
  });
});

describe("needsRegistrationDialog", () => {
  it("is false for a free online event without questions", () => {
    expect(needsRegistrationDialog(freeOnline, newAccount)).toBe(false);
  });

  it("is false when the only question is archived", () => {
    expect(needsRegistrationDialog({ ...freeOnline, registrationForm: [removed] }, brazilian)).toBe(
      false,
    );
  });

  it("is true for a paid online event and an account without a document", () => {
    expect(needsRegistrationDialog(paidOnline, newAccount)).toBe(true);
  });
});

describe("identityRequiredMissing", () => {
  it("reads the missing list from the 400 identity_required body", () => {
    const err = new Error(
      '400: {"code":"identity_required","missing":["document","address"],"message":"Complete seus dados"}',
    );
    expect(identityRequiredMissing(err)).toEqual(["document", "address"]);
  });

  it("ignores other 400 answers", () => {
    const err = new Error('400: {"message":"Responda a pergunta obrigatória: Cargo"}');
    expect(identityRequiredMissing(err)).toBeNull();
  });
});

describe("staleRegistrationError", () => {
  it("flags identity_required as an identity-stale error", () => {
    const err = new Error('400: {"code":"identity_required","missing":["document"],"message":"x"}');
    expect(staleRegistrationError(err)).toBe("identity");
  });

  it.each([
    "Resposta para uma pergunta que não existe neste evento.",
    "Responda a pergunta obrigatória: Cargo",
    "Escolha uma das opções da pergunta: Turno",
  ])("flags the form-answer 400 %s as a form-stale error", (message) => {
    expect(staleRegistrationError(new Error(`400: ${JSON.stringify({ message })}`))).toBe("form");
  });

  it("flags the 409 reload message an old bundle gets as a form-stale error", () => {
    const err = new Error('409: {"message":"Atualize a página para concluir o cadastro"}');
    expect(staleRegistrationError(err)).toBe("form");
  });

  it("ignores unrelated errors and non-400 statuses", () => {
    expect(staleRegistrationError(new Error('400: {"message":"Evento esgotado"}'))).toBeNull();
    expect(staleRegistrationError(new Error('500: {"message":"Responda a pergunta obrigatória: A"}'))).toBeNull();
    expect(staleRegistrationError("nope")).toBeNull();
  });
});

describe("registrationAnswerErrors", () => {
  it("flags a blank required question with the shared message", () => {
    expect(registrationAnswerErrors([cargo, area], { "q-cargo": "  " })).toEqual({
      "q-cargo": "Responda a pergunta obrigatória: Cargo",
    });
  });

  it("accepts a blank optional question", () => {
    expect(registrationAnswerErrors([cargo, area], { "q-cargo": "Farmacêutica" })).toEqual({});
  });
});

describe("registrationAnswersPayload", () => {
  it("sends trimmed answers for active questions and omits blank ones", () => {
    expect(
      registrationAnswersPayload([cargo, area, removed], {
        "q-cargo": "  Farmacêutica ",
        "q-area": "",
        "q-old": "stale",
      }),
    ).toEqual({ "q-cargo": "Farmacêutica" });
  });
});

describe("legacyPrefill", () => {
  const legacy = (id: string, archived = false): RegistrationField => ({ ...cargo, id, archived });

  it("returns the profile's real values for the active legacy questions only", () => {
    const profile = { occupation: "Médica", partnerCompany: "Nao aplicavel", areaOfActivity: "Pesquisa" };
    expect(
      legacyPrefill(
        [legacy("legacy-occupation"), legacy("legacy-partner-company"), legacy("legacy-area-of-activity", true), cargo],
        profile,
      ),
    ).toEqual({ "legacy-occupation": "Médica" });
  });

  it("is empty without an account", () => {
    expect(legacyPrefill([legacy("legacy-occupation")], undefined)).toEqual({});
  });
});

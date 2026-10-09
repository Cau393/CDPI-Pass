import { describe, it, expect } from "vitest";
import { identityRequiredBody, missingIdentityFields } from "../../utils/inscriptionIdentity";

const inPerson = { modality: "presencial", isFree: true };
const paidOnline = { modality: "online", isFree: false };
const freeOnline = { modality: "online", isFree: true };

const bareBrazilian = { isForeigner: false, cpf: null, foreignDocument: null, address: null };
const fullBrazilian = { isForeigner: false, cpf: "529.982.247-25", foreignDocument: null, address: "Rua das Flores 123, São Paulo" };
const fullForeigner = { isForeigner: true, cpf: null, foreignDocument: "PY1234567", address: "Av. España 1000, Asunción" };

describe("missingIdentityFields", () => {
  it("asks nothing on a free online event, even from a bare account", () => {
    expect(missingIdentityFields(freeOnline, bareBrazilian)).toEqual([]);
  });

  it("asks document and address on an in-person event from a bare account", () => {
    expect(missingIdentityFields(inPerson, bareBrazilian)).toEqual(["document", "address"]);
  });

  it("asks only the document on a paid online event", () => {
    expect(missingIdentityFields(paidOnline, bareBrazilian)).toEqual(["document"]);
  });

  it("never re-asks a full Brazilian or foreign profile", () => {
    expect(missingIdentityFields(inPerson, fullBrazilian)).toEqual([]);
    expect(missingIdentityFields(inPerson, fullForeigner)).toEqual([]);
  });

  it("treats a foreign account's passport as its document and a blank address as missing", () => {
    expect(missingIdentityFields(inPerson, { ...fullForeigner, address: "   " })).toEqual(["address"]);
    expect(missingIdentityFields(paidOnline, { ...fullForeigner, foreignDocument: null })).toEqual(["document"]);
  });
});

describe("identityRequiredBody", () => {
  it("names the code and the missing fields for the client", () => {
    expect(identityRequiredBody(["document", "address"])).toEqual({
      code: "identity_required",
      missing: ["document", "address"],
      message: "Complete seu documento e endereço para se inscrever neste evento.",
    });
    expect(identityRequiredBody(["address"]).message).toBe("Complete seu endereço para se inscrever neste evento.");
  });
});

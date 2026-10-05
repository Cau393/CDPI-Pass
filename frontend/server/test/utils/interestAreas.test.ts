import { describe, it, expect } from "vitest";
import { events, orders } from "@shared/schema";
import {
  INTEREST_AREA_BLANK,
  INTEREST_AREA_DUPLICATE,
  INTEREST_AREA_INVALID,
  INTEREST_AREA_TOO_LONG,
  INTEREST_AREA_TOO_MANY,
  SELECT_INTEREST_AREA,
  interestAreasMultipartValue,
  parseInterestAreasField,
  resolveOrderInterestArea,
  storedParticipantInterestArea,
  withoutBuyerInterestArea,
} from "@shared/interestAreas";

describe("schema columns", () => {
  it("maps events.interestAreas to a text array and orders.interestArea to varchar", () => {
    expect(events.interestAreas.name).toBe("interest_areas");
    expect(orders.interestArea.name).toBe("interest_area");
  });
});

describe("parseInterestAreasField", () => {
  it("stores an empty list when the field is missing or []", () => {
    expect(parseInterestAreasField(undefined)).toEqual({ ok: true, value: [] });
    expect(parseInterestAreasField(null)).toEqual({ ok: true, value: [] });
    expect(parseInterestAreasField("")).toEqual({ ok: true, value: [] });
    expect(parseInterestAreasField("[]")).toEqual({ ok: true, value: [] });
    expect(parseInterestAreasField("  []  ")).toEqual({ ok: true, value: [] });
  });

  it("keeps insertion order and trims each label", () => {
    const parsed = parseInterestAreasField(
      JSON.stringify(["  Pediatria  ", "Cardiologia"]),
    );
    expect(parsed).toEqual({
      ok: true,
      value: ["Pediatria", "Cardiologia"],
    });
  });

  it("rejects invalid JSON instead of storing a partial list", () => {
    expect(parseInterestAreasField("{")).toEqual({
      ok: false,
      error: INTEREST_AREA_INVALID,
    });
    expect(parseInterestAreasField("null")).toEqual({
      ok: false,
      error: INTEREST_AREA_INVALID,
    });
    expect(parseInterestAreasField(JSON.stringify({ a: 1 }))).toEqual({
      ok: false,
      error: INTEREST_AREA_INVALID,
    });
  });

  it("rejects a blank label, a label over 80 characters, a case-insensitive duplicate, or more than 20 labels", () => {
    expect(parseInterestAreasField(JSON.stringify(["  "]))).toEqual({
      ok: false,
      error: INTEREST_AREA_BLANK,
    });
    expect(parseInterestAreasField(JSON.stringify(["a".repeat(81)]))).toEqual({
      ok: false,
      error: INTEREST_AREA_TOO_LONG,
    });
    expect(
      parseInterestAreasField(JSON.stringify(["Cardiologia", "cardiologia"])),
    ).toEqual({
      ok: false,
      error: INTEREST_AREA_DUPLICATE,
    });
    const tooMany = Array.from({ length: 21 }, (_, i) => `Área ${i}`);
    expect(parseInterestAreasField(JSON.stringify(tooMany))).toEqual({
      ok: false,
      error: INTEREST_AREA_TOO_MANY,
    });
  });

  it("serializes the multipart value as one JSON array, including []", () => {
    expect(interestAreasMultipartValue([])).toBe("[]");
    expect(interestAreasMultipartValue(undefined)).toBe("[]");
    expect(interestAreasMultipartValue(["B", "A"])).toBe('["B","A"]');
  });
});

describe("resolveOrderInterestArea", () => {
  const labels = ["Cardiologia", "Pediatria"];

  it("returns the canonical stored label, not the raw request string", () => {
    const resolved = resolveOrderInterestArea({
      labels,
      body: { interestArea: "  Cardiologia  " },
    });
    expect(resolved).toEqual({ ok: true, interestArea: "Cardiologia" });
  });

  it("keeps that snapshot if the event list is edited later", () => {
    const mutable = ["Cardiologia"];
    const resolved = resolveOrderInterestArea({
      labels: mutable,
      body: { interestArea: "Cardiologia" },
    });
    mutable[0] = "Dermatologia";
    expect(resolved).toEqual({ ok: true, interestArea: "Cardiologia" });
  });

  it("rejects missing, blank, and unknown labels when the list is non-empty", () => {
    expect(resolveOrderInterestArea({ labels, body: {} })).toEqual({
      ok: false,
      message: SELECT_INTEREST_AREA,
    });
    expect(
      resolveOrderInterestArea({ labels, body: { interestArea: "   " } }),
    ).toEqual({ ok: false, message: SELECT_INTEREST_AREA });
    expect(
      resolveOrderInterestArea({ labels, body: { interestArea: null } }),
    ).toEqual({ ok: false, message: SELECT_INTEREST_AREA });
    expect(
      resolveOrderInterestArea({
        labels,
        body: { interestArea: "cardiologia" },
      }),
    ).toEqual({ ok: false, message: SELECT_INTEREST_AREA });
  });

  it("requires the field to be omitted when the list is empty", () => {
    expect(resolveOrderInterestArea({ labels: [], body: {} })).toEqual({
      ok: true,
      interestArea: null,
    });
    expect(
      resolveOrderInterestArea({ labels: [], body: { interestArea: null } }),
    ).toEqual({ ok: false, message: SELECT_INTEREST_AREA });
    expect(
      resolveOrderInterestArea({ labels: [], body: { interestArea: "" } }),
    ).toEqual({ ok: false, message: SELECT_INTEREST_AREA });
    expect(
      resolveOrderInterestArea({
        labels: [],
        body: { interestArea: "Cardiologia" },
      }),
    ).toEqual({ ok: false, message: SELECT_INTEREST_AREA });
  });
});

describe("storedParticipantInterestArea", () => {
  it("keeps the order snapshot and uses null when it was never set", () => {
    expect(storedParticipantInterestArea("Pediatria")).toBe("Pediatria");
    expect(storedParticipantInterestArea(null)).toBeNull();
    expect(storedParticipantInterestArea(undefined)).toBeNull();
  });
});

describe("withoutBuyerInterestArea", () => {
  it("drops the buyer's answer from order payloads", () => {
    expect(
      withoutBuyerInterestArea({
        id: "order-1",
        status: "paid",
        interestArea: "Cardiologia",
      }),
    ).toEqual({ id: "order-1", status: "paid" });
  });
});

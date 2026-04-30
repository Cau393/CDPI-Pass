import { describe, it, expect } from "vitest";
import {
  mapCommercialSales,
  type CommercialSaleRow,
} from "../../utils/commercialSalesMapper";

function makeRow(overrides: Partial<CommercialSaleRow> = {}): CommercialSaleRow {
  return {
    id: "order-1",
    status: "paid",
    paymentMethod: "pix",
    buyerName: "João Silva",
    cpf: "123.456.789-00",
    buyerEmail: "joao@email.com",
    buyerPhone: "+5511999999999",
    courtesyAttendeeId: null,
    attendeeName: null,
    attendeeCpf: null,
    attendeeEmail: null,
    attendeePhone: null,
    sellerName: null,
    courtesyLinkId: null,
    createdAt: new Date("2026-01-15"),
    ...overrides,
  };
}

describe("mapCommercialSales", () => {
  it("returns N/A for organic purchases (no courtesyLinkId)", () => {
    const rows = [makeRow()];
    const result = mapCommercialSales(rows);

    expect(result).toHaveLength(1);
    expect(result[0].vendedor).toBe("N/A");
    expect(result[0].status).toBe("pago");
    expect(result[0].nome).toBe("João Silva");
    expect(result[0].cpf).toBe("123.456.789-00");
    expect(result[0].email).toBe("joao@email.com");
    expect(result[0].telefone).toBe("+5511999999999");
    expect(result[0].orderDbStatus).toBe("paid");
    expect(result[0].paymentMethod).toBe("pix");
  });

  it("passes through paymentMethod from the order row", () => {
    const rows = [makeRow({ paymentMethod: "credit_card" })];
    const result = mapCommercialSales(rows);
    expect(result[0].paymentMethod).toBe("credit_card");
  });

  it("resolves seller name when courtesyLinkId is present", () => {
    const rows = [
      makeRow({
        courtesyLinkId: "link-1",
        sellerName: "Maria Vendedora",
      }),
    ];
    const result = mapCommercialSales(rows);

    expect(result[0].vendedor).toBe("Maria Vendedora");
  });

  it('shows "Usuário Removido" when seller was deleted (EC-01)', () => {
    const rows = [
      makeRow({
        courtesyLinkId: "link-1",
        sellerName: null,
      }),
    ];
    const result = mapCommercialSales(rows);

    expect(result[0].vendedor).toBe("Usuário Removido");
  });

  it("uses courtesy attendee info when available", () => {
    const rows = [
      makeRow({
        courtesyAttendeeId: "att-1",
        attendeeName: "Carlos Cortesia",
        attendeeCpf: "987.654.321-00",
        attendeeEmail: "carlos@email.com",
        attendeePhone: "+5521888888888",
        courtesyLinkId: "link-1",
        sellerName: "Maria Vendedora",
        cpf: "987.654.321-00",
      }),
    ];
    const result = mapCommercialSales(rows);

    expect(result[0].nome).toBe("Carlos Cortesia");
    expect(result[0].cpf).toBe("987.654.321-00");
    expect(result[0].email).toBe("carlos@email.com");
    expect(result[0].telefone).toBe("+5521888888888");
    expect(result[0].vendedor).toBe("Maria Vendedora");
  });

  it('maps "pending" status to "pendente"', () => {
    const rows = [makeRow({ status: "pending" })];
    const result = mapCommercialSales(rows);

    expect(result[0].status).toBe("pendente");
    expect(result[0].orderDbStatus).toBe("pending");
  });

  it("keeps each order as its own row even when the same CPF has multiple orders", () => {
    const rows = [
      makeRow({
        id: "order-paid",
        status: "paid",
        createdAt: new Date("2026-01-15"),
      }),
      makeRow({
        id: "order-pending-a",
        status: "pending",
        createdAt: new Date("2026-01-20"),
      }),
      makeRow({
        id: "order-pending-b",
        status: "pending",
        createdAt: new Date("2026-01-21"),
      }),
    ];
    const result = mapCommercialSales(rows);

    expect(result).toHaveLength(3);
    expect(result.map((r) => r.id)).toEqual([
      "order-paid",
      "order-pending-a",
      "order-pending-b",
    ]);
    expect(result.map((r) => r.orderDbStatus)).toEqual([
      "paid",
      "pending",
      "pending",
    ]);
  });

  it("handles empty input", () => {
    expect(mapCommercialSales([])).toEqual([]);
  });

  it("handles null phone gracefully", () => {
    const rows = [makeRow({ buyerPhone: null })];
    const result = mapCommercialSales(rows);

    expect(result[0].telefone).toBe("");
  });
});

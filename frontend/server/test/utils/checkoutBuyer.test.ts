import { describe, it, expect, vi, beforeEach } from "vitest";
import type { User } from "@shared/schema";

// Keep the real storage (and its database connection) out of the unit test.
vi.mock("../../storage", () => ({ storage: {} }));

const { resolveCheckoutBuyer } = await import("../../utils/checkoutBuyer");
type CheckoutBuyerStorage = import("../../utils/checkoutBuyer").CheckoutBuyerStorage;

// ADR-017 Stage 2: who is buying. A session user is trusted; a guest is a typed buyer that
// either becomes a password-less row or is matched to an existing row WITHOUT writing to it.
const IDENTITY_CONFLICT = {
  code: "identity_conflict",
  message: "Estes dados não conferem com um cadastro existente. Entre na sua conta ou use “Esqueci meu e-mail”.",
};

const CPF_A = "529.982.247-25";
const CPF_B = "111.444.777-35";
const digits = (value: string | null | undefined) => (value ?? "").replace(/\D/g, "");

const onlineFree = { modality: "online", isFree: true };
const presencialFree = { modality: "presencial", isFree: true };
const presencialPaid = { modality: "presencial", isFree: false };
const onlinePaid = { modality: "online", isFree: false };

let rows: User[];
let nextId: number;

function makeUser(overrides: Partial<User> = {}): User {
  nextId += 1;
  return {
    id: `u${nextId}`,
    email: `user${nextId}@example.test`,
    password: "$2a$10$hash",
    name: "Conta Existente",
    phone: "5511999999999",
    emailVerified: false,
    isForeigner: false,
    cpf: null,
    foreignDocument: null,
    address: null,
    isAdmin: false,
    ...overrides,
  } as User;
}

function fakeStorage() {
  const createGuestUser = vi.fn(async (data: any) => {
    const row = makeUser({
      email: data.email,
      name: data.name,
      phone: data.phone,
      password: null,
      isForeigner: data.document?.isForeigner ?? false,
      cpf: data.document?.cpf ?? null,
      foreignDocument: data.document?.foreignDocument ?? null,
      address: data.address ?? null,
    });
    rows.push(row);
    return row;
  });
  const setUserIdentity = vi.fn(async (userId: string, identity: any) => {
    const row = rows.find((r) => r.id === userId);
    if (!row) return { ok: false as const, reason: "not_found" as const };
    if (identity.document) {
      Object.assign(row, {
        isForeigner: identity.document.isForeigner,
        cpf: identity.document.cpf,
        foreignDocument: identity.document.foreignDocument,
      });
    }
    if (identity.address !== undefined) row.address = identity.address;
    return { ok: true as const, user: row };
  });
  const store = {
    getUserByEmail: vi.fn(async (email: string) => rows.find((r) => r.email === email.toLowerCase())),
    getUserByCpf: vi.fn(async (cpf: string) => rows.find((r) => r.cpf && digits(r.cpf) === digits(cpf))),
    getUserByForeignDocument: vi.fn(async (doc: string) => rows.find((r) => r.foreignDocument === doc)),
    createGuestUser,
    setUserIdentity,
  };
  return store satisfies CheckoutBuyerStorage;
}

function writes(store: ReturnType<typeof fakeStorage>) {
  return store.createGuestUser.mock.calls.length + store.setUserIdentity.mock.calls.length;
}

const buyerBase = { name: "Maria da Silva", email: "maria@example.test", phone: "(11) 98765-4321" };
const brBuyer = { ...buyerBase, cpf: CPF_A, address: "Rua de teste, 123, Brasília" };
const foreignBuyer = { ...buyerBase, isForeigner: true, foreignDocument: "PY123456", address: "Calle de prueba 151, Asunción" };

beforeEach(() => {
  rows = [];
  nextId = 0;
});

describe("resolveCheckoutBuyer: session user", () => {
  it("ignores the buyer and uses the session user", async () => {
    const session = makeUser({ cpf: CPF_A, address: "Rua de teste, 123" });
    const store = fakeStorage();

    const result = await resolveCheckoutBuyer(
      { sessionUser: session, buyer: { ...brBuyer, email: "other@example.test" }, event: presencialPaid, paid: true },
      store,
    );

    expect(result).toMatchObject({ ok: true, user: { id: session.id }, placedAsGuest: false });
    expect(store.getUserByEmail).not.toHaveBeenCalled();
    expect(writes(store)).toBe(0);
  });

  it("refuses a foreign session user on a paid event with 403", async () => {
    const session = makeUser({ isForeigner: true, foreignDocument: "PY123456" });

    const result = await resolveCheckoutBuyer(
      { sessionUser: session, buyer: undefined, event: onlinePaid, paid: true },
      fakeStorage(),
    );

    expect(result).toMatchObject({ ok: false, status: 403, body: { code: "foreign_paid_unavailable" } });
  });

  it("asks for the missing identity of a session user with 400", async () => {
    const session = makeUser();

    const result = await resolveCheckoutBuyer(
      { sessionUser: session, buyer: undefined, event: presencialFree, paid: false },
      fakeStorage(),
    );

    expect(result).toMatchObject({ ok: false, status: 400, body: { code: "identity_required", missing: ["document", "address"] } });
  });
});

describe("resolveCheckoutBuyer: guest validation", () => {
  it("rejects an invalid buyer with 400 invalid_buyer and no write", async () => {
    const store = fakeStorage();

    const result = await resolveCheckoutBuyer(
      { sessionUser: undefined, buyer: { ...buyerBase, email: "nope" }, event: onlineFree, paid: false },
      store,
    );

    expect(result).toMatchObject({ ok: false, status: 400, body: { code: "invalid_buyer" } });
    expect(writes(store)).toBe(0);
  });

  it("rejects a missing buyer with 400 invalid_buyer", async () => {
    const result = await resolveCheckoutBuyer(
      { sessionUser: undefined, buyer: undefined, event: onlineFree, paid: false },
      fakeStorage(),
    );

    expect(result).toMatchObject({ ok: false, status: 400, body: { code: "invalid_buyer", message: "Informe seus dados para continuar." } });
  });

  it("refuses a foreign guest on a paid event with 403 and no write", async () => {
    const store = fakeStorage();

    const result = await resolveCheckoutBuyer(
      { sessionUser: undefined, buyer: foreignBuyer, event: presencialPaid, paid: true },
      store,
    );

    expect(result).toMatchObject({ ok: false, status: 403, body: { code: "foreign_paid_unavailable" } });
    expect(writes(store)).toBe(0);
  });

  it("asks for the document and address of an in-person event, with no write", async () => {
    const store = fakeStorage();

    const result = await resolveCheckoutBuyer(
      { sessionUser: undefined, buyer: buyerBase, event: presencialFree, paid: false },
      store,
    );

    expect(result).toMatchObject({ ok: false, status: 400, body: { code: "identity_required", missing: ["document", "address"] } });
    expect(writes(store)).toBe(0);
  });
});

describe("resolveCheckoutBuyer: new e-mail", () => {
  it("creates one guest row with the typed document", async () => {
    const store = fakeStorage();

    const result = await resolveCheckoutBuyer(
      { sessionUser: undefined, buyer: brBuyer, event: presencialPaid, paid: true },
      store,
    );

    expect(store.createGuestUser).toHaveBeenCalledTimes(1);
    expect(store.createGuestUser).toHaveBeenCalledWith({
      email: "maria@example.test",
      name: "Maria da Silva",
      phone: "5511987654321",
      document: { isForeigner: false, cpf: CPF_A, foreignDocument: null },
      address: "Rua de teste, 123, Brasília",
    });
    expect(result).toMatchObject({
      ok: true,
      placedAsGuest: true,
      identity: { isForeigner: false, cpf: CPF_A, foreignDocument: null, address: "Rua de teste, 123, Brasília" },
    });
  });

  it("creates a foreign guest row on a free event", async () => {
    const store = fakeStorage();

    const result = await resolveCheckoutBuyer(
      { sessionUser: undefined, buyer: foreignBuyer, event: presencialFree, paid: false },
      store,
    );

    expect(store.createGuestUser).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ ok: true, identity: { isForeigner: true, cpf: null, foreignDocument: "PY123456" } });
  });

  it("answers 409 when the CPF belongs to someone else, and writes nothing", async () => {
    rows.push(makeUser({ email: "owner@example.test", cpf: CPF_A }));
    const store = fakeStorage();

    const result = await resolveCheckoutBuyer(
      { sessionUser: undefined, buyer: brBuyer, event: presencialPaid, paid: true },
      store,
    );

    expect(result).toEqual({ ok: false, status: 409, body: IDENTITY_CONFLICT });
    expect(writes(store)).toBe(0);
  });

  it("answers 409 when the passport belongs to someone else, and writes nothing", async () => {
    rows.push(makeUser({ email: "owner@example.test", isForeigner: true, foreignDocument: "PY123456" }));
    const store = fakeStorage();

    const result = await resolveCheckoutBuyer(
      { sessionUser: undefined, buyer: foreignBuyer, event: presencialFree, paid: false },
      store,
    );

    expect(result).toEqual({ ok: false, status: 409, body: IDENTITY_CONFLICT });
    expect(writes(store)).toBe(0);
  });
});

describe("resolveCheckoutBuyer: existing guest row (no password)", () => {
  it("reuses the row, keeps its name and phone, and fills an empty document and address", async () => {
    const row = makeUser({ email: "maria@example.test", password: null, name: "Nome Original", phone: "5511900000000" });
    rows.push(row);
    const store = fakeStorage();

    const result = await resolveCheckoutBuyer(
      { sessionUser: undefined, buyer: brBuyer, event: presencialPaid, paid: true },
      store,
    );

    expect(store.createGuestUser).not.toHaveBeenCalled();
    expect(store.setUserIdentity).toHaveBeenCalledTimes(1);
    expect(store.setUserIdentity).toHaveBeenCalledWith(row.id, {
      document: { isForeigner: false, cpf: CPF_A, foreignDocument: null },
      address: "Rua de teste, 123, Brasília",
    });
    expect(result).toMatchObject({ ok: true, user: { id: row.id, name: "Nome Original", phone: "5511900000000" }, placedAsGuest: true });
  });

  it("skips the write when the row already has everything", async () => {
    rows.push(makeUser({ email: "maria@example.test", password: null, cpf: CPF_A, address: "Rua antiga, 1, Brasília" }));
    const store = fakeStorage();

    const result = await resolveCheckoutBuyer(
      { sessionUser: undefined, buyer: brBuyer, event: presencialPaid, paid: true },
      store,
    );

    expect(writes(store)).toBe(0);
    expect(result).toMatchObject({ ok: true, identity: { cpf: CPF_A, address: "Rua antiga, 1, Brasília" } });
  });

  it("answers 409 when the row has document A and B is typed, with no write", async () => {
    rows.push(makeUser({ email: "maria@example.test", password: null, cpf: CPF_B }));
    const store = fakeStorage();

    const result = await resolveCheckoutBuyer(
      { sessionUser: undefined, buyer: brBuyer, event: presencialPaid, paid: true },
      store,
    );

    expect(result).toEqual({ ok: false, status: 409, body: IDENTITY_CONFLICT });
    expect(writes(store)).toBe(0);
  });

  it("answers 409 when the row has a CPF and a passport is typed", async () => {
    rows.push(makeUser({ email: "maria@example.test", password: null, cpf: CPF_A }));
    const store = fakeStorage();

    const result = await resolveCheckoutBuyer(
      { sessionUser: undefined, buyer: foreignBuyer, event: presencialFree, paid: false },
      store,
    );

    expect(result).toEqual({ ok: false, status: 409, body: IDENTITY_CONFLICT });
    expect(writes(store)).toBe(0);
  });

  it("answers 409 when the typed passport is another user's", async () => {
    rows.push(makeUser({ email: "maria@example.test", password: null }));
    rows.push(makeUser({ email: "owner@example.test", isForeigner: true, foreignDocument: "PY123456" }));
    const store = fakeStorage();

    const result = await resolveCheckoutBuyer(
      { sessionUser: undefined, buyer: foreignBuyer, event: presencialFree, paid: false },
      store,
    );

    expect(result).toEqual({ ok: false, status: 409, body: IDENTITY_CONFLICT });
    expect(writes(store)).toBe(0);
  });

  it("maps document_taken from setUserIdentity to the same generic 409", async () => {
    rows.push(makeUser({ email: "maria@example.test", password: null }));
    const store = fakeStorage();
    store.setUserIdentity.mockResolvedValueOnce({ ok: false, reason: "document_taken" });

    const result = await resolveCheckoutBuyer(
      { sessionUser: undefined, buyer: brBuyer, event: presencialPaid, paid: true },
      store,
    );

    expect(result).toEqual({ ok: false, status: 409, body: IDENTITY_CONFLICT });
  });
});

describe("resolveCheckoutBuyer: existing password account", () => {
  it("makes no write at all and carries the typed CPF only in the identity", async () => {
    const account = makeUser({ email: "maria@example.test" });
    rows.push(account);
    const store = fakeStorage();

    const result = await resolveCheckoutBuyer(
      { sessionUser: undefined, buyer: brBuyer, event: presencialPaid, paid: true },
      store,
    );

    expect(writes(store)).toBe(0);
    expect(account.cpf).toBeNull();
    expect(account.address).toBeNull();
    expect(result).toMatchObject({
      ok: true,
      user: { id: account.id },
      placedAsGuest: true,
      identity: { cpf: CPF_A, address: "Rua de teste, 123, Brasília" },
    });
  });

  it("answers 409 when the account has CPF A and B is typed", async () => {
    rows.push(makeUser({ email: "maria@example.test", cpf: CPF_B }));
    const store = fakeStorage();

    const result = await resolveCheckoutBuyer(
      { sessionUser: undefined, buyer: brBuyer, event: presencialPaid, paid: true },
      store,
    );

    expect(result).toEqual({ ok: false, status: 409, body: IDENTITY_CONFLICT });
    expect(writes(store)).toBe(0);
  });

  it("accepts the account's own CPF typed again", async () => {
    rows.push(makeUser({ email: "maria@example.test", cpf: CPF_A, address: "Rua antiga, 1, Brasília" }));
    const store = fakeStorage();

    const result = await resolveCheckoutBuyer(
      { sessionUser: undefined, buyer: brBuyer, event: presencialPaid, paid: true },
      store,
    );

    expect(result).toMatchObject({ ok: true, placedAsGuest: true });
    expect(writes(store)).toBe(0);
  });
});

describe("resolveCheckoutBuyer: concurrent creation", () => {
  function uniqueViolation() {
    return Object.assign(new Error('duplicate key value violates unique constraint "users_email_unique"'), { code: "23505" });
  }

  it("resolves against the row that won the race when createGuestUser hits a unique violation", async () => {
    const store = fakeStorage();
    const winner = makeUser({ email: "maria@example.test", password: null, name: "Vencedor" });
    store.createGuestUser.mockImplementationOnce(async () => {
      rows.push(winner);
      throw uniqueViolation();
    });

    const result = await resolveCheckoutBuyer(
      { sessionUser: undefined, buyer: buyerBase, event: onlineFree, paid: false },
      store,
    );

    expect(result).toMatchObject({ ok: true, user: { id: winner.id, name: "Vencedor" }, placedAsGuest: true });
  });

  it("answers 409 when the unique violation leaves no row to read", async () => {
    const store = fakeStorage();
    store.createGuestUser.mockImplementationOnce(async () => {
      throw uniqueViolation();
    });

    const result = await resolveCheckoutBuyer(
      { sessionUser: undefined, buyer: buyerBase, event: onlineFree, paid: false },
      store,
    );

    expect(result).toEqual({ ok: false, status: 409, body: IDENTITY_CONFLICT });
  });
});

describe("IDENTITY_CONFLICT is generic", () => {
  it("has the same body whichever of e-mail or document matched", async () => {
    const bodies: unknown[] = [];

    // Document owned by someone else, new e-mail.
    rows = [makeUser({ email: "owner@example.test", cpf: CPF_A })];
    bodies.push((await resolveCheckoutBuyer({ sessionUser: undefined, buyer: brBuyer, event: presencialPaid, paid: true }, fakeStorage()) as any).body);

    // E-mail of a password account with another CPF.
    rows = [makeUser({ email: "maria@example.test", cpf: CPF_B })];
    bodies.push((await resolveCheckoutBuyer({ sessionUser: undefined, buyer: brBuyer, event: presencialPaid, paid: true }, fakeStorage()) as any).body);

    // E-mail of a guest row with another CPF.
    rows = [makeUser({ email: "maria@example.test", password: null, cpf: CPF_B })];
    bodies.push((await resolveCheckoutBuyer({ sessionUser: undefined, buyer: brBuyer, event: presencialPaid, paid: true }, fakeStorage()) as any).body);

    expect(bodies).toEqual([IDENTITY_CONFLICT, IDENTITY_CONFLICT, IDENTITY_CONFLICT]);
  });
});

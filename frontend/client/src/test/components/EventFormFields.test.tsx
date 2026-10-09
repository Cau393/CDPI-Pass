import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

// Tiptap does not initialize ProseMirror in jsdom — the description editor is
// irrelevant to these assertions, so stub it out.
vi.mock("@tiptap/react", () => ({
  useEditor: vi.fn(() => ({
    getHTML: vi.fn(() => "<p></p>"),
    setEditable: vi.fn(),
    commands: { setContent: vi.fn(), clearContent: vi.fn() },
    can: () => ({ undo: () => false, redo: () => false }),
    isActive: vi.fn(() => false),
    chain: () => ({
      focus: () => ({
        toggleBold: () => ({ run: vi.fn() }),
        toggleItalic: () => ({ run: vi.fn() }),
        toggleUnderline: () => ({ run: vi.fn() }),
        setTextAlign: () => ({ run: vi.fn() }),
        toggleBulletList: () => ({ run: vi.fn() }),
        toggleOrderedList: () => ({ run: vi.fn() }),
        undo: () => ({ run: vi.fn() }),
        redo: () => ({ run: vi.fn() }),
      }),
    }),
  })),
  EditorContent: () => <div data-testid="tiptap-editor" />,
}));

import EventFormFields from "../../components/admin/EventFormFields";
import { Form } from "../../components/ui/form";
import {
  editEventSchema,
  type EditEventFormValues,
  type RegistrationFormRow,
} from "../../lib/eventForm";
import { REGISTRATION_FIELD_LABEL_INVALID } from "@shared/eventRegistrationForm";

function Harness({
  defaults,
  onValid = () => {},
}: {
  defaults?: Partial<EditEventFormValues>;
  onValid?: (values: EditEventFormValues) => void;
}) {
  const form = useForm<EditEventFormValues>({
    resolver: zodResolver(editEventSchema),
    defaultValues: {
      title: "Evento teste",
      description: "<p>desc</p>",
      date: "2026-09-03T09:00",
      location: "Local",
      price: "100,00",
      npsType: "cdpi_event",
      isFree: false,
      modality: "presencial",
      meetingUrl: "",
      meetingPassword: "",
      whatsappGroupUrl: "",
      confirmationEmailHtml: "",
      registrationForm: [],
      ...defaults,
    },
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onValid)}>
        <EventFormFields
          form={form}
          fileInputRef={{ current: null }}
          previewUrl={null}
          coverRequired={false}
          onClearNewCover={() => {}}
        />
        <button type="submit">Salvar</button>
      </form>
    </Form>
  );
}

describe("EventFormFields — NPS event-type selector (relabelled)", () => {
  it("shows the two new labels", () => {
    render(<Harness />);
    expect(screen.getByLabelText("Evento CDPI")).toBeInTheDocument();
    expect(screen.getByLabelText("Evento de Terceiros")).toBeInTheDocument();
  });

  it("keeps the stored enum values unchanged", () => {
    render(<Harness />);
    // The radio values are what lands in events.nps_type — relabelling must not
    // touch them or existing NPS responses stop matching their form.
    expect(screen.getByLabelText("Evento CDPI")).toHaveAttribute("value", "cdpi_event");
    expect(screen.getByLabelText("Evento de Terceiros")).toHaveAttribute(
      "value",
      "cdpi_apoiando",
    );
  });

  it("preselects the event's current type", () => {
    render(<Harness defaults={{ npsType: "cdpi_apoiando" }} />);
    expect(screen.getByLabelText("Evento de Terceiros")).toBeChecked();
    expect(screen.getByLabelText("Evento CDPI")).not.toBeChecked();
  });

  it("lets the admin switch between the two types", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect(screen.getByLabelText("Evento CDPI")).toBeChecked();

    await user.click(screen.getByLabelText("Evento de Terceiros"));
    expect(screen.getByLabelText("Evento de Terceiros")).toBeChecked();
  });

  it("no longer shows the old labels", () => {
    render(<Harness />);
    expect(screen.queryByLabelText("Evento do CDPI")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("CDPI Apoiando Evento")).not.toBeInTheDocument();
  });
});

describe("EventFormFields — 'Evento Grátis' switch", () => {
  it("renders the switch, off by default", () => {
    render(<Harness />);
    const sw = screen.getByTestId("switch-event-is-free");
    expect(sw).toBeInTheDocument();
    expect(sw).toHaveAttribute("aria-checked", "false");
  });

  it("leaves the price field editable while off", () => {
    render(<Harness />);
    expect(screen.getByTestId("input-event-price")).not.toBeDisabled();
  });

  it("disables and zeroes the price field when switched on", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByTestId("switch-event-is-free"));

    const price = screen.getByTestId("input-event-price");
    expect(price).toBeDisabled();
    expect(price).toHaveValue("0,00");
  });

  it("shows the free-event hint instead of the currency hint", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect(screen.getByText(/vírgula nos centavos/i)).toBeInTheDocument();

    await user.click(screen.getByTestId("switch-event-is-free"));
    expect(screen.getByText(/preço fica fixo em R\$ 0,00/i)).toBeInTheDocument();
  });

  it("starts on and faded for an event already marked free", () => {
    render(<Harness defaults={{ isFree: true, price: "0,00" }} />);
    expect(screen.getByTestId("switch-event-is-free")).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByTestId("input-event-price")).toBeDisabled();
  });
});

describe("EventFormFields — modality selector", () => {
  it("defaults to Presencial and hides the meeting URL field", () => {
    render(<Harness />);
    expect(screen.getByLabelText("Presencial")).toBeChecked();
    expect(screen.queryByTestId("input-meeting-url")).not.toBeInTheDocument();
  });

  it("shows the meeting URL field when Online is selected", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByLabelText("Online"));
    expect(screen.getByLabelText("Online")).toBeChecked();
    expect(screen.getByTestId("input-meeting-url")).toBeInTheDocument();
  });

  it("starts with the meeting URL visible for an existing online event", () => {
    render(
      <Harness
        defaults={{
          modality: "online",
          meetingUrl: "https://zoom.us/j/123",
        }}
      />,
    );
    expect(screen.getByLabelText("Online")).toBeChecked();
    expect(screen.getByTestId("input-meeting-url")).toHaveValue(
      "https://zoom.us/j/123",
    );
  });

  it("hides the WhatsApp field for presencial events", () => {
    render(<Harness />);
    expect(screen.queryByTestId("input-whatsapp-group-url")).not.toBeInTheDocument();
  });

  it("shows the WhatsApp field when Online is selected", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByLabelText("Online"));
    expect(screen.getByTestId("input-whatsapp-group-url")).toBeInTheDocument();
  });

  it("shows Senha para a Reunião under the meeting link when online", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByLabelText("Online"));

    const password = screen.getByLabelText("Senha para a Reunião");
    const meeting = screen.getByTestId("input-meeting-url");
    const whatsapp = screen.getByTestId("input-whatsapp-group-url");
    expect(password).toBeInTheDocument();
    expect(
      meeting.compareDocumentPosition(password) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      password.compareDocumentPosition(whatsapp) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      screen.getByText(/mostrada em Meus Ingressos após a confirmação/i),
    ).toBeInTheDocument();
  });

  it("hides the meeting password for presencial events", () => {
    render(<Harness />);
    expect(screen.queryByLabelText("Senha para a Reunião")).not.toBeInTheDocument();
  });

  it("clears the meeting password when switching back to presencial", async () => {
    const user = userEvent.setup();
    render(
      <Harness
        defaults={{
          modality: "online",
          meetingUrl: "https://zoom.us/j/123",
          meetingPassword: "segredo",
        }}
      />,
    );

    expect(screen.getByLabelText("Senha para a Reunião")).toHaveValue("segredo");
    await user.click(screen.getByLabelText("Presencial"));
    expect(screen.queryByLabelText("Senha para a Reunião")).not.toBeInTheDocument();
    await user.click(screen.getByLabelText("Online"));
    expect(screen.getByLabelText("Senha para a Reunião")).toHaveValue("");
  });

  it("shows the confirmation email editor for presencial and online events", () => {
    render(<Harness />);
    expect(screen.getByTestId("editor-confirmation-email")).toBeInTheDocument();
  });
});

describe("EventFormFields — courtesy limit", () => {
  it("renders an optional numeric courtesy limit", () => {
    render(<Harness />);
    const input = screen.getByLabelText("Limite total de cortesias");
    expect(input).toHaveAttribute("inputmode", "numeric");
    expect(input).toHaveValue("");
  });
});

function question(overrides: Partial<RegistrationFormRow> = {}): RegistrationFormRow {
  return {
    fieldId: null,
    type: "text",
    label: "Cargo",
    optionsText: "",
    required: false,
    ...overrides,
  };
}

function lockedRows(): string[] {
  return screen.queryAllByTestId("registration-locked-row").map((row) => row.textContent ?? "");
}

describe("EventFormFields — Formulário de inscrição", () => {
  it("replaces the old Área de Interesse editor", () => {
    render(<Harness />);
    expect(screen.getByText("Formulário de inscrição")).toBeInTheDocument();
    expect(screen.queryByTestId("input-interest-area")).not.toBeInTheDocument();
  });

  it("locks document and address on top for an in-person event", () => {
    render(<Harness />);
    expect(lockedRows()).toEqual(["Documento (CPF ou passaporte)", "Endereço"]);
  });

  it("locks only the document for a paid online event", () => {
    render(<Harness defaults={{ modality: "online", meetingUrl: "https://zoom.us/j/1" }} />);
    expect(lockedRows()).toEqual(["Documento (CPF ou passaporte)"]);
  });

  it("locks nothing once an online event is made free", async () => {
    const user = userEvent.setup();
    render(<Harness defaults={{ modality: "online", meetingUrl: "https://zoom.us/j/1" }} />);

    await user.click(screen.getByTestId("switch-event-is-free"));

    expect(lockedRows()).toEqual([]);
  });

  it("adds a text question the admin can make required", async () => {
    const user = userEvent.setup();
    const onValid = vi.fn();
    render(<Harness onValid={onValid} />);

    await user.click(screen.getByRole("button", { name: "Adicionar pergunta" }));
    await user.type(screen.getByLabelText("Pergunta 1"), "Cargo");
    await user.click(screen.getByRole("switch", { name: "Obrigatório" }));
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() => {
      expect(onValid.mock.calls[0]?.[0].registrationForm).toEqual([
        question({ label: "Cargo", required: true }),
      ]);
    });
  });

  it("asks for options when the question becomes a dropdown", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("button", { name: "Adicionar pergunta" }));
    await user.click(screen.getByRole("combobox", { name: "Tipo de resposta" }));
    await user.click(await screen.findByRole("option", { name: "Lista suspensa" }));

    expect(screen.getByLabelText("Opções (uma por linha)")).toBeInTheDocument();
  });

  it("does not let the admin change the type of a saved question", () => {
    render(<Harness defaults={{ registrationForm: [question({ fieldId: "q-1" })] }} />);
    expect(screen.getByRole("combobox", { name: "Tipo de resposta" })).toBeDisabled();
  });

  it("moves a question up", async () => {
    const user = userEvent.setup();
    render(
      <Harness
        defaults={{ registrationForm: [question({ label: "Cargo" }), question({ label: "Empresa" })] }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Mover pergunta 2 para cima" }));

    expect(screen.getByLabelText("Pergunta 1")).toHaveValue("Empresa");
  });

  it("removes a question", async () => {
    const user = userEvent.setup();
    render(
      <Harness
        defaults={{ registrationForm: [question({ label: "Cargo" }), question({ label: "Empresa" })] }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Remover pergunta 1" }));

    expect(screen.getAllByLabelText(/^Pergunta \d$/).map((input) => (input as HTMLInputElement).value)).toEqual([
      "Empresa",
    ]);
  });

  it("shows the server's rule next to a question without text", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("button", { name: "Adicionar pergunta" }));
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    expect(await screen.findByText(REGISTRATION_FIELD_LABEL_INVALID)).toBeInTheDocument();
  });

  it("stops adding questions at 20", () => {
    render(
      <Harness
        defaults={{
          registrationForm: Array.from({ length: 20 }, (_, i) => question({ label: `Pergunta ${i}` })),
        }}
      />,
    );
    expect(screen.getByRole("button", { name: "Adicionar pergunta" })).toBeDisabled();
  });
});

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
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
import { editEventSchema, type EditEventFormValues } from "../../lib/eventForm";

function Harness({
  defaults,
}: {
  defaults?: Partial<EditEventFormValues>;
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
      ...defaults,
    },
  });

  return (
    <Form {...form}>
      <form>
        <EventFormFields
          form={form}
          fileInputRef={{ current: null }}
          previewUrl={null}
          coverRequired={false}
          onClearNewCover={() => {}}
        />
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

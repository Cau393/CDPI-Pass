import { describe, it, expect, vi, afterEach } from "vitest";
import { useEffect } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { UseFormReturn } from "react-hook-form";
import type { CreateEventFormValues } from "../../lib/eventForm";

vi.mock("wouter", () => ({
  useLocation: () => ["/admin/events/new", vi.fn()],
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));

vi.mock("../../hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

// The fields have their own tests; here they only fill a valid form so the
// page's multipart body can be checked.
vi.mock("../../components/admin/EventFormFields", () => ({
  default: ({ form }: { form: UseFormReturn<CreateEventFormValues> }) => {
    useEffect(() => {
      form.reset({
        title: "Congresso CDPI 2026",
        description: "<p>Descrição</p>",
        date: "2026-11-03T09:00",
        location: "São Paulo",
        price: "100,00",
        npsType: "cdpi_event",
        isFree: false,
        modality: "presencial",
        meetingUrl: "",
        meetingPassword: "",
        whatsappGroupUrl: "",
        confirmationEmailHtml: "",
        courtesyLimit: "",
        registrationForm: [
          { fieldId: null, type: "text", label: "Cargo", optionsText: "", required: true },
        ],
      });
    }, [form]);
    return (
      <input
        type="file"
        data-testid="cover"
        onChange={(e) => form.setValue("coverImage", e.target.files ?? undefined)}
      />
    );
  },
}));

import AdminCreateEventPage from "../../pages/AdminCreateEventPage";

describe("AdminCreateEventPage — Formulário de inscrição", () => {
  // jsdom has no object URLs; the page only uses them for the cover preview.
  Object.assign(URL, { createObjectURL: () => "blob:preview", revokeObjectURL: () => {} });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends the questions as registration_form and no interest areas", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ id: "e1", title: "Congresso CDPI 2026" }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<AdminCreateEventPage />);

    await user.upload(
      screen.getByTestId("cover"),
      new File(["x"], "capa.png", { type: "image/png" }),
    );
    await user.click(screen.getByRole("button", { name: /Criar evento/ }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as FormData;
    expect({
      registrationForm: JSON.parse(String(body.get("registration_form"))),
      interestAreas: body.get("interest_areas"),
    }).toEqual({
      registrationForm: [{ type: "text", label: "Cargo", options: [], required: true }],
      interestAreas: null,
    });
  });
});

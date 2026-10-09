import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { refineAccountDocument } from "@shared/schema";
import { DocumentFields } from "../../components/DocumentFields";

const schema = z
  .object({ isForeigner: z.boolean(), cpf: z.string(), foreignDocument: z.string() })
  .superRefine(refineAccountDocument);
type Values = z.infer<typeof schema>;

function Harness() {
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { isForeigner: false, cpf: "", foreignDocument: "" },
  });
  const values = form.watch();
  return (
    <form onSubmit={form.handleSubmit(() => {})}>
      <DocumentFields form={form} />
      <button type="submit">Enviar</button>
      <output data-testid="values">{JSON.stringify(values)}</output>
    </form>
  );
}

describe("DocumentFields", () => {
  it("masks a typed CPF", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.type(screen.getByLabelText("CPF"), "12345678909");

    expect(screen.getByLabelText("CPF")).toHaveValue("123.456.789-09");
  });

  it("swaps the CPF for the passport when the visitor is a foreigner", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByLabelText("Sou estrangeiro / I'm a foreign visitor"));

    expect(screen.queryByLabelText("CPF")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Passaporte / Passport")).toBeInTheDocument();
  });

  it("keeps the passport upper-case letters and digits only", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByLabelText("Sou estrangeiro / I'm a foreign visitor"));
    await user.type(screen.getByLabelText("Passaporte / Passport"), "ab-123 456");

    expect(screen.getByTestId("values")).toHaveTextContent(
      '{"isForeigner":true,"cpf":"","foreignDocument":"AB123456"}',
    );
  });

  it("shows the form's CPF error", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("button", { name: "Enviar" }));

    expect(await screen.findByTestId("text-cpf-error")).toHaveTextContent(
      "CPF deve estar no formato 000.000.000-00",
    );
  });
});

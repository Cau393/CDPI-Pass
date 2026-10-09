import { describe, it, expect } from "vitest";
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { RegistrationField } from "@shared/eventRegistrationForm";
import { RegistrationFields } from "../../components/RegistrationFields";

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
  type: "select",
  label: "Área de interesse",
  options: ["Pesquisa", "Indústria"],
  required: false,
  archived: false,
};
const turno: RegistrationField = {
  id: "q-turno",
  type: "radio",
  label: "Turno",
  options: ["Manhã", "Tarde"],
  required: true,
  archived: false,
};
const removed: RegistrationField = { ...cargo, id: "q-old", label: "Pergunta antiga", archived: true };

function Harness({
  fields,
  errors,
}: {
  fields: RegistrationField[];
  errors?: Record<string, string>;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  return (
    <>
      <RegistrationFields
        fields={fields}
        values={values}
        errors={errors}
        onChange={(fieldId, value) => setValues((prev) => ({ ...prev, [fieldId]: value }))}
      />
      <output data-testid="values">{JSON.stringify(values)}</output>
    </>
  );
}

describe("RegistrationFields", () => {
  it("ties a text question's label to its input and keeps the typed answer", async () => {
    const user = userEvent.setup();
    render(<Harness fields={[cargo]} />);

    await user.type(screen.getByLabelText(/Cargo/), "Farmacêutica");

    expect(screen.getByTestId("values")).toHaveTextContent('{"q-cargo":"Farmacêutica"}');
  });

  it("marks a required question as required", () => {
    render(<Harness fields={[cargo]} />);
    expect(screen.getByLabelText(/Cargo/)).toBeRequired();
  });

  it("lets the attendee pick a dropdown option", async () => {
    const user = userEvent.setup();
    render(<Harness fields={[area]} />);

    await user.click(screen.getByLabelText(/Área de interesse/));
    await user.click(await screen.findByRole("option", { name: "Indústria" }));

    expect(screen.getByTestId("values")).toHaveTextContent('{"q-area":"Indústria"}');
  });

  it("shows multiple choice as labelled radios", async () => {
    const user = userEvent.setup();
    render(<Harness fields={[turno]} />);

    await user.click(screen.getByRole("radio", { name: "Tarde" }));

    expect(screen.getByRole("radiogroup", { name: /Turno/ })).toBeInTheDocument();
    expect(screen.getByTestId("values")).toHaveTextContent('{"q-turno":"Tarde"}');
  });

  it("describes the input with its inline error", () => {
    render(
      <Harness
        fields={[cargo]}
        errors={{ "q-cargo": "Responda a pergunta obrigatória: Cargo" }}
      />,
    );
    expect(screen.getByLabelText(/Cargo/)).toHaveAccessibleDescription(
      "Responda a pergunta obrigatória: Cargo",
    );
  });

  it("does not render archived questions", () => {
    render(<Harness fields={[cargo, removed]} />);
    expect(screen.queryByLabelText(/Pergunta antiga/)).not.toBeInTheDocument();
  });
});

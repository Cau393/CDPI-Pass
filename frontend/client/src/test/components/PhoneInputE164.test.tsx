import { useState } from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PhoneInputE164 } from "@/components/nps/PhoneInputE164";

/** Controlled like the real forms: the parent stores the digits it receives. */
function ControlledPhone({ onDigits }: { onDigits: (digits: string) => void }) {
  const [value, setValue] = useState("");
  return (
    <PhoneInputE164
      value={value}
      onChange={(digits) => {
        setValue(digits);
        onDigits(digits);
      }}
    />
  );
}

function renderControlled() {
  const onDigits = vi.fn();
  render(<ControlledPhone onDigits={onDigits} />);
  return { onDigits, input: screen.getByRole("textbox") as HTMLInputElement };
}

describe("PhoneInputE164", () => {
  it("renders and forwards normalized digits via onChange", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<PhoneInputE164 value="" onChange={onChange} data-testid="phone-wrap" />);

    const input = screen.getByRole("textbox");
    await user.type(input, "11999999999");
    await waitFor(() => {
      expect(onChange.mock.calls.length).toBeGreaterThan(0);
    });
    const last = onChange.mock.calls.at(-1)?.[0] as string | undefined;
    expect(last).toBeDefined();
    expect(last).toMatch(/^\d{8,15}$/);
  });

  it("keeps +55 when a keyboard user tabs in and types a Brazilian number", async () => {
    const user = userEvent.setup();
    const { onDigits, input } = renderControlled();

    // Tab order: country select, then the number input.
    await user.tab();
    await user.tab();
    await user.keyboard("11987654321");

    expect(onDigits).toHaveBeenLastCalledWith("5511987654321");
  });

  it("keeps +55 when the whole field is selected and a Brazilian number is typed", async () => {
    const user = userEvent.setup();
    const { onDigits, input } = renderControlled();

    await user.click(input);
    input.setSelectionRange(0, input.value.length);
    await user.keyboard("11987654321");

    expect(onDigits).toHaveBeenLastCalledWith("5511987654321");
  });

  it("lets a typed + replace the lone +55 so a foreigner can enter another country code", async () => {
    const user = userEvent.setup();
    const { onDigits, input } = renderControlled();

    await user.click(input);
    await user.keyboard("+595981123456");

    expect(onDigits).toHaveBeenLastCalledWith("595981123456");
  });

  it("replaces only the national digits when the whole number is selected and retyped", async () => {
    const user = userEvent.setup();
    const { onDigits, input } = renderControlled();

    await user.click(input);
    await user.keyboard("11987654321");
    input.setSelectionRange(0, input.value.length);
    await user.keyboard("21987654321");

    expect(onDigits).toHaveBeenLastCalledWith("5521987654321");
  });

  it("leaves the selection alone for a shortcut such as Ctrl+1", async () => {
    const user = userEvent.setup();
    const { input } = renderControlled();

    await user.click(input);
    input.setSelectionRange(0, input.value.length);
    await user.keyboard("{Control>}1{/Control}");

    expect(input.selectionStart).toBe(0);
  });

  it("does not let + wipe a number that is already typed", async () => {
    const user = userEvent.setup();
    const { onDigits, input } = renderControlled();

    await user.click(input);
    await user.keyboard("11987654321+");

    expect(onDigits).toHaveBeenLastCalledWith("5511987654321");
  });

  it("lets a pasted international number replace the lone +55", async () => {
    const user = userEvent.setup();
    const { onDigits, input } = renderControlled();

    await user.click(input);
    await user.paste("+595 981 123456");

    expect(onDigits).toHaveBeenLastCalledWith("595981123456");
  });
});

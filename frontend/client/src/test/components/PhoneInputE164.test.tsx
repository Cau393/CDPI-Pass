import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PhoneInputE164 } from "@/components/nps/PhoneInputE164";

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
});

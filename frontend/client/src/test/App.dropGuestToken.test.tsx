import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";

// Production wiring of R2: App must mount the auth-change detector. Removing the call fails this test.
const detector = vi.hoisted(() => vi.fn());
vi.mock("../hooks/useDropGuestTokenOnAuthChange", () => ({ useDropGuestTokenOnAuthChange: detector }));
vi.mock("../hooks/useAuth", () => ({ useAuth: () => ({ user: undefined, isLoading: false, isAuthenticated: false }) }));
vi.mock("../components/Navigation", () => ({ default: () => null }));
vi.mock("../pages/HomePage", () => ({ default: () => <div data-testid="home" /> }));

import App from "../App";

describe("App — R2 wiring", () => {
  it("mounts the guest-token drop detector", () => {
    window.history.pushState({}, "", "/");
    render(<App />);
    expect(detector).toHaveBeenCalled();
  });
});

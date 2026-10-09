import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const setLocation = vi.fn();
vi.mock("wouter", () => ({
  useLocation: () => [window.location.pathname, setLocation],
}));

const loggedOut = { user: null, isAuthenticated: false };
const loggedIn = {
  user: { name: "Maria Silva", email: "maria@example.com", isAdmin: false },
  isAuthenticated: true,
};
let authState: typeof loggedOut | typeof loggedIn = loggedOut;
vi.mock("../../hooks/useAuth", () => ({
  useAuth: () => authState,
}));

import Navigation from "../../components/Navigation";

describe("Navigation sign-up entry points", () => {
  beforeEach(() => {
    authState = loggedOut;
    window.history.pushState({}, "", "/eventos");
  });

  afterEach(() => {
    setLocation.mockReset();
  });

  it("shows Cadastre-se in the desktop header when logged out", () => {
    render(<Navigation />);
    expect(screen.getByTestId("nav-register")).toHaveTextContent("Cadastre-se");
  });

  it("shows Cadastre-se in the mobile top bar without opening the menu", () => {
    render(<Navigation />);
    expect(screen.getByTestId("nav-register-mobile")).toHaveTextContent("Cadastre-se");
  });

  it("sends a logged-out visitor to the register page", async () => {
    render(<Navigation />);
    await userEvent.click(screen.getByTestId("nav-register"));
    expect(setLocation).toHaveBeenCalledWith("/register");
  });

  it("keeps the event page as next when signing up from an event", async () => {
    window.history.pushState({}, "", "/event/abc?promo=CDPI01");
    render(<Navigation />);
    await userEvent.click(screen.getByTestId("nav-register-mobile"));
    expect(setLocation).toHaveBeenCalledWith(
      "/register?next=%2Fevent%2Fabc%3Fpromo%3DCDPI01",
    );
  });

  it("keeps the return path when switching from login to sign-up", async () => {
    window.history.pushState({}, "", "/login?next=%2Fevent%2Fabc");
    render(<Navigation />);
    await userEvent.click(screen.getByTestId("nav-register"));
    expect(setLocation).toHaveBeenCalledWith("/register?next=%2Fevent%2Fabc");
  });

  it("keeps Área de acesso for logged-in users", () => {
    authState = loggedIn;
    render(<Navigation />);
    expect(screen.getByTestId("nav-profile")).toHaveTextContent("Área de acesso");
  });

  it("labels the login entry Entrar for logged-out visitors", () => {
    render(<Navigation />);
    expect(screen.getByTestId("nav-login")).toHaveTextContent("Entrar");
  });

  it("hides Cadastre-se from logged-in users", () => {
    authState = loggedIn;
    render(<Navigation />);
    expect(screen.queryByTestId("nav-register")).toBeNull();
  });

  it("hides the mobile Cadastre-se pill from logged-in users", () => {
    authState = loggedIn;
    render(<Navigation />);
    expect(screen.queryByTestId("nav-register-mobile")).toBeNull();
  });
});

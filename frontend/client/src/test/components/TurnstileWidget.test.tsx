import { createRef } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act, screen } from "@testing-library/react";

type Opts = {
  sitekey: string;
  callback: (t: string) => void;
  "expired-callback": () => void;
  "error-callback": () => void;
};

const turnstile = {
  render: vi.fn(),
  reset: vi.fn(),
  remove: vi.fn(),
};
let opts: Opts;

async function load(siteKey: string | undefined) {
  vi.resetModules();
  vi.stubEnv("VITE_TURNSTILE_SITE_KEY", siteKey ?? "");
  return import("@/components/TurnstileWidget");
}

beforeEach(() => {
  turnstile.render.mockReset().mockImplementation((_el: unknown, o: Opts) => {
    opts = o;
    return "widget-1";
  });
  turnstile.reset.mockReset();
  turnstile.remove.mockReset();
  (window as unknown as { turnstile: typeof turnstile }).turnstile = turnstile;
});
afterEach(() => {
  vi.unstubAllEnvs();
  delete (window as unknown as { turnstile?: unknown }).turnstile;
  document.head.querySelectorAll("script[data-turnstile]").forEach((s) => s.remove());
});

describe("TurnstileWidget", () => {
  it("renders once with the site key and forwards the token", async () => {
    const { TurnstileWidget } = await load("site-key");
    const onToken = vi.fn();
    const { container } = render(<TurnstileWidget onToken={onToken} />);
    await vi.waitFor(() => expect(turnstile.render).toHaveBeenCalledTimes(1));
    expect(turnstile.render.mock.calls[0][1].sitekey).toBe("site-key");
    expect(container.querySelector('[data-testid="turnstile-widget"]')).not.toBeNull();
    act(() => opts.callback("tok-1"));
    expect(onToken).toHaveBeenLastCalledWith("tok-1");
  });

  it("reset() calls turnstile.reset(widgetId) and clears the token", async () => {
    const { TurnstileWidget } = await load("site-key");
    const onToken = vi.fn();
    const ref = createRef<import("@/components/TurnstileWidget").TurnstileHandle>();
    render(<TurnstileWidget ref={ref} onToken={onToken} />);
    await vi.waitFor(() => expect(turnstile.render).toHaveBeenCalled());
    act(() => opts.callback("tok-1"));
    act(() => ref.current!.reset());
    expect(turnstile.reset).toHaveBeenCalledWith("widget-1");
    expect(onToken).toHaveBeenLastCalledWith(null);
  });

  it("expired and error callbacks clear the token", async () => {
    const { TurnstileWidget } = await load("site-key");
    const onToken = vi.fn();
    render(<TurnstileWidget onToken={onToken} />);
    await vi.waitFor(() => expect(turnstile.render).toHaveBeenCalled());
    act(() => opts.callback("tok-1"));
    act(() => opts["expired-callback"]());
    expect(onToken).toHaveBeenLastCalledWith(null);
    act(() => opts.callback("tok-2"));
    act(() => opts["error-callback"]());
    expect(onToken).toHaveBeenLastCalledWith(null);
  });

  it("removes the widget on unmount", async () => {
    const { TurnstileWidget } = await load("site-key");
    const { unmount } = render(<TurnstileWidget onToken={vi.fn()} />);
    await vi.waitFor(() => expect(turnstile.render).toHaveBeenCalled());
    unmount();
    expect(turnstile.remove).toHaveBeenCalledWith("widget-1");
  });

  it("renders nothing and never loads the script without a site key", async () => {
    const mod = await load(undefined);
    expect(mod.isTurnstileConfigured()).toBe(false);
    const { container } = render(<mod.TurnstileWidget onToken={vi.fn()} />);
    expect(container.firstChild).toBeNull();
    expect(turnstile.render).not.toHaveBeenCalled();
    expect(document.querySelector("script[src*='challenges.cloudflare.com']")).toBeNull();
  });

  it("reports configured when a key exists", async () => {
    const mod = await load("site-key");
    expect(mod.isTurnstileConfigured()).toBe(true);
  });

  it("shows an inline alert and reports a null token when render throws", async () => {
    turnstile.render.mockImplementation(() => {
      throw new Error("boom");
    });
    const { TurnstileWidget } = await load("site-key");
    const onToken = vi.fn();
    render(<TurnstileWidget onToken={onToken} />);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe(
      "Não foi possível carregar a verificação de segurança. Recarregue a página.",
    );
    expect(onToken).toHaveBeenCalledWith(null);
  });

  it("shows the alert when the script fails to load and retries on a later mount", async () => {
    delete (window as unknown as { turnstile?: unknown }).turnstile;
    const { TurnstileWidget } = await load("site-key");
    const first = render(<TurnstileWidget onToken={vi.fn()} />);
    const script = await vi.waitFor(() => {
      const el = document.head.querySelector("script[data-turnstile]");
      expect(el).not.toBeNull();
      return el as HTMLScriptElement;
    });
    act(() => script.onerror?.(new Event("error")));
    expect(await screen.findByRole("alert")).toBeTruthy();
    first.unmount();
    render(<TurnstileWidget onToken={vi.fn()} />);
    await vi.waitFor(() => expect(document.head.querySelector("script[data-turnstile]")).not.toBeNull());
  });
});

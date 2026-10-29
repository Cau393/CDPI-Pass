import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

interface TurnstileApi {
  render: (
    el: HTMLElement,
    options: {
      sitekey: string;
      callback: (token: string) => void;
      "expired-callback": () => void;
      "error-callback": () => void;
    },
  ) => string;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

/** The site key, or "" when none is configured (dev/e2e: the server then skips the check). */
function siteKey(): string {
  return (import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined)?.trim() ?? "";
}

/** False when no site key is set: callers then treat the challenge as satisfied and omit `turnstileToken`. */
export function isTurnstileConfigured(): boolean {
  return siteKey() !== "";
}

let scriptPromise: Promise<TurnstileApi> | null = null;

/** Loads the Turnstile script once; later callers share the same promise. */
function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (!scriptPromise) {
    scriptPromise = new Promise<TurnstileApi>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = SCRIPT_SRC;
      script.async = true;
      script.defer = true;
      script.dataset.turnstile = "true";
      script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("turnstile missing")));
      script.onerror = () => {
        scriptPromise = null; // allow a retry on the next mount
        script.remove();
        reject(new Error("turnstile script failed to load"));
      };
      document.head.appendChild(script);
    });
  }
  return scriptPromise;
}

export interface TurnstileHandle {
  /** Asks for a fresh challenge and clears the token (tokens are single use). */
  reset: () => void;
}

interface TurnstileWidgetProps {
  /** Called with the token when solved, and with `null` when it expires, errors or is reset. */
  onToken: (token: string | null) => void;
  className?: string;
}

export const TurnstileWidget = forwardRef<TurnstileHandle, TurnstileWidgetProps>(function TurnstileWidget(
  { onToken, className },
  ref,
) {
  const key = siteKey();
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const onTokenRef = useRef(onToken);
  onTokenRef.current = onToken;

  useImperativeHandle(ref, () => ({
    reset() {
      onTokenRef.current(null);
      if (widgetIdRef.current !== null && window.turnstile) window.turnstile.reset(widgetIdRef.current);
    },
  }));

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    loadTurnstile()
      .then((api) => {
        if (cancelled || !containerRef.current) return;
        widgetIdRef.current = api.render(containerRef.current, {
          sitekey: key,
          callback: (token) => onTokenRef.current(token),
          "expired-callback": () => onTokenRef.current(null),
          "error-callback": () => onTokenRef.current(null),
        });
      })
      .catch(() => onTokenRef.current(null));
    return () => {
      cancelled = true;
      const id = widgetIdRef.current;
      widgetIdRef.current = null;
      if (id !== null && window.turnstile) window.turnstile.remove(id);
    };
  }, [key]);

  if (!key) return null;
  return <div ref={containerRef} className={className} data-testid="turnstile-widget" />;
});

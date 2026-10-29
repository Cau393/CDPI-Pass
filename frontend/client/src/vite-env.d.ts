/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Cloudflare Turnstile site key; unset in dev/e2e (the check is then skipped). */
  readonly VITE_TURNSTILE_SITE_KEY?: string;
}

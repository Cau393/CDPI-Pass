/**
 * True while the session is still being resolved: a token is stored and `useAuth` is loading. A buy or
 * subscribe click in this window must not open the guest dialog for a logged-in buyer (N2). With no
 * token the visitor is a guest right away.
 */
export function isAuthResolving(isLoading: boolean | undefined): boolean {
  if (!isLoading) return false;
  try {
    return !!localStorage.getItem("token");
  } catch {
    return false;
  }
}

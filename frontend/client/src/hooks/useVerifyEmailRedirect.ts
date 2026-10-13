import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { isEmailNotVerified, verifyEmailHref } from "@/lib/authRedirect";

/**
 * Subscribe, checkout and courtesy redeem answer 403 EMAIL_NOT_VERIFIED for an
 * account that has not typed its e-mail code yet (security backlog #16). The
 * returned handler sends it to the code page, as LoginPage does, with this page
 * as `next`, and says whether it handled the error.
 */
export function useVerifyEmailRedirect(): (error: unknown) => boolean {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  return (error) => {
    if (!isEmailNotVerified(error) || !user?.email) return false;
    toast({ title: "Verificação necessária", description: "Por favor, verifique seu e-mail." });
    setLocation(verifyEmailHref(user.email, window.location.pathname + window.location.search));
    return true;
  };
}

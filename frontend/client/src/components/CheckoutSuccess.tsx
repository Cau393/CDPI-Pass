import { CheckCircle } from "lucide-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { maskEmail } from "@shared/maskEmail";

export interface CheckoutSuccessProps {
  /** "paid": a confirmed payment; "free": a free inscription. */
  variant: "paid" | "free";
  /** No session: offers "Crie sua senha" and "Fechar"; never the profile. */
  guest: boolean;
  /** Where the ticket went. Masked on screen. */
  email?: string | null;
  /** `order.amount` (paid only). */
  amount?: number | string | null;
  /** Logged-in buyer: the caller's success path (toast and /profile). */
  onContinue: () => void;
  /** Guest: dismiss and stay on the page. */
  onClose: () => void;
}

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** Success screen shared by the payment modal and the free guest flow (ADR-017). */
export function CheckoutSuccess({ variant, guest, email, amount, onContinue, onClose }: CheckoutSuccessProps) {
  const [, setLocation] = useLocation();
  const total = variant === "paid" && amount != null && amount !== "" ? Number(amount) : null;
  return (
    <div className="space-y-4 text-center" data-testid="checkout-success">
      <CheckCircle className="mx-auto h-12 w-12 text-green-600" aria-hidden="true" />
      <h3 className="text-xl font-semibold">
        {variant === "paid" ? "Pagamento confirmado!" : "Inscrição confirmada!"}
      </h3>
      {total != null && Number.isFinite(total) ? (
        <p className="text-sm text-muted-foreground" data-testid="text-success-total">
          Total: {money.format(total)}
        </p>
      ) : null}
      {email ? (
        <p className="break-words text-sm text-muted-foreground" data-testid="text-success-email">
          Ingresso enviado para {maskEmail(email)}
        </p>
      ) : null}
      {guest ? (
        <div className="flex flex-col gap-2">
          <Button
            className="min-h-11"
            data-testid="button-success-create-password"
            onClick={() => {
              setLocation("/forgot-password");
              onClose();
            }}
          >
            Crie sua senha
          </Button>
          <Button variant="outline" className="min-h-11" data-testid="button-success-close" onClick={onClose}>
            Fechar
          </Button>
        </div>
      ) : (
        <Button className="min-h-11 w-full" data-testid="button-success-continue" onClick={onContinue}>
          Ver meus ingressos
        </Button>
      )}
    </div>
  );
}

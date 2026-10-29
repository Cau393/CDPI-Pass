import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { isOnlineEvent } from "@shared/eventModality";
import { parseApiError, parseApiErrorMessage } from "@/lib/eventForm";
import {
  identityRequiredMissing,
  needsRegistrationDialog,
  refreshAfterStaleRegistration,
  RELOAD_PAGE_MESSAGE,
} from "@/lib/eventRegistration";
import {
  EventRegistrationDialog,
  type RegistrationConfirmation,
} from "@/components/EventRegistrationDialog";
import { CheckoutSuccess } from "@/components/CheckoutSuccess";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { GuestBuyer } from "@/lib/guestBuyer";
import type { Event } from "@shared/schema";
import type { SystemField } from "@shared/eventRegistrationForm";

type SubscribeResponse = {
  message: string;
  whatsappGroupUrl?: string | null;
};

/**
 * Free inscription: one confirmation click, no payment step, no Asaas call.
 * The server re-checks that the event really is free and that sales are open.
 * Render `registrationDialog`: it asks the event's questions (and a missing
 * document/address) before subscribing.
 *
 * Logged out (ADR-017): `subscribe` opens the same dialog in guest mode (name,
 * e-mail, phone, Turnstile) and posts the buyer with the subscription; success
 * shows `CheckoutSuccess` in place and never navigates to /profile.
 */
export function useFreeSubscribe() {
  const { isAuthenticated, user } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [prompt, setPrompt] = useState<{ event: Event; missing?: SystemField[] } | null>(null);
  const [promptError, setPromptError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  // Kept across a rejected attempt so the reopened dialog is prefilled (R35).
  const [lastBuyer, setLastBuyer] = useState<GuestBuyer | null>(null);
  const [lastAnswers, setLastAnswers] = useState<Record<string, string>>({});
  const [guestDone, setGuestDone] = useState<{ email: string; whatsappGroupUrl: string | null } | null>(null);

  type SubscribeInput = {
    event: Event;
    answers: Record<string, string>;
    buyer?: GuestBuyer;
    turnstileToken?: string;
  };

  const subscribeMutation = useMutation({
    mutationFn: async (input: SubscribeInput) => {
      const body: Record<string, unknown> = { answers: input.answers };
      if (input.buyer) body.buyer = input.buyer;
      if (input.turnstileToken) body.turnstileToken = input.turnstileToken;
      const res = await apiRequest("POST", `/api/events/${input.event.id}/subscribe`, body);
      return res.json() as Promise<SubscribeResponse>;
    },
    onSuccess: async (data, input) => {
      const event = input.event;
      setPrompt(null);
      setPromptError(null);
      setConflict(false);
      if (input.buyer) {
        // Guest: confirm on screen. No session, so no profile to go to, and no Meus Ingressos
        // to reach the WhatsApp group from: the success screen links it.
        setGuestDone({ email: input.buyer.email, whatsappGroupUrl: data?.whatsappGroupUrl ?? null });
        setLastBuyer(null);
        setLastAnswers({});
        return;
      }
      toast({
        title: "Inscrição confirmada!",
        description: isOnlineEvent(event)
          ? "Enviamos o link de acesso por e-mail."
          : "Enviamos seu ingresso com o QR Code por e-mail. Ele também fica no seu perfil.",
      });
      const groupUrl = data?.whatsappGroupUrl;
      if (groupUrl) {
        const opened = window.open(groupUrl, "_blank", "noopener,noreferrer");
        if (opened == null) {
          toast({
            title: "Grupo do WhatsApp",
            description:
              "Não foi possível abrir o grupo automaticamente. Use o botão em Meus Ingressos.",
          });
        }
      }
      await queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      await queryClient.invalidateQueries({
        queryKey: [`/api/events/${event.id}`],
      });
      setLocation("/profile");
    },
    onError: (error: Error, input) => {
      if (input.buyer) {
        setLastBuyer(input.buyer);
        setLastAnswers(input.answers);
      }
      setConflict(parseApiError(error).code === "identity_conflict");
      // The form may have changed since this event was cached. Refetch in the
      // background (the mutation settles now) and swap the fresh event into the
      // open dialog when it arrives.
      void refreshAfterStaleRegistration(error, input.event.id).then(({ stale, event: fresh }) => {
        if (fresh) {
          setPrompt((current) => (current ? { ...current, event: fresh } : current));
        } else if (stale === "form") {
          setPromptError(RELOAD_PAGE_MESSAGE);
        }
      });
      const missing = identityRequiredMissing(error);
      if (missing) {
        // Said inline, so a reopen that asks nothing new is never silent.
        setPromptError(parseApiErrorMessage(error));
        setPrompt({ event: input.event, missing });
        return;
      }
      const message = parseApiErrorMessage(error);
      setPromptError(message);
      toast({
        title: "Não foi possível confirmar",
        description: message,
        variant: "destructive",
      });
    },
  });

  const subscribe = (event: Event) => {
    // A guest always sees the dialog: it is where they type who they are.
    if (!isAuthenticated || needsRegistrationDialog(event, user)) {
      setPromptError(null);
      setConflict(false);
      setPrompt({ event });
      return;
    }
    subscribeMutation.mutate({ event, answers: {} });
  };

  const closeGuestSuccess = () => setGuestDone(null);

  const registrationDialog = (
    <>
    <EventRegistrationDialog
      open={prompt != null}
      event={prompt?.event ?? null}
      missing={prompt?.missing}
      confirmLabel="Confirmar inscrição"
      pending={subscribeMutation.isPending}
      error={promptError}
      turnstile={!isAuthenticated}
      identityConflict={conflict}
      buyer={lastBuyer}
      initialAnswers={lastAnswers}
      onCancel={() => {
        setPrompt(null);
        setPromptError(null);
        setConflict(false);
        setLastBuyer(null);
        setLastAnswers({});
      }}
      onConfirm={({ answers, buyer, turnstileToken }: RegistrationConfirmation) => {
        if (!prompt) return;
        subscribeMutation.mutate({ event: prompt.event, answers, buyer, turnstileToken });
      }}
    />
    <Dialog open={guestDone != null} onOpenChange={(next) => !next && closeGuestSuccess()}>
      <DialogContent className="max-w-md">
        <DialogTitle className="sr-only">Inscrição confirmada</DialogTitle>
        <DialogDescription className="sr-only">Sua inscrição foi confirmada.</DialogDescription>
        {guestDone ? (
          <CheckoutSuccess
            variant="free"
            guest
            email={guestDone.email}
            whatsappGroupUrl={guestDone.whatsappGroupUrl}
            onContinue={closeGuestSuccess}
            onClose={closeGuestSuccess}
          />
        ) : null}
      </DialogContent>
    </Dialog>
    </>
  );

  return {
    subscribe,
    isPending: subscribeMutation.isPending,
    registrationDialog,
  };
}

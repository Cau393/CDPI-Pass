import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { isOnlineEvent } from "@shared/eventModality";
import { loginRequiredDescription } from "@/lib/eventCta";
import { parseApiErrorMessage } from "@/lib/eventForm";
import {
  identityRequiredMissing,
  needsRegistrationDialog,
  refreshAfterStaleRegistration,
} from "@/lib/eventRegistration";
import { EventRegistrationDialog } from "@/components/EventRegistrationDialog";
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
 */
export function useFreeSubscribe() {
  const { isAuthenticated, user } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [prompt, setPrompt] = useState<{ event: Event; missing?: SystemField[] } | null>(null);
  const [promptError, setPromptError] = useState<string | null>(null);

  const subscribeMutation = useMutation({
    mutationFn: async (input: { event: Event; answers: Record<string, string> }) => {
      const res = await apiRequest(
        "POST",
        `/api/events/${input.event.id}/subscribe`,
        { answers: input.answers },
      );
      return res.json() as Promise<SubscribeResponse>;
    },
    onSuccess: async (data, input) => {
      const event = input.event;
      setPrompt(null);
      setPromptError(null);
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
    onError: async (error: Error, input) => {
      // The form may have changed since this event was cached: retry with the fresh one.
      const fresh = await refreshAfterStaleRegistration(error, input.event.id);
      const event = fresh ?? input.event;
      const missing = identityRequiredMissing(error);
      if (missing) {
        // Said inline, so a reopen that asks nothing new is never silent.
        setPromptError(parseApiErrorMessage(error));
        setPrompt({ event, missing });
        return;
      }
      const message = parseApiErrorMessage(error);
      setPromptError(message);
      if (fresh) setPrompt((current) => (current ? { ...current, event: fresh } : current));
      toast({
        title: "Não foi possível confirmar",
        description: message,
        variant: "destructive",
      });
    },
  });

  const subscribe = (event: Event, loginNext?: string) => {
    if (!isAuthenticated) {
      toast({
        title: "Login necessário",
        description: loginRequiredDescription(true),
        variant: "destructive",
      });
      const next =
        loginNext ?? `${window.location.pathname}${window.location.search}`;
      setLocation(`/login?next=${encodeURIComponent(next)}`);
      return;
    }
    if (needsRegistrationDialog(event, user)) {
      setPromptError(null);
      setPrompt({ event });
      return;
    }
    subscribeMutation.mutate({ event, answers: {} });
  };

  const registrationDialog = (
    <EventRegistrationDialog
      open={prompt != null}
      event={prompt?.event ?? null}
      missing={prompt?.missing}
      confirmLabel="Confirmar inscrição"
      pending={subscribeMutation.isPending}
      error={promptError}
      onCancel={() => {
        setPrompt(null);
        setPromptError(null);
      }}
      onConfirm={(answers) => {
        if (!prompt) return;
        subscribeMutation.mutate({ event: prompt.event, answers });
      }}
    />
  );

  return {
    subscribe,
    isPending: subscribeMutation.isPending,
    registrationDialog,
  };
}

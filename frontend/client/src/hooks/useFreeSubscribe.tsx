import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { isOnlineEvent } from "@shared/eventModality";
import { loginRequiredDescription } from "@/lib/eventCta";
import { parseApiErrorMessage } from "@/lib/eventForm";
import { InterestAreaDialog } from "@/components/InterestAreaDialog";
import type { Event } from "@shared/schema";

type SubscribeResponse = {
  message: string;
  whatsappGroupUrl?: string | null;
};

/**
 * Free inscription: one confirmation click, no payment step, no Asaas call.
 * The server re-checks that the event really is free and that sales are open.
 */
export function useFreeSubscribe() {
  const { isAuthenticated } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [promptEvent, setPromptEvent] = useState<Event | null>(null);
  const [interestError, setInterestError] = useState<string | null>(null);

  const subscribeMutation = useMutation({
    mutationFn: async (input: { event: Event; interestArea?: string }) => {
      const body = input.interestArea
        ? { interestArea: input.interestArea }
        : undefined;
      const res = await apiRequest(
        "POST",
        `/api/events/${input.event.id}/subscribe`,
        body,
      );
      return res.json() as Promise<SubscribeResponse>;
    },
    onSuccess: async (data, input) => {
      const event = input.event;
      setPromptEvent(null);
      setInterestError(null);
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
    onError: (error: Error) => {
      const message = parseApiErrorMessage(error);
      setInterestError(message);
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
    if ((event.interestAreas?.length ?? 0) > 0) {
      setInterestError(null);
      setPromptEvent(event);
      return;
    }
    subscribeMutation.mutate({ event });
  };

  const interestDialog = (
    <InterestAreaDialog
      open={promptEvent != null}
      options={promptEvent?.interestAreas ?? []}
      confirmLabel="Confirmar inscrição"
      pending={subscribeMutation.isPending}
      error={interestError}
      onCancel={() => {
        setPromptEvent(null);
        setInterestError(null);
      }}
      onConfirm={(interestArea) => {
        if (!promptEvent) return;
        subscribeMutation.mutate({ event: promptEvent, interestArea });
      }}
    />
  );

  return {
    subscribe,
    isPending: subscribeMutation.isPending,
    interestDialog,
  };
}

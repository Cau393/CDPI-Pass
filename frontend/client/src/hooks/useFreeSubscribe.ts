import { useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { isOnlineEvent } from "@shared/eventModality";
import { loginRequiredDescription } from "@/lib/eventCta";
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

  const subscribeMutation = useMutation({
    mutationFn: async (event: Event) => {
      const res = await apiRequest("POST", `/api/events/${event.id}/subscribe`);
      return res.json() as Promise<SubscribeResponse>;
    },
    onSuccess: async (data, event) => {
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
      toast({
        title: "Não foi possível confirmar",
        description: error.message,
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
    subscribeMutation.mutate(event);
  };

  return {
    subscribe,
    isPending: subscribeMutation.isPending,
  };
}

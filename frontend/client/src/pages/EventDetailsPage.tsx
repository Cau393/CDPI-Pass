import { useParams, useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import EventCoverImage from "@/components/EventCoverImage";
import { Button } from "@/components/ui/button";
import { Calendar, MapPin, Users, Clock, ArrowLeft, Loader2 } from "lucide-react";
import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import PaymentModal from "@/components/PaymentModal";
import type { Event, Order } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import EventDescriptionDisplay from "@/components/EventDescriptionDisplay";

// ✅ Extend Event to include promoCode
interface EventWithPromo extends Event {
  promoCode?: string | null;
}

export default function EventDetailsPage() {
  const { id } = useParams();
  const [, setLocation] = useLocation();
  const { isAuthenticated } = useAuth();
  const { toast } = useToast();

  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [promoCode, setPromoCode] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<EventWithPromo | null>(null);

  // ✅ Extract ?promo=XXX from the URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("promo");
    setPromoCode(code);
  }, []);

  // ✅ Fetch main event details
  const { data: event, isLoading, error } = useQuery<Event>({
    queryKey: [`/api/events/${id}`],
    enabled: !!id,
  });

  const { data: userOrdersData } = useQuery<{ orders: Order[] }>({
    queryKey: ["/api/orders", "event-details-gate"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/orders?page=1");
      return res.json() as Promise<{ orders: Order[] }>;
    },
    enabled: isAuthenticated && !!event?.id,
  });

  const hasPaidForEvent =
    !!event?.id &&
    (userOrdersData?.orders?.some(
      (o) => o.eventId === event.id && o.status === "paid",
    ) ??
      false);

  // ✅ Fetch promo link details only if a promo code exists
  const { data: promoLink } = useQuery({
    queryKey: ["/api/courtesy-links", promoCode],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/courtesy-links/${promoCode}`);
      return res.json();
    },
    enabled: !!promoCode,
  });

  const displayPrice = promoLink?.overridePrice 
    ? parseFloat(promoLink.overridePrice) 
    : (event ? parseFloat(event.price) : 0);

  // Both flags are authoritative on the server; these only drive the UI.
  const isFree = event?.isFree === true;
  const salesClosed = event?.salesClosed === true;

  /**
   * Free inscription: one confirmation click, no payment step, no Asaas call.
   * The server re-checks that the event really is free and that sales are open.
   */
  const subscribeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/events/${id}/subscribe`);
      return res.json() as Promise<{ message: string }>;
    },
    onSuccess: async () => {
      toast({
        title: "Inscrição confirmada!",
        description:
          "Enviamos seu ingresso com o QR Code por e-mail. Ele também fica no seu perfil.",
      });
      await queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      await queryClient.invalidateQueries({ queryKey: [`/api/events/${id}`] });
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

  const handleFreeSubscribe = () => {
    if (!isAuthenticated) {
      toast({
        title: "Login necessário",
        description: "Faça login ou cadastre-se para se inscrever",
        variant: "destructive",
      });
      const next = `${window.location.pathname}${window.location.search}`;
      setLocation(`/login?next=${encodeURIComponent(next)}`);
      return;
    }
    subscribeMutation.mutate();
  };

  const [modalData, setModalData] = useState<{
    event: Event;
    promoCode: string | null;
    price: number;
    } | null>(null);

  // ✅ Updated handleBuyTicket to accept event + promo
  const handleBuyTicket = (selected: Event, code: string | null) => {
    if (!isAuthenticated) {
      toast({
        title: "Login necessário",
        description: "Faça login ou cadastre-se para comprar ingressos",
        variant: "destructive",
      });
      const next = `${window.location.pathname}${window.location.search}`;
      setLocation(`/login?next=${encodeURIComponent(next)}`);
      return;
    }

    if (!event) return;

    setModalData({
      event: event,
      promoCode: promoCode,
      price: displayPrice,
    });

    // Store the event and promo in state
    setSelectedEvent({ ...selected, promoCode: code });
    setIsPaymentModalOpen(true);
  };

  const EVENT_TZ = "America/Sao_Paulo";

  const formatDate = (date: Date | string) =>
    new Date(date).toLocaleDateString("pt-BR", {
      timeZone: EVENT_TZ,
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });

  const formatTime = (date: Date | string) =>
    new Date(date).toLocaleTimeString("pt-BR", {
      timeZone: EVENT_TZ,
      hour: "2-digit",
      minute: "2-digit",
    });

  const formatCurrency = (value: number | string) => {
    const numValue = typeof value === "string" ? parseFloat(value) : value;
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(numValue);
  };

  // Loading skeleton
  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <Card className="animate-pulse">
          <div className="h-64 bg-gray-300 rounded-t-lg"></div>
          <CardContent className="p-8">
            <div className="h-8 bg-gray-300 rounded mb-4"></div>
            <div className="h-4 bg-gray-300 rounded mb-2"></div>
            <div className="h-4 bg-gray-300 rounded mb-2"></div>
            <div className="h-4 bg-gray-300 rounded"></div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Error or missing event
  if (error || !event) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-red-600 text-lg mb-4">Evento não encontrado</p>
            <Button onClick={() => setLocation("/")} variant="outline">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Voltar aos eventos
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const spotsLeft = event.maxAttendees
    ? Math.max(0, event.maxAttendees - (event.currentAttendees || 0))
    : null;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Back button */}
      <Button
        onClick={() => setLocation("/")}
        variant="ghost"
        className="mb-6"
        data-testid="button-back"
      >
        <ArrowLeft className="h-4 w-4 mr-2" />
        Voltar aos eventos
      </Button>

      <Card className="overflow-hidden">
        {/* Event Image */}
        {event.imageUrl && (
          <EventCoverImage
            src={event.imageUrl}
            alt={event.title}
            priority
            className="aspect-video w-full"
            data-testid="img-event-cover"
          />
        )}

        <CardContent className="p-8">
          {/* Title and Info */}
          <div className="mb-6">
            <h1 className="text-3xl font-bold text-gray-900 mb-4">
              {event.title}
            </h1>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-gray-600">
              <div className="flex items-center">
                <Calendar className="h-5 w-5 mr-3 text-primary" />
                <span>{formatDate(event.date)}</span>
              </div>
              <div className="flex items-center">
                <Clock className="h-5 w-5 mr-3 text-primary" />
                <span>{formatTime(event.date)}</span>
              </div>
              <div className="flex items-center">
                <MapPin className="h-5 w-5 mr-3 text-primary" />
                <span>{event.location}</span>
              </div>
              {spotsLeft !== null && (
                <div className="flex items-center">
                  <Users className="h-5 w-5 mr-3 text-primary" />
                  <span>
                    {spotsLeft > 0
                      ? `${spotsLeft} vagas restantes`
                      : "Esgotado"}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Description */}
          <div className="mb-10">
            <h2 className="text-xl font-semibold mb-4">Sobre o evento</h2>
            <EventDescriptionDisplay
              html={event.description}
              className={cn(
                "text-gray-700 whitespace-pre-line",
                "[&_p]:text-[17px] [&_p]:my-0.5 [&_p]:leading-[1.3] [&_p:first-child]:mt-0 [&_p:last-child]:mb-0",
                "[&_br]:block [&_br]:mb-[0.65em]",
              )}
            />
          </div>

          {/* Price and Buy Button */}
          <div className="border-t pt-6">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div>
                <p className="text-sm text-gray-600 mb-1">
                  {isFree ? "Inscrição" : "Valor do ingresso"}
                </p>
                <p className="text-3xl font-bold text-primary">
                  {isFree ? "Grátis" : formatCurrency(displayPrice)}
                </p>
                {promoLink && !isFree && (
                  <p className="text-sm text-green-600">
                    Promoção aplicada ({promoCode})
                  </p>
                )}
                {/* Free events skip the R$5 convenience fee entirely. */}
                {!isFree && (
                  <p className="text-xs text-gray-500 mt-1">
                    + taxa de conveniência de R$ 5,00
                  </p>
                )}
                {isFree && (
                  <p className="text-xs text-gray-500 mt-1">
                    Sem taxa de conveniência
                  </p>
                )}
              </div>

              <Button
                onClick={() => {
                  if (isFree) {
                    handleFreeSubscribe();
                    return;
                  }
                  handleBuyTicket(event, promoCode);
                }}
                className="bg-primary hover:bg-secondary text-white px-8 py-6 text-lg"
                disabled={
                  spotsLeft === 0 ||
                  hasPaidForEvent ||
                  salesClosed ||
                  subscribeMutation.isPending
                }
                data-testid="button-event-cta"
              >
                {subscribeMutation.isPending && (
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                )}
                {hasPaidForEvent
                  ? isFree
                    ? "Inscrição confirmada"
                    : "Ingresso já confirmado"
                  : spotsLeft === 0
                    ? "Evento Esgotado"
                    : salesClosed
                      ? "Vendas encerradas"
                      : subscribeMutation.isPending
                        ? "Confirmando..."
                        : isFree
                          ? "Confirmar inscrição"
                          : "Comprar Ingresso"}
              </Button>
              {hasPaidForEvent && (
                <p className="text-sm text-muted-foreground text-center sm:text-right w-full sm:w-auto">
                  Você já possui inscrição confirmada para este evento.
                </p>
              )}
              {!hasPaidForEvent && salesClosed && (
                <p
                  className="text-sm text-muted-foreground text-center sm:text-right w-full sm:w-auto"
                  data-testid="text-sales-closed"
                >
                  As vendas para este evento foram encerradas.
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {modalData && (
        <PaymentModal
          event={modalData.event}
          promoCode={modalData.promoCode}
          displayPrice={modalData.price}           
          isOpen={isPaymentModalOpen}
          onClose={() => setIsPaymentModalOpen(false)}
          onSuccess={() => {
            toast({
              title: "Pagamento iniciado!",
              description:
                "Acompanhe o status do seu pedido na página de perfil.",
            });
            setIsPaymentModalOpen(false);
            setLocation("/profile");
          }}
        />
      )}
    </div>
  );
}

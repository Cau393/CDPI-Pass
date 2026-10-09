import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import EventCoverImage from "@/components/EventCoverImage";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar, MapPin, Users, Clock, ArrowLeft, Loader2 } from "lucide-react";
import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import PaymentModal from "@/components/PaymentModal";
import type { Event, Order } from "@shared/schema";
import { isOnlineEvent, publicEventLocationLabel } from "@shared/eventModality";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import EventDescriptionDisplay from "@/components/EventDescriptionDisplay";
import SiteFooter from "@/components/SiteFooter";
import { useFreeSubscribe } from "@/hooks/useFreeSubscribe";
import { EventRegistrationDialog } from "@/components/EventRegistrationDialog";
import { needsRegistrationDialog } from "@/lib/eventRegistration";
import type { SystemField } from "@shared/eventRegistrationForm";
import { FOREIGN_PAID_UNAVAILABLE_MESSAGE, foreignPaidCheckoutBlocked } from "@shared/foreignCheckout";
import {
  COURTESY_CODE_INVALID_COPY,
  courtesyLoginRequiredDescription,
  courtesyPriceLabel,
  courtesyRedeemCtaLabel,
  eventAcquisitionCtaLabel,
  eventFeeLabel,
  eventPriceLabel,
  isEventSoldOut,
  isFreeEvent,
  loginRequiredDescription,
} from "@/lib/eventCta";

// ✅ Extend Event to include promoCode
interface EventWithPromo extends Event {
  promoCode?: string | null;
}

export default function EventDetailsPage() {
  const { id } = useParams();
  const [, setLocation] = useLocation();
  const { isAuthenticated, user } = useAuth();
  const { toast } = useToast();

  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [promoCode, setPromoCode] = useState<string | null>(null);
  const [courtesyCode, setCourtesyCode] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<EventWithPromo | null>(null);
  // Paid path: registration questions first, then the payment modal.
  const [registrationPrompt, setRegistrationPrompt] = useState<{
    missing?: SystemField[];
    message?: string;
  } | null>(null);
  const [checkoutAnswers, setCheckoutAnswers] = useState<Record<string, string>>({});

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setPromoCode(params.get("promo"));
    setCourtesyCode(params.get("cortesia"));
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

  const {
    data: courtesyLink,
    error: courtesyQueryError,
    isError: courtesyIsError,
    isLoading: courtesyIsLoading,
  } = useQuery({
    queryKey: ["/api/courtesy-links", "cortesia-entry", courtesyCode],
    queryFn: async () => {
      const response = await fetch(
        `/api/courtesy-links/${encodeURIComponent(courtesyCode!)}`,
      );
      if (!response.ok) {
        let message = COURTESY_CODE_INVALID_COPY;
        try {
          const body = await response.json();
          if (typeof body?.message === "string" && body.message.trim() !== "") {
            message = body.message;
          }
        } catch {
          // Keep the shared invalid-code sentence.
        }
        throw new Error(message);
      }
      return response.json() as Promise<{
        overridePrice?: string | number | null;
      }>;
    },
    enabled: !!courtesyCode,
    retry: false,
  });

  useEffect(() => {
    if (!courtesyCode || !courtesyLink?.overridePrice || !id) return;
    const code = courtesyCode;
    setCourtesyCode(null);
    setPromoCode(code);
    setLocation(`/event/${id}?promo=${encodeURIComponent(code)}`);
  }, [courtesyCode, courtesyLink, id, setLocation]);

  const {
    subscribe,
    isPending: isSubscribePending,
    registrationDialog,
  } = useFreeSubscribe();

  const displayPrice = promoLink?.overridePrice 
    ? parseFloat(promoLink.overridePrice) 
    : (event ? parseFloat(event.price) : 0);

  // Both flags are authoritative on the server; these only drive the UI.
  const isFree = isFreeEvent(event ?? {});
  const salesClosed = event?.salesClosed === true;
  const soldOut = event ? isEventSoldOut(event) : false;
  const courtesyEntryActive = !!courtesyCode;
  const showCourtesyOffer =
    courtesyEntryActive && !(courtesyLink && courtesyLink.overridePrice);
  const courtesyBlocked =
    courtesyEntryActive &&
    (courtesyIsError || courtesyIsLoading || !courtesyLink);
  const courtesyErrorMessage =
    showCourtesyOffer && courtesyIsError
      ? courtesyQueryError instanceof Error && courtesyQueryError.message.trim() !== ""
        ? courtesyQueryError.message
        : COURTESY_CODE_INVALID_COPY
      : null;
  const feeLabel =
    event && !showCourtesyOffer ? eventFeeLabel(event, "detailed") : null;
  // Paid checkout (a promo price included); free sign-up and courtesy redeem stay open.
  const foreignPaidBlocked = !isFree && !showCourtesyOffer && foreignPaidCheckoutBlocked(user);

  const handleFreeSubscribe = () => {
    if (!event) return;
    subscribe(event);
  };

  const handleRedeemCourtesy = () => {
    if (!courtesyCode || courtesyBlocked) return;
    if (!isAuthenticated) {
      toast({
        title: "Login necessário",
        description: courtesyLoginRequiredDescription(),
        variant: "destructive",
      });
      const next = `${window.location.pathname}${window.location.search}`;
      setLocation(`/login?next=${encodeURIComponent(next)}`);
      return;
    }
    setLocation(`/cortesia?code=${encodeURIComponent(courtesyCode)}`);
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
        description: loginRequiredDescription(false),
        variant: "destructive",
      });
      const next = `${window.location.pathname}${window.location.search}`;
      setLocation(`/login?next=${encodeURIComponent(next)}`);
      return;
    }

    if (!event) return;
    if (isFreeEvent(event)) return;
    if (foreignPaidCheckoutBlocked(user)) {
      toast({
        title: "Compra indisponível",
        description: FOREIGN_PAID_UNAVAILABLE_MESSAGE,
        variant: "destructive",
      });
      return;
    }

    // Store the event and promo in state
    setSelectedEvent({ ...selected, promoCode: code });
    if (needsRegistrationDialog(event, user)) {
      setRegistrationPrompt({});
      return;
    }
    openCheckout({});
  };

  const openCheckout = (answers: Record<string, string>) => {
    if (!event) return;
    setCheckoutAnswers(answers);
    setModalData({
      event: event,
      promoCode: promoCode,
      price: displayPrice,
    });
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

  // Loading skeleton
  if (isLoading) {
    return (
      <>
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
        <SiteFooter />
      </>
    );
  }

  // Error or missing event
  if (error || !event) {
    return (
      <>
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
        <SiteFooter />
      </>
    );
  }

  const spotsLeft = event.maxAttendees
    ? Math.max(0, event.maxAttendees - (event.currentAttendees || 0))
    : null;

  return (
    <>
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
            {isOnlineEvent(event) && (
              <Badge className="mb-4 bg-sky-600 text-white hover:bg-sky-600">
                Evento Online
              </Badge>
            )}
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
                <span>{publicEventLocationLabel(event)}</span>
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
                  {showCourtesyOffer
                    ? courtesyPriceLabel()
                    : eventPriceLabel(event, displayPrice)}
                </p>
                {promoLink && !isFree && (
                  <p className="text-sm text-green-600">
                    Promoção aplicada ({promoCode})
                  </p>
                )}
                {feeLabel && (
                  <p className="text-xs text-gray-500 mt-1">
                    {feeLabel}
                  </p>
                )}
              </div>

              <Button
                onClick={() => {
                  if (showCourtesyOffer) {
                    handleRedeemCourtesy();
                    return;
                  }
                  if (isFree) {
                    handleFreeSubscribe();
                    return;
                  }
                  handleBuyTicket(event, promoCode);
                }}
                className="bg-primary hover:bg-secondary text-white px-8 py-6 text-lg"
                disabled={
                  showCourtesyOffer
                    ? soldOut || hasPaidForEvent || courtesyBlocked
                    : soldOut ||
                      hasPaidForEvent ||
                      salesClosed ||
                      isSubscribePending ||
                      foreignPaidBlocked
                }
                data-testid="button-event-cta"
              >
                {isSubscribePending && !showCourtesyOffer && (
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                )}
                {showCourtesyOffer
                  ? courtesyRedeemCtaLabel({
                      isFree,
                      confirmed: hasPaidForEvent,
                      soldOut,
                    })
                  : eventAcquisitionCtaLabel({
                      isFree,
                      confirmed: hasPaidForEvent,
                      soldOut,
                      salesClosed,
                      pending: isSubscribePending,
                    })}
              </Button>
              {hasPaidForEvent && (
                <p className="text-sm text-muted-foreground text-center sm:text-right w-full sm:w-auto">
                  Você já possui inscrição confirmada para este evento.
                </p>
              )}
              {!hasPaidForEvent && foreignPaidBlocked && (
                <p
                  className="text-sm text-muted-foreground text-center sm:text-right w-full sm:w-auto"
                  data-testid="foreign-paid-unavailable"
                >
                  {FOREIGN_PAID_UNAVAILABLE_MESSAGE}
                </p>
              )}
              {courtesyErrorMessage && (
                <p
                  className="text-sm text-red-600 text-center sm:text-right w-full sm:w-auto"
                  data-testid="text-courtesy-error"
                >
                  {courtesyErrorMessage}
                </p>
              )}
              {!hasPaidForEvent && salesClosed && !showCourtesyOffer && (
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

      {modalData && !isFreeEvent(modalData.event) && (
        <PaymentModal
          event={modalData.event}
          promoCode={modalData.promoCode}
          displayPrice={modalData.price}           
          answers={checkoutAnswers}
          isOpen={isPaymentModalOpen}
          onClose={() => setIsPaymentModalOpen(false)}
          onIdentityRequired={(missing, message) => {
            setIsPaymentModalOpen(false);
            setRegistrationPrompt({ missing, message });
          }}
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
      <EventRegistrationDialog
        open={registrationPrompt != null}
        event={event}
        missing={registrationPrompt?.missing}
        error={registrationPrompt?.message}
        confirmLabel="Continuar para pagamento"
        onCancel={() => setRegistrationPrompt(null)}
        onConfirm={(answers) => {
          setRegistrationPrompt(null);
          openCheckout(answers);
        }}
      />
      {registrationDialog}
    </div>
      <SiteFooter />
    </>
  );
}

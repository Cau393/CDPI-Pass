import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar, MapPin, Users, Clock, ArrowLeft } from "lucide-react";
import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import PaymentModal from "@/components/PaymentModal";
import type { Event } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";

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
      setLocation("/login");
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

  const formatDate = (date: Date | string) =>
    new Date(date).toLocaleDateString("pt-BR", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });

  const formatTime = (date: Date | string) => {
    const dateObj = new Date(date);
    const timeStr =
      typeof date === "string"
        ? date.split("T")[1] || date.split(" ")[1]
        : null;

    if (timeStr) {
      const [hours, minutes] = timeStr.split(":");
      return `${hours}:${minutes}`;
    }

    return dateObj.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

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
          <div className="h-64 md:h-96 overflow-hidden">
            <img
              src={event.imageUrl}
              alt={event.title}
              className="w-full h-full object-cover"
            />
          </div>
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
          <div className="mb-8">
            <h2 className="text-xl font-semibold mb-4">Sobre o evento</h2>
            <p className="text-gray-700 whitespace-pre-wrap leading-relaxed">
              {event.description}
            </p>
          </div>

          {/* Price and Buy Button */}
          <div className="border-t pt-6">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div>
                <p className="text-sm text-gray-600 mb-1">Valor do ingresso</p>
                <p className="text-3xl font-bold text-primary">
                  {formatCurrency(displayPrice)}
                </p>
                {promoLink && (
                  <p className="text-sm text-green-600">
                    Promoção aplicada ({promoCode})
                  </p>
                )}
                <p className="text-xs text-gray-500 mt-1">
                  + taxa de conveniência de R$ 5,00
                </p>
              </div>

              {/* ✅ Updated Buy Button */}
              <Button
                onClick={() => handleBuyTicket(event, promoCode)}
                className="bg-primary hover:bg-secondary text-white px-8 py-6 text-lg"
                disabled={spotsLeft === 0}
              >
                {spotsLeft === 0
                  ? "Evento Esgotado"
                  : "Comprar Ingresso"}
              </Button>
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

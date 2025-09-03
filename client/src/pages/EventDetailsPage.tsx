import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar, MapPin, Users, Clock, ArrowLeft } from "lucide-react";
import { useLocation } from "wouter";
import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import PaymentModal from "@/components/PaymentModal";
import type { Event } from "@shared/schema";

export default function EventDetailsPage() {
  const { id } = useParams();
  const [, setLocation] = useLocation();
  const { isAuthenticated } = useAuth();
  const { toast } = useToast();
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);

  const { data: event, isLoading, error } = useQuery<Event>({
    queryKey: [`/api/events/${id}`],
    enabled: !!id,
  });

  const handleBuyTicket = () => {
    if (!isAuthenticated) {
      toast({
        title: "Login necessário",
        description: "Faça login ou cadastre-se para comprar ingressos",
        variant: "destructive",
      });
      setLocation("/login");
      return;
    }
    setIsPaymentModalOpen(true);
  };

  const formatDate = (date: Date | string) => {
    return new Date(date).toLocaleDateString("pt-BR", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const formatTime = (date: Date | string) => {
    return new Date(date).toLocaleTimeString("pt-BR", {
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
          {/* Title and Status */}
          <div className="mb-6">
            <div className="mb-4">
              <h1 className="text-3xl font-bold text-gray-900" data-testid="text-event-title">
                {event.title}
              </h1>
            </div>
            
            {/* Event Info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-gray-600">
              <div className="flex items-center">
                <Calendar className="h-5 w-5 mr-3 text-primary" />
                <span data-testid="text-event-date">{formatDate(event.date)}</span>
              </div>
              <div className="flex items-center">
                <Clock className="h-5 w-5 mr-3 text-primary" />
                <span data-testid="text-event-time">{formatTime(event.date)}</span>
              </div>
              <div className="flex items-center">
                <MapPin className="h-5 w-5 mr-3 text-primary" />
                <span data-testid="text-event-location">{event.location}</span>
              </div>
              {spotsLeft !== null && (
                <div className="flex items-center">
                  <Users className="h-5 w-5 mr-3 text-primary" />
                  <span data-testid="text-spots-left">
                    {spotsLeft > 0 ? `${spotsLeft} vagas restantes` : "Esgotado"}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Description */}
          <div className="mb-8">
            <h2 className="text-xl font-semibold mb-4">Sobre o evento</h2>
            <p className="text-gray-700 whitespace-pre-wrap leading-relaxed" data-testid="text-event-description">
              {event.description}
            </p>
          </div>

          {/* Price and Buy Button */}
          <div className="border-t pt-6">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div>
                <p className="text-sm text-gray-600 mb-1">Valor do ingresso</p>
                <p className="text-3xl font-bold text-primary" data-testid="text-event-price">
                  {formatCurrency(event.price)}
                </p>
                <p className="text-xs text-gray-500 mt-1">+ taxa de conveniência de R$ 5,00</p>
              </div>
              <Button
                onClick={handleBuyTicket}
                className="bg-primary hover:bg-secondary text-white px-8 py-6 text-lg"
                disabled={spotsLeft === 0}
                data-testid="button-buy-ticket"
              >
                {spotsLeft === 0 ? "Evento Esgotado" : "Comprar Ingresso"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Payment Modal */}
      {event && (
        <PaymentModal
          event={event}
          isOpen={isPaymentModalOpen}
          onClose={() => setIsPaymentModalOpen(false)}
          onSuccess={() => {
            toast({
              title: "Pagamento iniciado!",
              description: "Acompanhe o status do seu pedido na página de perfil.",
            });
            setIsPaymentModalOpen(false);
            setLocation("/profile");
          }}
        />
      )}
    </div>
  );
}
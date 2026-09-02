import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { MapPin, Calendar, ChevronDown, ChevronUp } from "lucide-react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import PaymentModal from "@/components/PaymentModal";
import type { Event, Order } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import EventCoverImage from "@/components/EventCoverImage";
import SiteFooter from "@/components/SiteFooter";
import { eventDescriptionPlainText } from "@/lib/eventDescriptionHtml";

const MAIN_EVENT_DESCRIPTION_MAX_LENGTH = 90;

function getMainEventDescriptionTeaser(html: string): string {
  const text = eventDescriptionPlainText(html);
  if (text.length <= MAIN_EVENT_DESCRIPTION_MAX_LENGTH) return text;

  let clipped = text
    .slice(0, MAIN_EVENT_DESCRIPTION_MAX_LENGTH - 1)
    .trimEnd();

  // Avoid cutting a UTF-16 surrogate pair (for example, an emoji).
  const lastCodeUnit = clipped.charCodeAt(clipped.length - 1);
  if (lastCodeUnit >= 0xd800 && lastCodeUnit <= 0xdbff) {
    clipped = clipped.slice(0, -1);
  }

  const wordBoundary = clipped.lastIndexOf(" ");
  if (wordBoundary >= Math.floor(MAIN_EVENT_DESCRIPTION_MAX_LENGTH * 0.65)) {
    clipped = clipped.slice(0, wordBoundary);
  }

  return `${clipped.trimEnd()}…`;
}

export default function HomePage() {
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [expandedFAQ, setExpandedFAQ] = useState<string | null>(null);
  const [promoCode, setPromoCode] = useState<string | null>(null);
  const [, setLocation] = useLocation();
  const { isAuthenticated } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setPromoCode(params.get("promo"));
  }, []);

  const { data: events, isLoading } = useQuery<Event[]>({
    queryKey: ["/api/events"],
  });

  const { data: userOrdersData } = useQuery<{ orders: Order[] }>({
    queryKey: ["/api/orders", "home-gate"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/orders?page=1");
      return res.json() as Promise<{ orders: Order[] }>;
    },
    enabled: isAuthenticated,
  });

  const paidEventIds = new Set(
    userOrdersData?.orders
      ?.filter((o) => o.status === "paid")
      .map((o) => o.eventId) ?? [],
  );

  const { data: promoLink } = useQuery({
    queryKey: ["/api/courtesy-links", promoCode],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/courtesy-links/${promoCode}`);
      return res.json();
    },
    enabled: !!promoCode,
  });

  /**
   * List price vs promo override (aligned with EventDetailsPage).
   * On the home page we only apply override when the link is for that event (sidebar may list others).
   */
  const displayPriceForEvent = (ev: Event) => {
    const override = promoLink?.overridePrice;
    const linkEventId = promoLink?.eventId as string | undefined;
    if (
      override != null &&
      override !== "" &&
      linkEventId != null &&
      linkEventId === ev.id
    ) {
      return parseFloat(String(override));
    }
    return parseFloat(String(ev.price));
  };

  const handleBuyTicket = (event: Event) => {
    if (!isAuthenticated) {
      toast({
        title: "Login necessário",
        description: "Faça login ou cadastre-se para comprar ingressos",
        variant: "destructive",
      });
      const qs = promoCode ? `?promo=${encodeURIComponent(promoCode)}` : "";
      const next = `/event/${event.id}${qs}`;
      setLocation(`/login?next=${encodeURIComponent(next)}`);
      return;
    }
    setSelectedEvent(event);
    setIsPaymentModalOpen(true);
  };

  const sortedEvents = events
  ?.filter(event => new Date(event.date) > new Date())
  .filter(
    (event) =>
      event.title !== 'Meeting CDPI 2026'
  )
  ?.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const mainEvent = sortedEvents?.[0];
  const upcomingEvents = sortedEvents?.slice(1, 2) || [];

  return (
    <main className="min-h-screen bg-gray-50">
      {/* Hero Section with Events */}
      <div className="bg-[rgb(25,30,94)]"> 
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Main Event Card */}
            <div className="lg:col-span-2">
              {isLoading ? (
                <div className="bg-white rounded-lg shadow-lg animate-pulse h-96"></div>
              ) : mainEvent ? (
                <div 
                  className="bg-white rounded-lg shadow-lg overflow-hidden relative cursor-pointer hover:shadow-xl transition-shadow"
                  onClick={() => setLocation(`/event/${mainEvent.id}`)}
                  data-testid={`card-main-event-${mainEvent.id}`}
                >

                  <div
                    className="grid grid-cols-1 md:grid-cols-[minmax(0,55%)_minmax(0,45%)] md:items-stretch"
                    data-testid="main-event-layout"
                  >
                    <EventCoverImage
                      src={mainEvent.imageUrl}
                      alt={mainEvent.title}
                      priority
                      data-testid="img-main-event"
                      className="aspect-video w-full md:aspect-auto md:h-full md:min-h-0"
                      fallback={
                        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-primary to-secondary p-8">
                          <div className="text-center text-white">
                            <div className="mx-auto mb-4 flex h-48 w-48 items-center justify-center rounded-full bg-white/20">
                              <span className="text-6xl">📅</span>
                            </div>
                            <p className="text-sm">Evento</p>
                            <p className="font-bold text-lg">CDPI</p>
                          </div>
                        </div>
                      }
                    />

                    {/* Event Details — mobile unchanged from push; desktop omits body copy */}
                    <div className="min-w-0 p-5 sm:p-6 md:flex md:h-full md:flex-col md:justify-between md:p-4 xl:p-6">
                      <h2 className="mb-2 line-clamp-3 text-2xl font-bold leading-tight text-gray-900 md:line-clamp-2 md:text-xl xl:text-2xl">
                        {mainEvent.title}
                      </h2>
                      <p
                        className="mb-4 line-clamp-2 overflow-hidden text-sm text-gray-600 md:hidden"
                        data-testid="main-event-description"
                      >
                        {getMainEventDescriptionTeaser(mainEvent.description)}
                      </p>

                      <div className="mb-5 space-y-2 text-sm md:mb-0">
                        <div className="flex items-center text-gray-600">
                          <Calendar className="mr-2 h-4 w-4 shrink-0 text-primary" />
                          <span className="truncate md:whitespace-normal md:line-clamp-2">
                            {new Date(mainEvent.date).toLocaleDateString("pt-BR", {
                              day: "numeric",
                              month: "long",
                              year: "numeric",
                            })}
                          </span>
                        </div>
                        <div className="flex min-w-0 items-center text-gray-600 md:items-start">
                          <MapPin className="mr-2 h-4 w-4 shrink-0 text-primary md:mt-0.5" />
                          <span className="truncate md:line-clamp-2 md:whitespace-normal">
                            {mainEvent.location}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-3 md:mt-3">
                        <div className="min-w-0 shrink">
                          <p className="text-xl font-bold text-primary tabular-nums xl:text-2xl">
                            {mainEvent.isFree
                              ? "Grátis"
                              : `R$ ${displayPriceForEvent(mainEvent).toFixed(2)}`}
                          </p>
                          {!mainEvent.isFree && (
                            <p className="text-xs text-gray-500">
                              + taxa de conveniência
                            </p>
                          )}
                        </div>
                        <Button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleBuyTicket(mainEvent);
                          }}
                          className="h-10 shrink-0 bg-green-500 px-4 text-sm text-white hover:bg-green-600"
                          data-testid="button-buy-main"
                          disabled={paidEventIds.has(mainEvent.id)}
                        >
                          {paidEventIds.has(mainEvent.id)
                            ? "Ingresso confirmado"
                            : mainEvent.isFree
                              ? "Se Inscrever"
                              : "Comprar Ingresso"}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-white rounded-lg shadow-lg p-8 text-center">
                  <p className="text-gray-600">Nenhum evento principal disponível</p>
                </div>
              )}
            </div>

            {/* Sidebar - Próximos Eventos */}
            <div className="lg:col-span-1">
              <div className="bg-[rgb(58,57,147)] text-white rounded-t-lg p-4">
    <h3 className="text-lg font-bold">Próximos Eventos</h3>
  </div>
              <div className="bg-white rounded-b-lg shadow-lg">
                {upcomingEvents.length > 0 ? (
                  <div className="divide-y">
                    {upcomingEvents.map((event) => (
                      <div 
                        key={event.id} 
                        className="p-4 hover:bg-gray-50 transition-colors cursor-pointer"
                        onClick={() => setLocation(`/event/${event.id}`)}
                        data-testid={`card-upcoming-${event.id}`}
                      >
                        {/* Event thumbnail */}
                        {event.imageUrl ? (
                          <img 
                            src={event.imageUrl} 
                            alt={event.title}
                            className="w-full h-32 object-cover rounded-lg mb-3"
                          />
                        ) : (
                          <div className="bg-gradient-to-br from-primary/10 to-secondary/10 rounded-lg h-32 mb-3 flex items-center justify-center">
                            <svg width="60" height="60" viewBox="0 0 100 100" className="text-primary/30">
                              <circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" strokeWidth="3"/>
                              <circle cx="50" cy="20" r="8" fill="currentColor"/>
                              <circle cx="80" cy="50" r="8" fill="currentColor"/>
                              <circle cx="50" cy="80" r="8" fill="currentColor"/>
                              <circle cx="20" cy="50" r="8" fill="currentColor"/>
                            </svg>
                          </div>
                        )}
                        
                        <h4 className="font-semibold text-gray-900 mb-1">
                          {event.title}
                        </h4>
                        <div className="text-sm text-gray-600 space-y-1">
                          <div className="flex items-center">
                            <Calendar className="h-4 w-4 mr-1" />
                            {new Date(event.date).toLocaleDateString('pt-BR')}
                          </div>
                          <div className="flex items-center">
                            <MapPin className="h-4 w-4 mr-1" />
                            {event.location}
                          </div>
                        </div>
                        <div className="mt-3 flex items-center justify-between">
                          <span className="font-bold text-primary">
                            R$ {displayPriceForEvent(event).toFixed(2)}
                          </span>
                          <Button
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              setLocation(`/event/${event.id}`);
                            }}
                            className="bg-primary hover:bg-secondary"
                            data-testid={`button-view-${event.id}`}
                          >
                            Ver mais
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-8 text-center text-gray-500">
                    <p>Mais eventos em breve</p>
                  </div>
                )}
                
                {/* Ver todos os eventos button */}
                <div className="p-4 border-t">
                  <Button
                    onClick={() => setLocation("/eventos")}
                    className="w-full bg-primary hover:bg-secondary text-white"
                    data-testid="button-all-events"
                  >
                    Ver todos os eventos
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* About Section with Star Design */}
     <div className="bg-white py-16 lg:py-24 relative overflow-hidden">
  {/* 1. Faded background with NEW gradient mask */}
  <img 
    src="/audience-background.jpg" 
    alt="Audience at the event"
    className="absolute inset-0 w-full h-full object-cover grayscale opacity-30 fade-gradient-mask"
  />

  {/* 2. Content grid that sits on top */}
  <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">

      {/* Text Content */}
      <div className="lg:pr-8">
        <h2 className="text-3xl font-bold text-gray-900 mb-6">
          Sobre o Evento
        </h2>
        <p className="text-gray-600 mb-6 leading-relaxed">
        Este evento nasce com um propósito claro: provocar uma mudança de mentalidade.
        </p>
        <p className="text-gray-600 mb-6 leading-relaxed">
        A indústria já entendeu como ganhar velocidade.
        Mas velocidade, sozinha, não sustenta mais vantagem.
        </p>
        <p className="text-gray-600 mb-6 leading-relaxed">
        O próximo nível é outro.
        É transformar eficiência em valor.
        </p>
        <p className="text-gray-600 mb-6 leading-relaxed">
        Aqui, a conversa não gira só em torno de tecnologia ou automação.
        Gira em torno do que realmente diferencia no cenário atual.
        </p>
        <p className="text-gray-600 mb-6 leading-relaxed">
        Como transformar eficiência em percepção.
        Entrega em experiência.
        Operação em posicionamento.
        </p>
        <p className="text-gray-600 mb-6 leading-relaxed">
        Mais do que conteúdo, este encontro reúne algumas das principais lideranças da indústria farmacêutica.
        </p>
        <p className="text-gray-600 mb-6 leading-relaxed">
        Para conectar ideias.
        Trocar experiências reais.
        E discutir o que, de fato, vai definir os próximos movimentos do setor.
        </p>
      </div>

      {/* 3. LARGER Speaker image with the star mask */}
      <div className="relative h-96 lg:h-[550px]">
        <img
          src="/speaker.png"
          alt="Event speaker"
          className="w-full h-full object-contain star-mask transform lg:scale-125 lg:-mr-16"
        />
      </div>
    </div>
  </div>
</div>

      {/* FAQ Section */}
      <div className="bg-white py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-center text-gray-900 mb-12">
            Perguntas frequentes
          </h2>
          
          <div className="space-y-4">
            <div className="border rounded-lg">
              <button
                onClick={() => setExpandedFAQ(expandedFAQ === 'garantir' ? null : 'garantir')}
                className="w-full px-6 py-4 text-left flex items-center justify-between hover:bg-gray-50 transition-colors"
              >
                <span className="font-semibold text-gray-900">Como garantir meu ingresso?</span>
                {expandedFAQ === 'garantir' ? 
                  <ChevronUp className="h-5 w-5 text-gray-500" /> : 
                  <ChevronDown className="h-5 w-5 text-gray-500" />
                }
              </button>
              {expandedFAQ === 'garantir' && (
                <div className="px-6 pb-4 text-gray-600">
                  <p>Para garantir seu ingresso, basta clicar no botão "Comprar Ingresso", fazer seu cadastro ou login, escolher a forma de pagamento e confirmar a compra. Você receberá o QR Code do ingresso por e-mail.</p>
                </div>
              )}
            </div>

            <div className="border rounded-lg">
              <button
                onClick={() => setExpandedFAQ(expandedFAQ === 'cortesias' ? null : 'cortesias')}
                className="w-full px-6 py-4 text-left flex items-center justify-between hover:bg-gray-50 transition-colors"
              >
                <span className="font-semibold text-gray-900">Como retirar minhas cortesias?</span>
                {expandedFAQ === 'cortesias' ? 
                  <ChevronUp className="h-5 w-5 text-gray-500" /> : 
                  <ChevronDown className="h-5 w-5 text-gray-500" />
                }
              </button>
              {expandedFAQ === 'cortesias' && (
                <div className="px-6 pb-4 text-gray-600">
                  <p>Se você recebeu um código de cortesia, acesse a opção "Resgate de cortesia" no menu, insira seu código e siga as instruções para receber seu ingresso gratuito.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <SiteFooter />

      {/* Payment Modal */}
      {selectedEvent && (
        <PaymentModal
          event={selectedEvent}
          promoCode={promoCode}
          displayPrice={displayPriceForEvent(selectedEvent)}
          isOpen={isPaymentModalOpen}
          onClose={() => {
            setIsPaymentModalOpen(false);
            setSelectedEvent(null);
          }}
          onSuccess={() => {
            toast({
              title: "Pagamento iniciado!",
              description: "Acompanhe o status do seu pedido na página de perfil.",
            });
            setIsPaymentModalOpen(false);
            setSelectedEvent(null);
          }}
        />
      )}
    </main>
  );
}
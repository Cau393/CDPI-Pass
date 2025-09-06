import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MapPin, Calendar, ChevronDown, ChevronUp, Facebook, Instagram, Twitter, Linkedin, Youtube } from "lucide-react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import PaymentModal from "@/components/PaymentModal";
import type { Event } from "@shared/schema";

export default function HomePage() {
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [expandedFAQ, setExpandedFAQ] = useState<string | null>(null);
  const [, setLocation] = useLocation();
  const { isAuthenticated } = useAuth();
  const { toast } = useToast();

  const { data: events, isLoading } = useQuery<Event[]>({
    queryKey: ["/api/events"],
  });

  const handleBuyTicket = (event: Event) => {
    if (!isAuthenticated) {
      toast({
        title: "Login necessário",
        description: "Faça login ou cadastre-se para comprar ingressos",
        variant: "destructive",
      });
      setLocation("/login");
      return;
    }
    setSelectedEvent(event);
    setIsPaymentModalOpen(true);
  };

  const mainEvent = events?.[0];
  const upcomingEvents = events?.slice(1, 3) || [];

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
                  {/* Workshop 360° Badge */}
                  <div className="absolute top-4 left-4 z-10">
                    <div className="bg-white/90 backdrop-blur-sm rounded-lg px-4 py-2 flex items-center space-x-2">
                      <svg width="40" height="40" viewBox="0 0 100 100" className="text-primary">
                        <circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" strokeWidth="3"/>
                        <circle cx="50" cy="20" r="8" fill="currentColor"/>
                        <circle cx="80" cy="50" r="8" fill="currentColor"/>
                        <circle cx="50" cy="80" r="8" fill="currentColor"/>
                        <circle cx="20" cy="50" r="8" fill="currentColor"/>
                        <path d="M50 20 L80 50 L50 80 L20 50 Z" fill="none" stroke="currentColor" strokeWidth="2"/>
                      </svg>
                      <div>
                        <div className="text-xs font-semibold text-gray-600 uppercase">Workshop</div>
                        <div className="text-lg font-bold text-primary">360°</div>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col lg:flex-row">
                    {/* Event Image */}
                    <div className="lg:w-2/5">
                      {mainEvent.imageUrl ? (
                        <img 
                          src={mainEvent.imageUrl} 
                          alt={mainEvent.title}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="h-full bg-gradient-to-br from-primary to-secondary p-8 flex items-center justify-center">
                          <div className="text-center text-white">
                            <div className="w-48 h-48 bg-white/20 rounded-full mx-auto mb-4 flex items-center justify-center">
                              <span className="text-6xl">📅</span>
                            </div>
                            <p className="text-sm">Evento</p>
                            <p className="font-bold text-lg">CDPI</p>
                          </div>
                        </div>
                      )}
                    </div>
                    
                    {/* Event Details */}
                    <div className="lg:w-3/5 p-8">
                      <h2 className="text-3xl font-bold text-gray-900 mb-2">
                        {mainEvent.title}
                      </h2>
                      <p className="text-gray-600 mb-6">
                        {mainEvent.description}
                      </p>
                      
                      <div className="space-y-3 mb-6">
                        <div className="flex items-center text-gray-600">
                          <Calendar className="h-5 w-5 mr-3 text-primary" />
                          <span>{new Date(mainEvent.date).toLocaleDateString('pt-BR', {
                            day: 'numeric',
                            month: 'long',
                            year: 'numeric'
                          })}</span>
                        </div>
                        <div className="flex items-center text-gray-600">
                          <MapPin className="h-5 w-5 mr-3 text-primary" />
                          <span>{mainEvent.location}</span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-3xl font-bold text-primary">
                            R$ {parseFloat(mainEvent.price).toFixed(2)}
                          </p>
                          <p className="text-xs text-gray-500">+ taxa de conveniência</p>
                        </div>
                        <Button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleBuyTicket(mainEvent);
                          }}
                          className="bg-green-500 hover:bg-green-600 text-white px-6 py-3"
                          data-testid="button-buy-main"
                        >
                          Comprar Ingresso
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
                            R$ {parseFloat(event.price).toFixed(2)}
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
        <p className="text-gray-600 mb-4 leading-relaxed">
          Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Quis ipsum suspendisse ultrices gravida.
        </p>
        <p className="text-gray-600 leading-relaxed">
          Risus commodo viverra maecenas accumsan lacus vel facilisis.
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
                onClick={() => setExpandedFAQ(expandedFAQ === 'workshop' ? null : 'workshop')}
                className="w-full px-6 py-4 text-left flex items-center justify-between hover:bg-gray-50 transition-colors"
              >
                <span className="font-semibold text-gray-900">O que é o WorkShop 360º?</span>
                {expandedFAQ === 'workshop' ? 
                  <ChevronUp className="h-5 w-5 text-gray-500" /> : 
                  <ChevronDown className="h-5 w-5 text-gray-500" />
                }
              </button>
              {expandedFAQ === 'workshop' && (
                <div className="px-6 pb-4 text-gray-600">
                  <p>O Workshop 360º é um evento completo que aborda todos os aspectos da indústria farmacêutica, desde pesquisa e desenvolvimento até regulamentação e comercialização.</p>
                </div>
              )}
            </div>

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

      {/* Footer */}
      <footer className="bg-primary text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Logo and Info */}
            <div>
              <div className="flex items-center mb-4">
                <img 
              src="/LOGO rodape 200px 60x negativa.svg" 
              alt="CDPI Faculdade Logo" 
              className="h-12 w-auto" 
                />
              </div>
              <p className="text-white/80 text-sm">
                CDPI Faculdade. Todos os direitos<br/>
                reservados ©️ 2025 CNPJ: 40.082.785/0001-03<br/>
                Rua 115, Setor Sul, Golania-GO
              </p>
            </div>

            {/* Contact */}
            <div className="text-center">
              <h3 className="font-bold mb-4">CDPI</h3>
              <p className="text-2xl font-bold mb-2">0800 000 0000</p>
              <p className="text-sm text-white/80">
                Entre em contato conosco<br/>
                e tire suas dúvidas
              </p>
            </div>

            {/* Social Links */}
            <div className="text-center md:text-right">
              <div className="flex justify-center md:justify-end space-x-3 mb-4">
                <a href="https://www.facebook.com/cdpipharma/" target="_blank" className="bg-white/10 p-2 rounded-full hover:bg-white/20 transition-colors">
                  <Facebook className="h-5 w-5" />
                </a>
                <a href="https://www.instagram.com/cdpipharma/" target="_blank" className="bg-white/10 p-2 rounded-full hover:bg-white/20 transition-colors">
                  <Instagram className="h-5 w-5" />
                </a>
                <a href="https://www.linkedin.com/company/cdpi-pharma/" target="_blank" className="bg-white/10 p-2 rounded-full hover:bg-white/20 transition-colors">
                  <Linkedin className="h-5 w-5" />
                </a>
                <a href="https://www.youtube.com/@cdpimoving" target="_blank" className="bg-white/10 p-2 rounded-full hover:bg-white/20 transition-colors">
                  <Youtube className="h-5 w-5" />
                </a>
              </div>
            </div>
          </div>
        </div>
      </footer>

      {/* Payment Modal */}
      {selectedEvent && (
        <PaymentModal
          event={selectedEvent}
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
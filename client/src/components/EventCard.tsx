import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar, MapPin } from "lucide-react";
import { useLocation } from "wouter";
import type { Event } from "@shared/schema";

interface EventCardProps {
  event: Event;
  onBuyTicket: (event: Event) => void;
}

export default function EventCard({ event, onBuyTicket }: EventCardProps) {
  const [, setLocation] = useLocation();
  
  const formatDate = (date: Date | string) => {
    return new Date(date).toLocaleDateString("pt-BR", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  };

  const formatCurrency = (price: string | number) => {
    const value = typeof price === "string" ? parseFloat(price) : price;
    return value.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
  };

  return (
    <Card className="bg-white rounded-xl shadow-lg overflow-hidden hover:shadow-xl transition-shadow duration-300" data-testid={`card-event-${event.id}`}>
      {event.imageUrl && (
        <img 
          src={event.imageUrl} 
          alt={event.title}
          className="w-full h-48 object-cover"
          data-testid={`img-event-${event.id}`}
        />
      )}
      <CardContent className="p-6">
        <div className="flex items-center text-sm text-gray-600 mb-3">
          <Calendar className="h-4 w-4 mr-2 text-primary" />
          <span data-testid={`text-event-date-${event.id}`}>
            {formatDate(event.date)}
          </span>
          <MapPin className="h-4 w-4 ml-4 mr-2 text-primary" />
          <span data-testid={`text-event-location-${event.id}`}>
            {event.location}
          </span>
        </div>
        
        <h3 className="text-xl font-semibold text-gray-900 mb-3" data-testid={`text-event-title-${event.id}`}>
          {event.title}
        </h3>
        
        <p className="text-gray-600 text-sm mb-4 line-clamp-3" data-testid={`text-event-description-${event.id}`}>
          {event.description}
        </p>
        
        <div className="flex items-center justify-between">
          <div className="text-2xl font-bold text-primary" data-testid={`text-event-price-${event.id}`}>
            {formatCurrency(event.price)}
          </div>
          <div className="flex space-x-2">
            <Button
              variant="outline"
              className="text-secondary hover:text-primary border-secondary hover:border-primary"
              onClick={() => setLocation(`/event/${event.id}`)}
              data-testid={`button-learn-more-${event.id}`}
            >
              Saiba mais
            </Button>
            <Button
              className="bg-primary hover:bg-secondary text-white"
              onClick={() => onBuyTicket(event)}
              data-testid={`button-buy-ticket-${event.id}`}
            >
              Comprar
            </Button>
          </div>
        </div>
        
        {event.maxAttendees && (
          <div className="mt-3 text-xs text-gray-500">
            {event.currentAttendees || 0} de {event.maxAttendees} vagas preenchidas
          </div>
        )}
      </CardContent>
    </Card>
  );
}

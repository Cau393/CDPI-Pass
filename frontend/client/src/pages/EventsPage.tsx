import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Calendar, MapPin, Search } from "lucide-react";
import type { Event } from "@shared/schema";

export default function EventsPage() {
  const [, setLocation] = useLocation();
  const [searchTerm, setSearchTerm] = useState("");

  const { data: events, isLoading } = useQuery<Event[]>({
    queryKey: ["/api/events"],
  });

  const filteredEvents = events?.filter((event) => {
    const search = searchTerm.toLowerCase();
    return (
      event.title.toLowerCase().includes(search) ||
      event.description.toLowerCase().includes(search) ||
      event.location.toLowerCase().includes(search)
    );
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header with Search */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-6">Todos os Eventos</h1>
          <div className="relative max-w-md">
            <Input
              type="text"
              placeholder="Buscar eventos..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
              data-testid="input-search-events"
            />
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          </div>
        </div>

        {/* Events Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...Array(6)].map((_, i) => (
              <Card key={i} className="animate-pulse">
                <div className="h-48 bg-gray-300 rounded-t-lg"></div>
                <CardContent className="p-4">
                  <div className="h-6 bg-gray-300 rounded mb-2"></div>
                  <div className="h-4 bg-gray-300 rounded mb-2"></div>
                  <div className="h-4 bg-gray-300 rounded"></div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : filteredEvents && filteredEvents.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredEvents.map((event) => (
              <Card
                key={event.id}
                className="overflow-hidden hover:shadow-xl transition-shadow cursor-pointer"
                onClick={() => setLocation(`/event/${event.id}`)}
                data-testid={`card-event-${event.id}`}
              >
                {event.imageUrl && (
                  <div className="h-48 overflow-hidden bg-gray-100">
                    <img
                      src={event.imageUrl}
                      alt={event.title}
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}
                {!event.imageUrl && (
                  <div className="h-48 bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
                    <div className="text-white text-center">
                      <div className="text-6xl mb-2">📅</div>
                      <p className="text-sm">Evento CDPI</p>
                    </div>
                  </div>
                )}
                
                <CardContent className="p-4">
                  <h3 className="text-xl font-bold text-gray-900 mb-2">
                    {event.title}
                  </h3>
                  
                  <p className="text-gray-600 text-sm mb-3 line-clamp-2">
                    {event.description}
                  </p>

                  <div className="space-y-2 mb-4">
                    <div className="flex items-center text-gray-500 text-sm">
                      <Calendar className="h-4 w-4 mr-2 text-primary" />
                      <span>
                        {new Date(event.date).toLocaleDateString('pt-BR', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric'
                        })}
                      </span>
                    </div>
                    <div className="flex items-center text-gray-500 text-sm">
                      <MapPin className="h-4 w-4 mr-2 text-primary" />
                      <span className="line-clamp-1">{event.location}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <p className="text-2xl font-bold text-primary">
                      R$ {parseFloat(event.price).toFixed(2)}
                    </p>
                    <Button
                      size="sm"
                      className="bg-primary hover:bg-secondary"
                      onClick={(e) => {
                        e.stopPropagation();
                        setLocation(`/event/${event.id}`);
                      }}
                      data-testid={`button-view-${event.id}`}
                    >
                      Ver Detalhes
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <p className="text-gray-500 text-lg">
              {searchTerm
                ? "Nenhum evento encontrado com os termos pesquisados."
                : "Nenhum evento disponível no momento."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
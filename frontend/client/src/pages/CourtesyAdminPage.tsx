import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Ticket, Link, Copy, CheckCircle, Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { Event } from "@shared/schema";
import { useAuth } from "@/hooks/useAuth";

function normalizeForSearch(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function eventMatchesQuery(title: string, query: string): boolean {
  const nt = normalizeForSearch(title);
  const nq = normalizeForSearch(query.trim());
  if (!nq) return true;
  const tokens = nq.split(/\s+/).filter(Boolean);
  return tokens.every((t) => nt.includes(t));
}

interface CourtesyLink {
  id: string;
  code: string;
  eventId: string;
  ticketCount: number;
  usedCount: number;
  isActive: boolean;
  createdAt: string;
  redeemUrl: string;
  event?: Event;
  overridePrice?: number;
  remainingTickets?: number;
}

export default function CourtesyAdminPage() {
  const [eventComboOpen, setEventComboOpen] = useState(false);
  const [eventSearch, setEventSearch] = useState("");
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [ticketCount, setTicketCount] = useState("1");
  const [copiedLink, setCopiedLink] = useState<string | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { isAuthenticated } = useAuth();
  const [currentPage, setCurrentPage] = useState(1);
  const [overridePrice, setOverridePrice] = useState("");

  // Fetch events
  const { data: events = [], isLoading: eventsLoading } = useQuery<Event[]>({
    queryKey: ["/api/events"],
  });

  const filteredEvents = useMemo(() => {
    return events.filter((e) => eventMatchesQuery(e.title, eventSearch));
  }, [events, eventSearch]);

  // Fetch courtesy links
  const { data: links, isLoading: linksLoading } = useQuery({
  queryKey: ["/api/courtesy-links", currentPage],
  queryFn: async () => {
    const response = await apiRequest("GET", `/api/courtesy-links?page=${currentPage}`);
    return response.json();
  },
  enabled: isAuthenticated,
  staleTime: 0,
  gcTime: 0, 
  });

  // Create courtesy link mutation
  const createLinkMutation = useMutation({
    mutationFn: async (data: { eventId: string; ticketCount: number; overridePrice: number | null }) => {
      return await apiRequest("POST", "/api/courtesy-links", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/courtesy-links"] });
      setCurrentPage(1);
      toast({
        title: "Link criado com sucesso!",
        description: "O link de cortesia foi gerado e está pronto para uso.",
      });
      setSelectedEvent(null);
      setTicketCount("1");
    },
    onError: (error) => {
      toast({
        title: "Erro ao criar link",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleCreateLink = () => {
    if (!selectedEvent) {
      toast({
        title: "Selecione um evento",
        description: "Por favor, selecione um evento para o link de cortesia",
        variant: "destructive",
      });
      return;
    }

    createLinkMutation.mutate({
      eventId: selectedEvent.id,
      ticketCount: parseInt(ticketCount),
      overridePrice: overridePrice ? parseFloat(overridePrice) : null,
    });
  };

  const copyToClipboard = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedLink(url);
      toast({
        title: "Link copiado!",
        description: "O link foi copiado para a área de transferência",
      });
      setTimeout(() => setCopiedLink(null), 3000);
    } catch (error) {
      toast({
        title: "Erro ao copiar",
        description: "Não foi possível copiar o link",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-8">Gerenciar Links de Cortesia</h1>
      
      {/* Create New Link */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Ticket className="h-5 w-5" />
            Criar Novo Link de Cortesia
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Evento</Label>
              <Popover open={eventComboOpen} onOpenChange={setEventComboOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    id="event"
                    variant="outline"
                    role="combobox"
                    aria-expanded={eventComboOpen}
                    className="w-full justify-between font-normal"
                    disabled={eventsLoading}
                    data-testid="select-event"
                  >
                    {selectedEvent ? selectedEvent.title : "Buscar e selecionar evento..."}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[min(100vw-2rem,28rem)] p-0" align="start">
                  <Command shouldFilter={false}>
                    <CommandInput
                      placeholder="Buscar por nome (sem acentos ou maiúsculas)..."
                      value={eventSearch}
                      onValueChange={setEventSearch}
                    />
                    <CommandList>
                      <CommandEmpty>
                        {eventsLoading ? "Carregando..." : "Nenhum evento encontrado."}
                      </CommandEmpty>
                      <CommandGroup>
                        {filteredEvents.map((ev) => (
                          <CommandItem
                            key={ev.id}
                            value={ev.id}
                            onSelect={() => {
                              setSelectedEvent(ev);
                              setEventComboOpen(false);
                            }}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                selectedEvent?.id === ev.id ? "opacity-100" : "opacity-0",
                              )}
                            />
                            <span className="truncate">{ev.title}</span>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="tickets">Quantidade de Ingressos</Label>
              <Input
                id="tickets"
                type="number"
                min="1"
                max="100"
                value={ticketCount}
                onChange={(e) => setTicketCount(e.target.value)}
                data-testid="input-ticket-count"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="price">Preço Promocional (deixe em branco para cortesia)</Label>
              <Input
                id="price"
                type="number"
                min="0"
                placeholder="Ex: 50.00"
                value={overridePrice}
                onChange={(e) => setOverridePrice(e.target.value)}
                data-testid="input-override-price"
              />
            </div>
                        
            <div className="flex items-end">
              <Button
                onClick={handleCreateLink}
                disabled={createLinkMutation.isPending}
                className="w-full"
                data-testid="button-create-link"
              >
                {createLinkMutation.isPending ? "Criando..." : "Criar Link"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Existing Links */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link className="h-5 w-5" />
            Links de Cortesia Criados
          </CardTitle>
        </CardHeader>
        <CardContent>
          {linksLoading ? (
            <div className="text-center py-8">
              <p className="text-gray-500">Carregando links...</p>
            </div>
          ) : links?.links && links.links.length > 0 ? (
            <>
              <div className="space-y-4">
                {links?.links?.map((link) => (
                  <div
                    key={link.id}
                    className="border rounded-lg p-4 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <h3 className="font-semibold text-lg">
                          {link.event?.title || "Evento"}
                        </h3>
                        <div className="mb-2">
                          {link.overridePrice ? (
                            <span className="text-sm font-bold text-blue-600 bg-blue-100 px-2 py-1 rounded-full">
                              Promocional: R$ {parseFloat(link.overridePrice).toFixed(2)}
                            </span>
                          ) : (
                            <span className="text-sm font-bold text-green-600 bg-green-100 px-2 py-1 rounded-full">
                              Cortesia (Grátis)
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-600 mb-2">
                          Código: <span className="font-mono bg-gray-100 px-2 py-1 rounded">{link.code}</span>
                        </p>
                        <div className="flex gap-4 text-sm">
                          <span className={`flex items-center gap-1 ${link.remainingTickets === 0 ? 'text-red-600' : 'text-green-600'}`}>
                            <Ticket className="h-4 w-4" />
                            {link.remainingTickets || 0} de {link.ticketCount} disponíveis
                          </span>
                          <span className="text-gray-500">
                            Criado em: {new Date(link.createdAt).toLocaleDateString('pt-BR')}
                          </span>
                        </div>
                        <div className="mt-2 flex items-center gap-2">
                          <input
                            type="text"
                            value={link.redeemUrl}
                            readOnly
                            className="flex-1 text-xs bg-gray-50 p-2 rounded border"
                            data-testid={`input-link-${link.id}`}
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => copyToClipboard(link.redeemUrl)}
                            data-testid={`button-copy-${link.id}`}
                          >
                            {copiedLink === link.redeemUrl ? (
                              <CheckCircle className="h-4 w-4 text-green-600" />
                            ) : (
                              <Copy className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Pagination Controls */}
              {links?.totalPages > 1 && (
                <div className="flex justify-center items-center gap-2 mt-6">
                  <Button
                    variant="outline"
                    onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                    disabled={currentPage === 1}
                  >
                    Anterior
                  </Button>
                  <span className="text-sm font-medium px-4">
                    Página {currentPage} de {links.totalPages}
                  </span>
                  <Button
                    variant="outline"
                    onClick={() => setCurrentPage((prev) => Math.min(prev + 1, links.totalPages))}
                    disabled={currentPage === links.totalPages}
                  >
                    Próxima
                  </Button>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-8">
              <p className="text-gray-500">Nenhum link de cortesia criado ainda</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
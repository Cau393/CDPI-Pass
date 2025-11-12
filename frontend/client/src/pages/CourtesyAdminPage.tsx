import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Ticket, Link, Copy, CheckCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { Event } from "@shared/schema";
import { useAuth } from "@/hooks/useAuth";

interface CourtesyLink {
  id: string;
  code: string;
  eventId: string;
  ticket_count: number; // FIX: Changed to snake_case
  used_count: number;
  isActive: boolean;
  created_at: string;
  redeemUrl: string;
  event?: Event;
  override_price?: number; // FIX: Changed to snake_case
  remainingTickets?: number;
}

const PAGE_SIZE = 15;

export default function CourtesyAdminPage() {
  const [selectedEventId, setSelectedEventId] = useState("");
  const [ticketCount, setTicketCount] = useState("1");
  const [copiedLink, setCopiedLink] = useState<string | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { isAuthenticated } = useAuth();
  const [currentPage, setCurrentPage] = useState(1);
  const [overridePrice, setOverridePrice] = useState("");

  interface PaginatedEventsResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: Event[]; 
  }

  interface PaginatedLinksResponse {
      count: number;
      next: string | null;
      previous: string | null;
      results: CourtesyLink[]; 
  }
  // Fetch events
  const { data: paginatedEventsData } = useQuery<PaginatedEventsResponse>({ // <-- Use the new type
  queryKey: ["/api/events/"],
  });

  // Fetch courtesy links
  const { data: paginatedLinksData, isLoading: linksLoading } = useQuery<PaginatedLinksResponse>({ // Use correct type
  queryKey: ["/api/orders/courtesy/links/", currentPage], // Match backend URL
  queryFn: async () => {
    const response = await apiRequest("GET", `/api/orders/courtesy/links/?page=${currentPage}`);
    const data: PaginatedLinksResponse = await response.json();
    return data;
    },
    enabled: isAuthenticated,
    staleTime: 0,
    gcTime: 0, 
  });

  const totalPages = paginatedLinksData?.count ? Math.ceil(paginatedLinksData.count / PAGE_SIZE) : 1;

  // Create courtesy link mutation
  const createLinkMutation = useMutation({
    // FIX: Update the mutation function signature to use snake_case
    mutationFn: async (data: { eventId: string; ticket_count: number; override_price: number | null }) => {
      return await apiRequest("POST", "/api/orders/courtesy/links/", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders/courtesy/links/"] });
      setCurrentPage(1);
      toast({
        title: "Link criado com sucesso!",
        description: "O link de cortesia foi gerado e está pronto para uso.",
      });
      setSelectedEventId("");
      setTicketCount("1");
      setOverridePrice(""); // Clear the price input
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
    if (!selectedEventId) {
      toast({
        title: "Selecione um evento",
        description: "Por favor, selecione um evento para o link de cortesia",
        variant: "destructive",
      });
      return;
    }

    createLinkMutation.mutate({
      eventId: selectedEventId,
      // FIX: Send snake_case keys to the backend
      ticket_count: parseInt(ticketCount),
      override_price: overridePrice ? parseFloat(overridePrice) : null,
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
              <Label htmlFor="event">Evento</Label>
              <Select value={selectedEventId} onValueChange={setSelectedEventId}>
                <SelectTrigger id="event" data-testid="select-event">
                  <SelectValue placeholder="Selecione um evento" />
                </SelectTrigger>
                <SelectContent>
                  {paginatedEventsData?.results?.map((event) => ( 
                  <SelectItem key={event.id} value={event.id.toString()}>
                    {event.title}
                  </SelectItem>
                ))}
                </SelectContent>
              </Select>
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
          ) : paginatedLinksData?.results && paginatedLinksData.results.length > 0 ? (
            <>
              <div className="space-y-4">
                {paginatedLinksData.results.map((link) => (
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
                          {/* FIX: Read from override_price (snake_case) */}
                          {link.override_price ? (
                            <span className="text-sm font-bold text-blue-600 bg-blue-100 px-2 py-1 rounded-full">
                              Promocional: R$ {parseFloat(link.override_price).toFixed(2)}
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
                            {/* FIX: Read from ticket_count (snake_case) */}
                            {link.remainingTickets || 0} de {link.ticket_count} disponíveis
                          </span>
                          <span className="text-gray-500">
                            Criado em: {new Date(link.created_at).toLocaleDateString('pt-BR')}
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
              {totalPages > 1 && ( // Check calculated totalPages
                <div className="flex justify-center items-center gap-2 mt-6">
                  <Button
                    variant="outline"
                    onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                    // Disable based on API response's 'previous' link
                    disabled={!paginatedLinksData?.previous}
                  >
                    Anterior
                  </Button>
                  <span className="text-sm font-medium px-4">
                    {/* Display current page and calculated totalPages */}
                    Página {currentPage} de {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                    disabled={!paginatedLinksData?.next}
                  >
                    Próxima
                  </Button>
                </div>
              )}
            </>
          ) : (
            <>
            {console.log("Rendering No Links Message...")}
            <div className="text-center py-8">
              <p className="text-gray-500">Nenhum link de cortesia criado ainda</p>
            </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
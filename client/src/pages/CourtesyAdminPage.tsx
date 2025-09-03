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
  remainingTickets?: number;
}

export default function CourtesyAdminPage() {
  const [selectedEventId, setSelectedEventId] = useState("");
  const [ticketCount, setTicketCount] = useState("1");
  const [copiedLink, setCopiedLink] = useState<string | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch events
  const { data: events } = useQuery<Event[]>({
    queryKey: ["/api/events"],
  });

  // Fetch courtesy links
  const { data: links, isLoading: linksLoading } = useQuery<CourtesyLink[]>({
    queryKey: ["/api/courtesy-links"],
    retry: false,
  });

  // Create courtesy link mutation
  const createLinkMutation = useMutation({
    mutationFn: async (data: { eventId: string; ticketCount: number }) => {
      return await apiRequest("POST", "/api/courtesy-links", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/courtesy-links"] });
      toast({
        title: "Link criado com sucesso!",
        description: "O link de cortesia foi gerado e está pronto para uso.",
      });
      setSelectedEventId("");
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
      ticketCount: parseInt(ticketCount),
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
                  {events?.map((event) => (
                    <SelectItem key={event.id} value={event.id}>
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
          ) : links && links.length > 0 ? (
            <div className="space-y-4">
              {links.map((link) => (
                <div
                  key={link.id}
                  className="border rounded-lg p-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <h3 className="font-semibold text-lg">
                        {link.event?.title || "Evento"}
                      </h3>
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
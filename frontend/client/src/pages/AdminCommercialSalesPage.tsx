import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Loader2, Search, UserX } from "lucide-react";
import EventSelector from "@/components/admin/EventSelector";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { Event } from "@shared/schema";

interface CommercialSale {
  id: string;
  vendedor: string;
  status: "pago" | "pendente";
  orderDbStatus: "pending" | "paid" | "cancelled";
  paymentMethod: string;
  nome: string;
  cpf: string;
  email: string;
  telefone: string;
}

function normalizeForSearch(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function saleMatchesQuery(sale: CommercialSale, query: string): boolean {
  const nq = normalizeForSearch(query.trim());
  if (!nq) return true;
  const cpfDigits = sale.cpf.replace(/\D/g, "");
  const haystack = normalizeForSearch(
    [sale.nome, sale.cpf, cpfDigits, sale.email, sale.telefone, sale.vendedor]
      .filter(Boolean)
      .join(" "),
  );
  const tokens = nq.split(/\s+/).filter(Boolean);
  return tokens.every((t) => haystack.includes(t));
}

export default function AdminCommercialSalesPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [cancellingOrderId, setCancellingOrderId] = useState<string | null>(
    null,
  );
  const [markingPaidOrderId, setMarkingPaidOrderId] = useState<string | null>(
    null,
  );

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const {
    data: sales,
    isLoading,
    isFetching,
    isError,
  } = useQuery<CommercialSale[]>({
    queryKey: ["/api/admin/events", selectedEvent?.id, "commercial-sales"],
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/admin/events/${selectedEvent!.id}/commercial-sales`,
      );
      return res.json() as Promise<CommercialSale[]>;
    },
    enabled: !!selectedEvent?.id,
  });

  useEffect(() => {
    if (isError) {
      toast({
        title: "Erro",
        description:
          "Erro ao carregar os dados de vendas. Tente novamente.",
        variant: "destructive",
      });
    }
  }, [isError, toast]);

  const handleMarkPaidExternal = async (orderId: string, participantName: string) => {
    setMarkingPaidOrderId(orderId);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/admin/orders/${orderId}/mark-paid-external`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: "include",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof body.message === "string" ? body.message : "Falha ao confirmar pagamento",
        );
      }
      await queryClient.invalidateQueries({
        queryKey: ["/api/admin/events", selectedEvent?.id, "commercial-sales"],
      });
      toast({
        title: "Pagamento confirmado",
        description:
          typeof body.message === "string"
            ? body.message
            : `O pedido de ${participantName} foi marcado como pago (meios externos).`,
      });
    } catch (e) {
      toast({
        title: "Erro ao confirmar",
        description:
          e instanceof Error ? e.message : "Não foi possível confirmar o pagamento.",
        variant: "destructive",
      });
    } finally {
      setMarkingPaidOrderId(null);
    }
  };

  const handleCancelOrder = async (orderId: string, participantName: string) => {
    setCancellingOrderId(orderId);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/admin/orders/${orderId}/cancel`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: "include",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.message || "Falha ao cancelar o pedido");
      }
      await queryClient.invalidateQueries({
        queryKey: ["/api/admin/events", selectedEvent?.id, "commercial-sales"],
      });
      toast({
        title: "Cancelamento concluído",
        description:
          typeof body.message === "string"
            ? body.message
            : `Pedido de ${participantName} cancelado.`,
      });
    } catch {
      toast({
        title: "Erro no cancelamento",
        description: "Não foi possível cancelar o pedido.",
        variant: "destructive",
      });
    } finally {
      setCancellingOrderId(null);
    }
  };

  const allSales = sales ?? [];

  const filteredSales = useMemo(() => {
    return allSales.filter((s) => saleMatchesQuery(s, debouncedSearch));
  }, [allSales, debouncedSearch]);

  const loading = !!selectedEvent && (isLoading || isFetching);

  const showCountBadge =
    selectedEvent &&
    !loading &&
    (debouncedSearch.trim()
      ? `${filteredSales.length} de ${allSales.length} vendas`
      : `${allSales.length} venda${allSales.length !== 1 ? "s" : ""}`);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-6">
      <div>
        <p className="text-sm text-muted-foreground">
          Admin / Comercial / Vendas
        </p>
        <h1 className="text-2xl font-bold tracking-tight">
          Vendas do Comercial
        </h1>
      </div>

      <div className="space-y-2">
        <Label>Evento</Label>
        <EventSelector
          value={selectedEvent?.id ?? null}
          onSelect={(ev) => {
            setSelectedEvent(ev);
            setSearch("");
            setDebouncedSearch("");
          }}
        />
      </div>

      {selectedEvent && (
        <>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative max-w-md flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Buscar por nome, CPF, e-mail, telefone ou vendedor..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            {showCountBadge && (
              <Badge variant="secondary" className="w-fit shrink-0">
                {showCountBadge}
              </Badge>
            )}
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vendedor</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>CPF</TableHead>
                  <TableHead>E-mail</TableHead>
                  <TableHead>Telefone</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 7 }).map((__, j) => (
                        <TableCell key={j}>
                          <Skeleton className="h-4 w-full" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : filteredSales.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="h-24 text-center text-muted-foreground"
                    >
                      {debouncedSearch.trim()
                        ? "Nenhuma venda encontrada para esta busca."
                        : "Nenhuma venda registrada para este evento."}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredSales.map((sale) => (
                    <TableRow key={sale.id}>
                      <TableCell className="font-medium">
                        {sale.vendedor}
                      </TableCell>
                      <TableCell>
                        {sale.status === "pago" ? (
                          <Badge className="bg-green-600 hover:bg-green-600">
                            Pago
                          </Badge>
                        ) : (
                          <Badge className="bg-amber-500 hover:bg-amber-500 text-white">
                            Pendente
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>{sale.nome}</TableCell>
                      <TableCell>{sale.cpf}</TableCell>
                      <TableCell>{sale.email}</TableCell>
                      <TableCell>{sale.telefone}</TableCell>
                      <TableCell className="text-right">
                        {sale.orderDbStatus === "pending" ? (
                          <div className="flex flex-col items-end gap-2">
                            {sale.paymentMethod === "credit_card" && (
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    disabled={markingPaidOrderId === sale.id}
                                  >
                                    {markingPaidOrderId === sale.id ? (
                                      <>
                                        <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                                        Confirmando...
                                      </>
                                    ) : (
                                      <>
                                        <CheckCircle2 className="mr-2 h-3 w-3" />
                                        Pago por meios externos
                                      </>
                                    )}
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>
                                      Confirmar pagamento externo?
                                    </AlertDialogTitle>
                                    <AlertDialogDescription className="space-y-2 text-left">
                                      <span>
                                        Registrar como pago o pedido de{" "}
                                        <strong>{sale.nome}</strong> (cartão
                                        pago fora do link Asaas)? Será
                                        disparado o mesmo fluxo de confirmação:
                                        e-mail com QR Code, atualização de vagas
                                        e notificações internas.
                                      </span>
                                      <span className="block text-sm text-muted-foreground">
                                        Não há validação de cobrança no Asaas;
                                        use somente se o pagamento foi realmente
                                        recebido.
                                      </span>
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Voltar</AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={() =>
                                        void handleMarkPaidExternal(
                                          sale.id,
                                          sale.nome,
                                        )
                                      }
                                    >
                                      Confirmar
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            )}
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  disabled={cancellingOrderId === sale.id}
                                >
                                  {cancellingOrderId === sale.id ? (
                                    <>
                                      <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                                      Cancelando...
                                    </>
                                  ) : (
                                    <>
                                      <UserX className="mr-2 h-3 w-3" />
                                      Cancelar
                                    </>
                                  )}
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>
                                    Remover pedido pendente?
                                  </AlertDialogTitle>
                                  <AlertDialogDescription className="space-y-2 text-left">
                                    <span>
                                      O pedido em aberto de{" "}
                                      <strong>{sale.nome}</strong> será
                                      descartado no sistema (o QR gerado deixa
                                      de valer para este pedido e{" "}
                                      <strong>não</strong> será enviado e-mail
                                      de cancelamento — o ingresso ainda não
                                      estava confirmado).
                                    </span>
                                    <span className="block text-sm text-muted-foreground">
                                      Se existir <strong>outro pedido já pago</strong>{" "}
                                      para a mesma pessoa neste evento, ele{" "}
                                      <strong>não</strong> é alterado: são
                                      registros independentes.
                                    </span>
                                    <span className="block text-sm text-muted-foreground">
                                      Estorno no Asaas, se houver cobrança ativa,
                                      continua sendo manual.
                                    </span>
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Voltar</AlertDialogCancel>
                                  <AlertDialogAction
                                    className="bg-red-600 hover:bg-red-700"
                                    onClick={() =>
                                      void handleCancelOrder(
                                        sale.id,
                                        sale.nome,
                                      )
                                    }
                                  >
                                    Confirmar cancelamento
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      {!selectedEvent && (
        <div className="flex min-h-[200px] items-center justify-center rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          Selecione um evento para ver as vendas do comercial.
        </div>
      )}
    </div>
  );
}

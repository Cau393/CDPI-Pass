import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Search, UserCheck } from "lucide-react";
import EventSelector from "@/components/admin/EventSelector";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { Event } from "@shared/schema";

interface Participant {
  userId: string;
  name: string;
  cpf: string;
  email: string;
  phone: string;
  ticketId: string;
  checkedIn: boolean;
  checkedInAt: string | null;
}

interface ParticipantsResponse {
  data: Participant[];
  total: number;
}

function normalizeForSearch(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function participantMatchesQuery(p: Participant, query: string): boolean {
  const nq = normalizeForSearch(query.trim());
  if (!nq) return true;
  const cpfDigits = p.cpf.replace(/\D/g, "");
  const haystack = normalizeForSearch(
    [p.name, p.cpf, cpfDigits, p.email, p.phone].filter(Boolean).join(" "),
  );
  const tokens = nq.split(/\s+/).filter(Boolean);
  return tokens.every((t) => haystack.includes(t));
}

function formatCheckedInAt(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("pt-BR");
}

export default function AdminParticipantsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [checkingTicketId, setCheckingTicketId] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const {
    data: participantsRes,
    isLoading: participantsLoading,
    isFetching: participantsFetching,
  } = useQuery<ParticipantsResponse>({
    queryKey: ["/api/admin/events", selectedEvent?.id, "participants"],
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/admin/events/${selectedEvent!.id}/participants`,
      );
      return res.json() as Promise<ParticipantsResponse>;
    },
    enabled: !!selectedEvent?.id,
  });

  const allParticipants = participantsRes?.data ?? [];
  const totalLoaded = participantsRes?.total ?? allParticipants.length;

  const filteredParticipants = useMemo(() => {
    return allParticipants.filter((p) =>
      participantMatchesQuery(p, debouncedSearch),
    );
  }, [allParticipants, debouncedSearch]);

  const loading = !!selectedEvent && (participantsLoading || participantsFetching);

  const handleCheckIn = async (ticketId: string, participantName: string) => {
    setCheckingTicketId(ticketId);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/admin/tickets/${ticketId}/check-in`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: "include",
      });

      const body = await res.json().catch(() => ({}));

      if (res.status === 409) {
        const at =
          typeof body.checkedInAt === "string" ? body.checkedInAt : null;
        queryClient.setQueryData<ParticipantsResponse | undefined>(
          ["/api/admin/events", selectedEvent?.id, "participants"],
          (prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              data: prev.data.map((row) =>
                row.ticketId === ticketId
                  ? { ...row, checkedIn: true, checkedInAt: at }
                  : row,
              ),
            };
          },
        );
        toast({
          title: "Já confirmado",
          description: at
            ? `Registrado em ${formatCheckedInAt(at)}`
            : "Presença já havia sido registrada.",
        });
        return;
      }

      if (!res.ok) {
        throw new Error(body.message || body.error || "Check-in failed");
      }

      const checkedInAt =
        typeof body.checkedInAt === "string" ? body.checkedInAt : null;

      queryClient.setQueryData<ParticipantsResponse | undefined>(
        ["/api/admin/events", selectedEvent?.id, "participants"],
        (prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            data: prev.data.map((row) =>
              row.ticketId === ticketId
                ? { ...row, checkedIn: true, checkedInAt }
                : row,
            ),
          };
        },
      );

      toast({
        title: "Presença confirmada!",
        description: `${participantName} registrado(a) com sucesso.`,
      });
    } catch {
      toast({
        title: "Erro",
        description: "Não foi possível confirmar presença. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setCheckingTicketId(null);
    }
  };

  const showCountBadge =
    selectedEvent &&
    !loading &&
    (debouncedSearch.trim()
      ? `${filteredParticipants.length} de ${totalLoaded} participantes`
      : `${totalLoaded} participante${totalLoaded !== 1 ? "s" : ""}`);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-6">
      <div>
        <p className="text-sm text-muted-foreground">Admin / Participantes</p>
        <h1 className="text-2xl font-bold tracking-tight">Participantes</h1>
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
                placeholder="Buscar por nome, CPF, e-mail ou telefone..."
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
                  <TableHead>Nome</TableHead>
                  <TableHead>CPF</TableHead>
                  <TableHead>E-mail</TableHead>
                  <TableHead>Telefone</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 6 }).map((__, j) => (
                        <TableCell key={j}>
                          <Skeleton className="h-4 w-full" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : filteredParticipants.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="h-24 text-center text-muted-foreground"
                    >
                      {debouncedSearch.trim()
                        ? "Nenhum participante encontrado para esta busca."
                        : "Nenhum participante neste evento."}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredParticipants.map((p) => (
                    <TableRow key={p.ticketId}>
                      <TableCell className="font-semibold">{p.name}</TableCell>
                      <TableCell>{p.cpf}</TableCell>
                      <TableCell>{p.email}</TableCell>
                      <TableCell>{p.phone}</TableCell>
                      <TableCell>
                        {p.checkedIn ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Badge className="bg-green-600 hover:bg-green-600">
                                Presente
                              </Badge>
                            </TooltipTrigger>
                            {p.checkedInAt && (
                              <TooltipContent>
                                {formatCheckedInAt(p.checkedInAt)}
                              </TooltipContent>
                            )}
                          </Tooltip>
                        ) : (
                          <Badge variant="secondary">Não registrado</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {p.checkedIn ? (
                          <span className="text-sm italic text-muted-foreground">
                            Confirmado
                          </span>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={checkingTicketId === p.ticketId}
                            onClick={() =>
                              void handleCheckIn(p.ticketId, p.name)
                            }
                          >
                            {checkingTicketId === p.ticketId ? (
                              <>
                                <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                                Registrando...
                              </>
                            ) : (
                              <>
                                <UserCheck className="mr-2 h-3 w-3" />
                                Confirmar presença
                              </>
                            )}
                          </Button>
                        )}
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
          Selecione um evento para ver os participantes.
        </div>
      )}
    </div>
  );
}

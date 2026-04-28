import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearch } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { parseApiErrorMessage } from "@/lib/eventForm";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import EventSelector from "@/components/admin/EventSelector";
import CourtesyLinkRedemptionsTable from "@/components/admin/CourtesyLinkRedemptionsTable";
import type { Event } from "@shared/schema";

type MassSendRecipient = {
  id: string;
  code: string;
  recipientName: string;
  recipientEmail: string;
  ticketCount: number;
  usedCount: number;
  remaining: number;
  isActive: boolean;
  createdAt: string;
};

type MassSendRecipientsRes = { data: MassSendRecipient[]; total: number };

function tabFromSearch(search: string): "envio" | "visualizar" {
  const t = new URLSearchParams(
    search.startsWith("?") ? search.slice(1) : search,
  ).get("tab");
  return t === "visualizar" ? "visualizar" : "envio";
}

export default function CourtesyMassSendingPage() {
  const search = useSearch();
  const initialTab = useMemo(() => tabFromSearch(search), [search]);
  const [activeTab, setActiveTab] = useState<"envio" | "visualizar">(initialTab);

  useEffect(() => {
    setActiveTab(tabFromSearch(search));
  }, [search]);

  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const { toast } = useToast();

  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [view, setView] = useState<"list" | "redeemers">("list");
  const [selectedLink, setSelectedLink] = useState<{
    id: string;
    code: string;
  } | null>(null);
  const [searchText, setSearchText] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchText), 300);
    return () => clearTimeout(t);
  }, [searchText]);

  useEffect(() => {
    setPage(1);
  }, [selectedEvent?.id, debouncedSearch]);

  const mutation = useMutation({
    mutationFn: (formData: FormData) => {
      return apiRequest("POST", "/api/courtesy/mass-send", formData);
    },
    onSuccess: async () => {
      toast({
        title: "Emails enfileirados para envio",
        description: "Os e-mails de cortesia estão sendo processados e serão enviados em breve.",
      });
      setCsvFile(null);
      setAttachmentFile(null);
      await queryClient.invalidateQueries({ queryKey: ["mass-send-recipients"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao enviar e-mails",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const {
    data: recipientsRes,
    isLoading: recipientsLoading,
    isError: recipientsError,
    error: recipientsErr,
  } = useQuery<MassSendRecipientsRes>({
    queryKey: [
      "mass-send-recipients",
      selectedEvent?.id,
      page,
      debouncedSearch,
    ],
    queryFn: async () => {
      if (!selectedEvent?.id) throw new Error("no event");
      const params = new URLSearchParams();
      if (page > 1) params.set("page", String(page));
      const s = debouncedSearch.trim().slice(0, 120);
      if (s) params.set("search", s);
      const q = params.toString();
      const res = await apiRequest(
        "GET",
        `/api/admin/events/${selectedEvent.id}/mass-send-recipients${q ? `?${q}` : ""}`,
      );
      return res.json() as Promise<MassSendRecipientsRes>;
    },
    enabled: !!selectedEvent?.id,
  });

  useEffect(() => {
    if (recipientsError && recipientsErr) {
      const m = (recipientsErr as Error).message;
      if (m.startsWith("403:")) {
        toast({
          title: "Acesso negado",
          description: "Você não tem permissão para visualizar estes envios.",
          variant: "destructive",
        });
        return;
      }
      if (m.startsWith("500:") || m.startsWith("400:")) {
        toast({
          title: "Erro ao carregar",
          description: parseApiErrorMessage(recipientsErr),
          variant: "destructive",
        });
      }
    }
  }, [recipientsError, recipientsErr, toast]);

  const handleTabChange = useCallback(
    (v: string) => {
      const next = v === "visualizar" ? "visualizar" : "envio";
      setActiveTab(next);
      const path =
        next === "visualizar"
          ? "/cortesia-envio-em-massa?tab=visualizar"
          : "/cortesia-envio-em-massa";
      globalThis.history.replaceState(null, "", path);
    },
    [],
  );

  const handleCsvChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      setCsvFile(event.target.files[0]);
    }
  };

  const handleAttachmentChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      setAttachmentFile(event.target.files[0]);
    }
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!csvFile) {
      toast({
        title: "Nenhum arquivo selecionado",
        description: "Por favor, selecione um arquivo CSV.",
        variant: "destructive",
      });
      return;
    }

    const formData = new FormData();
    formData.append("csvFile", csvFile);

    if (attachmentFile) {
      formData.append("attachment", attachmentFile);
    }

    mutation.mutate(formData);
  };

  const totalPages = Math.max(
    1,
    Math.ceil((recipientsRes?.total ?? 0) / 50),
  );
  const rows = recipientsRes?.data ?? [];

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-3xl font-bold mb-8">Envio em Massa de Cortesias</h1>
      <Tabs
        value={activeTab}
        onValueChange={handleTabChange}
        className="w-full"
      >
        <TabsList className="mb-6">
          <TabsTrigger value="envio">Envio</TabsTrigger>
          <TabsTrigger value="visualizar">Visualizar</TabsTrigger>
        </TabsList>

        <TabsContent value="envio" className="mt-0">
          <Card>
            <CardHeader>
              <CardTitle>Enviar Cortesias por CSV</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="csvFile">Arquivo CSV *</Label>
                  <Input
                    id="csvFile"
                    type="file"
                    accept=".csv"
                    onChange={handleCsvChange}
                    required
                  />
                  <p className="text-sm text-gray-500">
                    O arquivo deve conter as colunas: name, email,
                    amount_of_courtesies, event_id
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="attachment">Anexo (Opcional)</Label>
                  <Input
                    id="attachment"
                    type="file"
                    onChange={handleAttachmentChange}
                  />
                  <p className="text-sm text-gray-500">
                    Selecione um arquivo para anexar a todos os e-mails de
                    cortesia (PDF, DOC, etc.)
                  </p>
                  {attachmentFile && (
                    <p className="text-sm text-green-600">
                      Arquivo selecionado: {attachmentFile.name}
                    </p>
                  )}
                </div>

                <Button type="submit" disabled={mutation.isPending}>
                  {mutation.isPending ? "Enviando..." : "Enviar E-mails"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="visualizar" className="mt-0">
          <Card>
            <CardHeader>
              <CardTitle>Destinatários (envio em massa)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Evento</Label>
                <EventSelector
                  value={selectedEvent?.id ?? null}
                  onSelect={(ev) => {
                    setSelectedEvent(ev);
                    setView("list");
                    setSelectedLink(null);
                    setSearchText("");
                    setDebouncedSearch("");
                    setPage(1);
                  }}
                />
              </div>

              {selectedEvent && view === "list" && (
                <>
                  <div>
                    <Label htmlFor="ms-search" className="mb-1 block">
                      Buscar por nome ou e-mail
                    </Label>
                    <Input
                      id="ms-search"
                      placeholder="Filtrar destinatários..."
                      value={searchText}
                      onChange={(e) => setSearchText(e.target.value)}
                      className="max-w-md"
                    />
                  </div>

                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Nome</TableHead>
                          <TableHead>E-mail</TableHead>
                          <TableHead>Código</TableHead>
                          <TableHead>Enviadas</TableHead>
                          <TableHead>Utilizadas</TableHead>
                          <TableHead>Restantes</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {recipientsLoading ? (
                          Array.from({ length: 4 }).map((_, i) => (
                            <TableRow key={i}>
                              {Array.from({ length: 7 }).map((__, j) => (
                                <TableCell key={j}>
                                  <Skeleton className="h-4 w-full" />
                                </TableCell>
                              ))}
                            </TableRow>
                          ))
                        ) : rows.length === 0 && !recipientsError ? (
                          <TableRow>
                            <TableCell
                              colSpan={7}
                              className="h-24 text-center text-muted-foreground"
                            >
                              Nenhum envio encontrado para este evento.
                            </TableCell>
                          </TableRow>
                        ) : (
                          rows.map((r) => (
                            <TableRow
                              key={r.id}
                              role="button"
                              tabIndex={0}
                              className="cursor-pointer"
                              onClick={() => {
                                setSelectedLink({ id: r.id, code: r.code });
                                setView("redeemers");
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  setSelectedLink({ id: r.id, code: r.code });
                                  setView("redeemers");
                                }
                              }}
                            >
                              <TableCell className="font-medium">
                                {r.recipientName}
                              </TableCell>
                              <TableCell>{r.recipientEmail}</TableCell>
                              <TableCell>
                                <code className="text-xs font-mono">
                                  {r.code}
                                </code>
                              </TableCell>
                              <TableCell>{r.ticketCount}</TableCell>
                              <TableCell>{r.usedCount}</TableCell>
                              <TableCell>{r.remaining}</TableCell>
                              <TableCell>
                                {r.isActive ? (
                                  <Badge>Ativo</Badge>
                                ) : (
                                  <Badge variant="secondary" className="text-muted-foreground">
                                    Inativo
                                  </Badge>
                                )}
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>

                  {recipientsRes && totalPages > 1 && (
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm text-muted-foreground">
                        Mostrando {rows.length} de {recipientsRes.total}
                      </p>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={page <= 1}
                          onClick={() => setPage((p) => Math.max(1, p - 1))}
                        >
                          Anterior
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={page >= totalPages}
                          onClick={() =>
                            setPage((p) => Math.min(totalPages, p + 1))
                          }
                        >
                          Próxima
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}

              {selectedEvent &&
                view === "redeemers" &&
                selectedLink && (
                  <CourtesyLinkRedemptionsTable
                    eventId={selectedEvent.id}
                    link={selectedLink}
                    onBack={() => {
                      setView("list");
                      setSelectedLink(null);
                    }}
                  />
                )}

              {!selectedEvent && (
                <p className="text-center text-sm text-muted-foreground">
                  Selecione um evento para ver os destinatários do envio em massa.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

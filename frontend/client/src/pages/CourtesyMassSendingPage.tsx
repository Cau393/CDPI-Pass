import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearch } from "wouter";
import { FileSpreadsheet } from "lucide-react";
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
import { CourtesyLinkActiveToggleButton } from "@/components/admin/CourtesyLinkActiveToggleButton";
import CourtesyLinkRedemptionsTable from "@/components/admin/CourtesyLinkRedemptionsTable";
import { exportMassSendToXlsx } from "@/lib/exportMassSendExcel";
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

const MAX_EXPORT_PAGES = 500;

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
  const [exportingExcel, setExportingExcel] = useState(false);

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

  const bulkSetMassSendActiveMutation = useMutation({
    mutationFn: async (isActive: boolean) => {
      if (!selectedEvent?.id) throw new Error("no event");
      const res = await apiRequest(
        "PATCH",
        `/api/admin/events/${selectedEvent.id}/mass-send-recipients`,
        { isActive },
      );
      return res.json() as Promise<{ updated: number }>;
    },
    onSuccess: async (body, isActive) => {
      toast({
        title: isActive ? "Cortesias ativadas" : "Cortesias desativadas",
        description: `${body.updated} link(s) atualizado(s).`,
      });
      await queryClient.invalidateQueries({ queryKey: ["mass-send-recipients"] });
    },
    onError: (error: Error, isActive) => {
      toast({
        title: isActive ? "Erro ao ativar" : "Erro ao desativar",
        description: parseApiErrorMessage(error),
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

  const handleExportExcel = useCallback(async () => {
    if (!selectedEvent?.id) return;
    setExportingExcel(true);
    try {
      const all: MassSendRecipient[] = [];
      let pageNum = 1;
      let total = Number.POSITIVE_INFINITY;
      while (all.length < total && pageNum <= MAX_EXPORT_PAGES) {
        const params = new URLSearchParams();
        if (pageNum > 1) params.set("page", String(pageNum));
        const s = debouncedSearch.trim().slice(0, 120);
        if (s) params.set("search", s);
        const q = params.toString();
        const baseUrl = `/api/admin/events/${selectedEvent.id}/mass-send-recipients`;
        const url = q.length > 0 ? `${baseUrl}?${q}` : baseUrl;
        const res = await apiRequest("GET", url);
        const body: MassSendRecipientsRes = await res.json();
        total = body.total;
        all.push(...body.data);
        if (body.data.length === 0) break;
        pageNum += 1;
      }
      exportMassSendToXlsx(all, selectedEvent.title);
      toast({
        title: "Arquivo gerado",
        description: "O download do Excel foi iniciado.",
      });
    } catch {
      toast({
        title: "Erro ao exportar",
        description: "Não foi possível gerar o arquivo.",
        variant: "destructive",
      });
    } finally {
      setExportingExcel(false);
    }
  }, [selectedEvent, debouncedSearch, toast]);

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
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                    <div className="max-w-md flex-1 space-y-2">
                      <Label htmlFor="ms-search" className="mb-1 block">
                        Buscar por nome ou e-mail
                      </Label>
                      <Input
                        id="ms-search"
                        placeholder="Filtrar destinatários..."
                        value={searchText}
                        onChange={(e) => setSearchText(e.target.value)}
                        className="w-full"
                      />
                    </div>
                    <div className="flex flex-wrap gap-2 shrink-0">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="w-fit"
                        disabled={
                          recipientsLoading ||
                          bulkSetMassSendActiveMutation.isPending ||
                          (recipientsRes?.total ?? 0) === 0
                        }
                        onClick={() => bulkSetMassSendActiveMutation.mutate(true)}
                      >
                        Ativar todos
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="w-fit"
                        disabled={
                          recipientsLoading ||
                          bulkSetMassSendActiveMutation.isPending ||
                          (recipientsRes?.total ?? 0) === 0
                        }
                        onClick={() => bulkSetMassSendActiveMutation.mutate(false)}
                      >
                        Desativar todos
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="w-fit shrink-0"
                        disabled={recipientsLoading || exportingExcel}
                        onClick={() => void handleExportExcel()}
                        data-testid="mass-send-export-excel"
                      >
                        <FileSpreadsheet className="mr-2 h-4 w-4" />
                        Exportar para Excel
                      </Button>
                    </div>
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
                          <TableHead className="w-[1%] whitespace-nowrap">
                            Ações
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {recipientsLoading ? (
                          Array.from({ length: 4 }).map((_, i) => (
                            <TableRow key={i}>
                              {Array.from({ length: 8 }).map((__, j) => (
                                <TableCell key={j}>
                                  <Skeleton className="h-4 w-full" />
                                </TableCell>
                              ))}
                            </TableRow>
                          ))
                        ) : rows.length === 0 && !recipientsError ? (
                          <TableRow>
                            <TableCell
                              colSpan={8}
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
                              <TableCell
                                className="text-right"
                                onClick={(e) => e.stopPropagation()}
                                onKeyDown={(e) => e.stopPropagation()}
                              >
                                <CourtesyLinkActiveToggleButton
                                  linkId={r.id}
                                  isActive={r.isActive}
                                  onSuccess={() => {
                                    void queryClient.invalidateQueries({
                                      queryKey: ["mass-send-recipients"],
                                    });
                                  }}
                                />
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

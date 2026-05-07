import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Search, Save, Users } from "lucide-react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { parseApiErrorMessage } from "@/lib/eventForm";
import { CourtesyLinkActiveToggleButton } from "@/components/admin/CourtesyLinkActiveToggleButton";

interface CourtesyLinkSummary {
  id: string;
  code: string;
  eventId: string;
  ticketCount: number;
  usedCount: number;
  isActive: boolean | null;
}

interface LookupResponse {
  link: CourtesyLinkSummary;
  eventTitle: string | null;
}

export default function AdminCourtesyQuotaPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [codeInput, setCodeInput] = useState("");
  const [submittedCode, setSubmittedCode] = useState<string | null>(null);
  const [newTicketCount, setNewTicketCount] = useState("");

  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ["/api/admin/courtesy-links/by-code", submittedCode],
    enabled: Boolean(submittedCode && submittedCode.length > 0),
    queryFn: async (): Promise<LookupResponse> => {
      const c = submittedCode;
      if (!c) {
        throw new Error("Código ausente");
      }
      const res = await apiRequest(
        "GET",
        `/api/admin/courtesy-links/by-code/${encodeURIComponent(c)}`,
      );
      return res.json() as Promise<LookupResponse>;
    },
  });

  useEffect(() => {
    if (data?.link) {
      setNewTicketCount(String(data.link.ticketCount));
    }
  }, [data?.link?.id, data?.link?.ticketCount]);

  const saveMutation = useMutation({
    mutationFn: async (payload: { id: string; ticketCount: number }) => {
      const res = await apiRequest("PATCH", `/api/admin/courtesy-links/${payload.id}`, {
        ticketCount: payload.ticketCount,
      });
      return res.json() as Promise<{ link: CourtesyLinkSummary }>;
    },
    onSuccess: (result) => {
      queryClient.setQueryData<LookupResponse>(
        ["/api/admin/courtesy-links/by-code", submittedCode],
        (prev) =>
          prev
            ? { ...prev, link: result.link }
            : { link: result.link, eventTitle: data?.eventTitle ?? null },
      );
      setNewTicketCount(String(result.link.ticketCount));
      void queryClient.invalidateQueries({ queryKey: ["/api/courtesy-links"] });
      if (result.link.id) {
        void queryClient.invalidateQueries({
          queryKey: ["courtesy-link-redemptions", result.link.id],
        });
      }
      toast({
        title: "Limite atualizado",
        description: `Novo máximo: ${result.link.ticketCount} usos.`,
      });
    },
    onError: (err) => {
      toast({
        title: "Erro ao salvar",
        description: parseApiErrorMessage(err),
        variant: "destructive",
      });
    },
  });

  const handleBuscar = () => {
    const t = codeInput.trim();
    if (!t) {
      toast({
        title: "Código obrigatório",
        description: "Informe o código de cortesia ou promoção.",
        variant: "destructive",
      });
      return;
    }
    if (t === submittedCode) {
      if (data?.link?.id) {
        void queryClient.invalidateQueries({
          queryKey: ["courtesy-link-redemptions", data.link.id],
        });
      }
      void refetch();
    } else {
      setSubmittedCode(t);
    }
  };

  const handleNovaBusca = () => {
    setSubmittedCode(null);
    setCodeInput("");
    setNewTicketCount("");
    queryClient.removeQueries({
      queryKey: ["/api/admin/courtesy-links/by-code"],
    });
    queryClient.removeQueries({
      queryKey: ["courtesy-link-redemptions"],
    });
  };

  const handleSalvar = () => {
    if (!data?.link) return;
    const n = Number.parseInt(newTicketCount.trim(), 10);
    if (
      !Number.isFinite(n) ||
      !Number.isInteger(n) ||
      n < 1
    ) {
      toast({
        title: "Valor inválido",
        description: "Digite um número inteiro para o novo limite.",
        variant: "destructive",
      });
      return;
    }
    if (n < data.link.usedCount) {
      toast({
        title: "Limite inválido",
        description: "O novo limite não pode ser menor que os usos já registrados.",
        variant: "destructive",
      });
      return;
    }
    saveMutation.mutate({ id: data.link.id, ticketCount: n });
  };

  const lookupErrorMessage =
    isError && error ? parseApiErrorMessage(error) : null;
  const showEditor = Boolean(data?.link && !isLoading);

  const parsedLimit = useMemo(() => {
    const t = newTicketCount.trim();
    if (t === "") return null;
    return Number.parseInt(t, 10);
  }, [newTicketCount]);

  const limitValid =
    parsedLimit !== null &&
    Number.isFinite(parsedLimit) &&
    Number.isInteger(parsedLimit) &&
    parsedLimit >= 1 &&
    (data?.link ? parsedLimit >= data.link.usedCount : true);

  const canSave =
    showEditor &&
    newTicketCount.trim() !== "" &&
    limitValid &&
    !saveMutation.isPending;

  const resgatantesHref = data?.link
    ? `/admin/courtesy-quota/resgates/${
        data.link.id
      }?${new URLSearchParams({
        code: data.link.code,
        eventId: data.link.eventId,
      }).toString()}`
    : "";

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <Breadcrumb className="mb-4">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/cortesia-admin">Cortesias</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Limite por código</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Editar limite de cortesia</h1>
        <p className="text-sm text-muted-foreground">
          Busque pelo código, ajuste o limite e veja quem já resgatou com este link.
        </p>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg">Buscar código</CardTitle>
          <CardDescription>
            Digite o código exatamente como divulgado (maiúsculas/minúsculas podem importar).
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-2">
            <Label htmlFor="courtesy-code">Código</Label>
            <Input
              id="courtesy-code"
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value)}
              placeholder="Ex.: PROMO2026"
              disabled={Boolean(submittedCode && isFetching)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleBuscar();
                }
              }}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => handleBuscar()} disabled={isFetching}>
              {isFetching ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Buscando...
                </>
              ) : (
                <>
                  <Search className="mr-2 h-4 w-4" />
                  Buscar
                </>
              )}
            </Button>
            {submittedCode && (
              <Button type="button" variant="outline" onClick={handleNovaBusca}>
                Nova busca
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {lookupErrorMessage && submittedCode && (
        <div className="mb-6 rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {lookupErrorMessage}
        </div>
      )}

      {showEditor && data?.link && (
        <div className="grid gap-6 lg:grid-cols-[minmax(380px,min(470px,42%))_minmax(300px,min(640px,58%))]">
          <Card className="h-fit min-w-0 w-full lg:sticky lg:top-6 lg:self-start">
            <CardHeader>
              <CardTitle>Link encontrado</CardTitle>
              <CardDescription>
                {data.eventTitle ? (
                  <span>
                    Evento: <strong>{data.eventTitle}</strong>
                  </span>
                ) : (
                  "Evento vinculado ao link."
                )}
              </CardDescription>
            </CardHeader>
            <Separator />
            <CardContent className="space-y-6 pt-6">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-muted-foreground">Código</span>
                <code className="rounded bg-muted px-2 py-0.5 text-sm font-medium">
                  {data.link.code}
                </code>
                {data.link.isActive === false && (
                  <Badge variant="secondary">Inativo</Badge>
                )}
                <CourtesyLinkActiveToggleButton
                  linkId={data.link.id}
                  isActive={data.link.isActive ?? true}
                  className="w-full sm:ml-auto sm:w-auto"
                  onSuccess={(next) => {
                    queryClient.setQueryData<LookupResponse>(
                      ["/api/admin/courtesy-links/by-code", submittedCode],
                      (prev) =>
                        prev
                          ? { ...prev, link: { ...prev.link, isActive: next } }
                          : prev,
                    );
                    void queryClient.invalidateQueries({
                      queryKey: ["/api/courtesy-links"],
                    });
                    void queryClient.invalidateQueries({
                      queryKey: ["courtesy-link-redemptions", data.link.id],
                    });
                  }}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-muted-foreground">
                    Usos atuais
                  </p>
                  <p className="text-2xl font-semibold tabular-nums">{data.link.usedCount}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium text-muted-foreground">
                    Limite atual
                  </p>
                  <p className="text-2xl font-semibold tabular-nums">{data.link.ticketCount}</p>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="new-ticket-count">Novo limite (ticketCount)</Label>
                <Input
                  id="new-ticket-count"
                  inputMode="numeric"
                  value={newTicketCount}
                  onChange={(e) => setNewTicketCount(e.target.value.replaceAll(/\D/g, ""))}
                  placeholder="Ex.: 100"
                />
                <p className="text-xs text-muted-foreground">
                  Deve ser um inteiro ≥ 1 e não menor que os usos já registrados ({data.link.usedCount}).
                </p>
              </div>
            </CardContent>
            <CardFooter className="flex flex-col border-t pt-6">
              <Button
                type="button"
                className="w-full"
                disabled={!canSave}
                onClick={handleSalvar}
              >
                {saveMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    Salvar novo limite
                  </>
                )}
              </Button>
            </CardFooter>
          </Card>

          <Card className="min-w-0 w-full max-w-3xl justify-self-start">
            <CardHeader>
              <CardTitle>Resgatantes</CardTitle>
              <CardDescription>
                Abra a página de lista para ver todas as colunas (como na aba Visualizar do envio em massa) e cancelar inscrições. Pedidos já cancelados não aparecem na lista.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <p className="text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">{data.link.usedCount}</span>{" "}
                uso(s) registrado(s) com este código.
              </p>
              <Button asChild variant="default" className="w-full sm:w-fit">
                <Link href={resgatantesHref}>
                  <Users className="mr-2 h-4 w-4" aria-hidden />
                  Ver lista completa de resgatantes
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

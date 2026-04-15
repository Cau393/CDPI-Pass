import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Search, Save } from "lucide-react";
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
  };

  const handleSalvar = () => {
    if (!data?.link) return;
    const n = Number.parseInt(newTicketCount.trim(), 10);
    if (!Number.isFinite(n)) {
      toast({
        title: "Valor inválido",
        description: "Digite um número inteiro para o novo limite.",
        variant: "destructive",
      });
      return;
    }
    saveMutation.mutate({ id: data.link.id, ticketCount: n });
  };

  const lookupErrorMessage =
    isError && error ? parseApiErrorMessage(error) : null;
  const showEditor = Boolean(data?.link && !isLoading);
  const canSave =
    showEditor &&
    newTicketCount.trim() !== "" &&
    !saveMutation.isPending;

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
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
          Busque pelo código e ajuste apenas o número máximo de usos do link.
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
        <Card>
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
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">Usos atuais</p>
                <p className="text-2xl font-semibold tabular-nums">{data.link.usedCount}</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">Limite atual</p>
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
      )}
    </div>
  );
}

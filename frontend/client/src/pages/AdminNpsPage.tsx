import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, LineChart } from "lucide-react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import EventSelector from "@/components/admin/EventSelector";
import { apiRequest } from "@/lib/queryClient";
import type { Event } from "@shared/schema";
import { downloadNpsResponsesExcel, type AdminNpsApiResponse } from "@/lib/exportNpsExcel";
import { Skeleton } from "@/components/ui/skeleton";

export default function AdminNpsPage() {
  const [eventId, setEventId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Event | null>(null);

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["/api/admin/events", eventId, "nps"],
    enabled: Boolean(eventId),
    queryFn: async (): Promise<AdminNpsApiResponse> => {
      const res = await apiRequest("GET", `/api/admin/events/${eventId}/nps`);
      return res.json() as Promise<AdminNpsApiResponse>;
    },
  });

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <Breadcrumb className="mb-4">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/admin/events?tab=list">Eventos</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Pesquisa NPS</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="mb-6 flex items-start gap-3">
        <LineChart className="mt-1 h-8 w-8 shrink-0 text-primary" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Exportar respostas NPS</h1>
          <p className="text-sm text-muted-foreground">
            Baixe as respostas da pesquisa de certificado em Excel (.xlsx), conforme o tipo
            configurado no evento.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Evento</CardTitle>
          <CardDescription>
            As colunas do arquivo seguem o modelo “Evento do CDPI” ou “CDPI Apoiando Evento”.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <p className="text-sm font-medium">Selecione o evento</p>
            <EventSelector
              value={eventId}
              onSelect={(ev) => {
                setEventId(ev.id);
                setSelected(ev);
              }}
              triggerClassName="w-full justify-between"
            />
          </div>

          {!eventId && (
            <p className="text-sm text-muted-foreground">Escolha um evento para ver as respostas.</p>
          )}

          {eventId && isLoading && (
            <div className="space-y-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-10 w-40" />
            </div>
          )}

          {eventId && isError && (
            <p className="text-sm text-destructive">
              Não foi possível carregar as respostas. Tente novamente.
            </p>
          )}

          {eventId && data && !isError && (
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm">
                <p>
                  <span className="font-medium">Tipo de pesquisa:</span>{" "}
                  {data.npsType === "cdpi_event" ? "Evento do CDPI" : "CDPI Apoiando Evento"}
                </p>
                <p className="text-muted-foreground">
                  {data.count} resposta{data.count === 1 ? "" : "s"}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void refetch()}
                  disabled={isFetching}
                >
                  Atualizar
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={!selected || data.count === 0}
                  onClick={() => {
                    if (selected && data.count > 0) {
                      downloadNpsResponsesExcel(data, selected.title);
                    }
                  }}
                >
                  <Download className="mr-2 h-4 w-4" />
                  Exportar Excel
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

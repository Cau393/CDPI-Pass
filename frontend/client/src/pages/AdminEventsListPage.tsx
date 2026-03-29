import { useCallback, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiRequest } from "@/lib/queryClient";
import type { Event } from "@shared/schema";

const PAGE_SIZE = 10;

interface PaginatedResponse {
  events: Event[];
  total: number;
  page: number;
  limit: number;
}

export default function AdminEventsListPage() {
  const [page, setPage] = useState(1);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["admin-events-paginated", page],
    queryFn: async (): Promise<PaginatedResponse> => {
      const res = await apiRequest(
        "GET",
        `/api/admin/events?page=${page}&limit=${PAGE_SIZE}`,
      );
      return res.json() as Promise<PaginatedResponse>;
    },
  });

  const events = data?.events ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const formatRowDate = useCallback((ev: Event) => {
    const d = ev.date instanceof Date ? ev.date : new Date(ev.date as string);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
    });
  }, []);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 p-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbPage>Eventos</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Eventos</h1>
          <p className="text-sm text-muted-foreground">
            Gerencie eventos cadastrados ({total} total).
          </p>
        </div>
        <Button asChild>
          <Link href="/admin/events/new">Novo evento</Link>
        </Button>
      </div>

      {isError && (
        <p className="text-sm text-destructive">Não foi possível carregar a lista.</p>
      )}

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Título</TableHead>
              <TableHead className="hidden sm:table-cell">Data</TableHead>
              <TableHead className="hidden md:table-cell">Local</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={3} className="text-muted-foreground">
                  Carregando...
                </TableCell>
              </TableRow>
            ) : events.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="text-muted-foreground">
                  Nenhum evento nesta página.
                </TableCell>
              </TableRow>
            ) : (
              events.map((ev) => (
                <TableRow
                  key={ev.id}
                  className="cursor-pointer hover:bg-muted/50"
                  data-testid={`row-event-${ev.id}`}
                >
                  <TableCell className="font-medium">
                    <Link href={`/admin/events/${ev.id}`} className="text-primary hover:underline">
                      {ev.title}
                    </Link>
                  </TableCell>
                  <TableCell className="hidden tabular-nums sm:table-cell">
                    {formatRowDate(ev)}
                  </TableCell>
                  <TableCell className="hidden max-w-[220px] truncate md:table-cell">
                    {ev.location}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            Página {page} de {totalPages} · {PAGE_SIZE} por página
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="h-4 w-4" />
              Anterior
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Próxima
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

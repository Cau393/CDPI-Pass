import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Copy, Search } from "lucide-react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Event } from "@shared/schema";
import { eventDescriptionPlainText } from "@/lib/eventDescriptionHtml";
import { useToast } from "@/hooks/use-toast";

const PAGE_SIZE = 10;

export default function AdminEventsListPage({
  variant = "standalone",
}: {
  variant?: "standalone" | "hub";
} = {}) {
  const { toast } = useToast();
  const [page, setPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");

  const { data: allEvents = [], isLoading, isError } = useQuery<Event[]>({
    queryKey: ["/api/admin/events"],
  });

  const filteredEvents = useMemo(() => {
    const search = searchTerm.toLowerCase();
    const filtered = search
      ? allEvents.filter((event) => {
          const descPlain = eventDescriptionPlainText(
            String(event.description ?? ""),
          ).toLowerCase();
          return (
            event.title.toLowerCase().includes(search) ||
            descPlain.includes(search) ||
            String(event.location ?? "").toLowerCase().includes(search)
          );
        })
      : allEvents;
    return [...filtered].sort((a, b) => +new Date(b.date) - +new Date(a.date));
  }, [allEvents, searchTerm]);

  const totalFiltered = filteredEvents.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / PAGE_SIZE));

  useEffect(() => {
    setPage(1);
  }, [searchTerm]);

  useEffect(() => {
    setPage((p) => Math.min(p, totalPages));
  }, [totalPages]);

  const events = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filteredEvents.slice(start, start + PAGE_SIZE);
  }, [filteredEvents, page]);

  const formatRowDate = useCallback((ev: Event) => {
    const d = ev.date instanceof Date ? ev.date : new Date(ev.date as string);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
    });
  }, []);

  const emptyMessage = (() => {
    if (isLoading) return null;
    if (allEvents.length === 0) return "Nenhum evento cadastrado.";
    if (totalFiltered === 0) return "Nenhum evento encontrado com os termos pesquisados.";
    return null;
  })();

  let tableBodyRows: ReactNode;
  if (isLoading) {
    tableBodyRows = (
      <TableRow>
        <TableCell colSpan={4} className="text-muted-foreground">
          Carregando...
        </TableCell>
      </TableRow>
    );
  } else if (emptyMessage) {
    tableBodyRows = (
      <TableRow>
        <TableCell colSpan={4} className="text-muted-foreground">
          {emptyMessage}
        </TableCell>
      </TableRow>
    );
  } else {
    tableBodyRows = events.map((ev) => (
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
        <TableCell className="hidden tabular-nums sm:table-cell">{formatRowDate(ev)}</TableCell>
        <TableCell className="hidden max-w-[220px] truncate md:table-cell">{ev.location}</TableCell>
        <TableCell className="hidden w-[52px] p-1 md:table-cell">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
            aria-label={`Copiar event_id (${ev.title})`}
            title="Copiar UUID do evento (event_id)"
            data-testid={`copy-event-id-${ev.id}`}
            onClick={(e) => {
              e.preventDefault();
              void navigator.clipboard.writeText(ev.id);
              toast({
                title: "Copiado",
                description: "O event_id foi copiado para a área de transferência.",
              });
            }}
          >
            <Copy className="h-4 w-4" />
          </Button>
        </TableCell>
      </TableRow>
    ));
  }

  return (
    <div
      className={
        variant === "hub"
          ? "mx-auto flex max-w-5xl flex-col gap-6 p-0"
          : "mx-auto flex max-w-5xl flex-col gap-6 p-6"
      }
    >
      {variant === "standalone" ? (
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbPage>Eventos</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          {variant === "hub" ? (
            <h2 className="text-xl font-bold tracking-tight">Lista de eventos</h2>
          ) : (
            <h1 className="text-2xl font-bold tracking-tight">Eventos</h1>
          )}
          <p className="text-sm text-muted-foreground">
            Gerencie eventos cadastrados ({allEvents.length} total).
            {searchTerm.trim() && !isLoading
              ? ` ${totalFiltered} correspondem à busca.`
              : ""}
          </p>
        </div>
        <Button asChild>
          <Link href="/admin/events?tab=novo">Novo evento</Link>
        </Button>
      </div>

      <div className="relative max-w-md">
        <Input
          type="text"
          placeholder="Buscar eventos..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
          data-testid="input-search-admin-events"
        />
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
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
              <TableHead className="hidden w-[52px] md:table-cell" aria-hidden />
            </TableRow>
          </TableHeader>
          <TableBody>{tableBodyRows}</TableBody>
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

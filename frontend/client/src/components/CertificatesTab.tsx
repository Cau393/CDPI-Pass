import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import { NpsCertificateModal } from "@/components/nps/NpsCertificateModal";

export interface CertificateEligibility {
  eventId: string;
  eventName: string;
  eventDate: string;
  certificateUrl: string | null;
  npsType: "cdpi_event" | "cdpi_apoiando";
}

interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export function CertificatesTab() {
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<CertificateEligibility[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState<CertificateEligibility | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await apiRequest("GET", `/api/users/me/certificates?page=${page}`);
        const json = (await res.json()) as {
          data: CertificateEligibility[];
          pagination: PaginationMeta;
        };
        if (!cancelled) {
          setItems(json.data);
          setPagination(json.pagination);
        }
      } catch {
        if (!cancelled) {
          setItems([]);
          setPagination(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [page]);

  const handleCertificateGenerated = (eventId: string, url: string) => {
    setItems((prev) =>
      prev.map((item) =>
        item.eventId === eventId ? { ...item, certificateUrl: url } : item,
      ),
    );
  };

  const totalPages = pagination?.totalPages ?? 0;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Certificados</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 animate-pulse rounded-lg bg-muted" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">Nenhum certificado disponível.</p>
          ) : (
            <ul className="divide-y rounded-md border">
              {items.map((item) => (
                <li
                  key={item.eventId}
                  className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-semibold">{item.eventName}</p>
                    <p className="text-sm text-muted-foreground">
                      {new Intl.DateTimeFormat("pt-BR", { dateStyle: "long" }).format(
                        new Date(item.eventDate),
                      )}
                    </p>
                  </div>
                  <div className="shrink-0">
                    {item.certificateUrl ? (
                      // A real link, not window.open: in-app browsers and iOS with
                      // pop-ups blocked silently ignore programmatic window.open.
                      <Button asChild variant="outline">
                        <a
                          href={item.certificateUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          data-testid={`link-certificate-${item.eventId}`}
                        >
                          Baixar certificado
                        </a>
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        onClick={() => {
                          setSelectedEvent(item);
                          setIsModalOpen(true);
                        }}
                      >
                        Gerar certificado
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {!loading && pagination && pagination.total > 0 && (
            <div className="mt-6 flex items-center justify-center gap-4">
              <Button
                type="button"
                variant="outline"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Anterior
              </Button>
              <span className="text-sm text-muted-foreground">
                Página {pagination.page} de {totalPages || 1}
              </span>
              <Button
                type="button"
                variant="outline"
                disabled={totalPages === 0 || page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Próxima
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <NpsCertificateModal
        event={selectedEvent}
        open={isModalOpen}
        onOpenChange={(o) => {
          setIsModalOpen(o);
          if (!o) setSelectedEvent(null);
        }}
        onCertificateGenerated={handleCertificateGenerated}
      />
    </>
  );
}

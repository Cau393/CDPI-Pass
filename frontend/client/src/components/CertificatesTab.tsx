import { useCallback, useEffect, useState } from "react";
import { Loader2, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

export interface CertificateEligibility {
  eventId: string;
  eventName: string;
  eventDate: string;
  certificateUrl: string | null;
}

interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

interface NpsResponses {
  overallRating: number;
  wouldRecommend: boolean;
  highlights: string;
  improvements: string;
}

interface GenerateCertificatePayload {
  eventId: string;
  fullName: string;
  npsResponses: NpsResponses;
}

function parseApiErrorMessage(err: Error): string {
  const m = err.message.match(/^\d+:\s*([\s\S]+)$/);
  if (!m) return err.message;
  try {
    const j = JSON.parse(m[1]) as { message?: string; error?: string };
    return j.error ?? j.message ?? m[1];
  } catch {
    return m[1];
  }
}

const RATING_OPTIONS = Array.from({ length: 10 }, (_, i) => i + 1);

type Step = "form" | "loading" | "success";

interface CertificateGenerateModalProps {
  event: CertificateEligibility | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCertificateGenerated: (eventId: string, url: string) => void;
}

function CertificateGenerateModal({
  event,
  open,
  onOpenChange,
  onCertificateGenerated,
}: CertificateGenerateModalProps) {
  const [step, setStep] = useState<Step>("form");
  const [fullName, setFullName] = useState("");
  const [overallRating, setOverallRating] = useState<string>("");
  const [wouldRecommend, setWouldRecommend] = useState<string>("");
  const [highlights, setHighlights] = useState("");
  const [improvements, setImprovements] = useState("");
  const [certificateUrl, setCertificateUrl] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{
    fullName?: string;
    overallRating?: string;
    wouldRecommend?: string;
  }>({});

  const resetForm = useCallback(() => {
    setStep("form");
    setFullName("");
    setOverallRating("");
    setWouldRecommend("");
    setHighlights("");
    setImprovements("");
    setCertificateUrl(null);
    setSubmitError(null);
    setFieldErrors({});
  }, []);

  useEffect(() => {
    if (open && event) {
      resetForm();
    }
  }, [open, event?.eventId, resetForm]);

  const validate = (): boolean => {
    const next: typeof fieldErrors = {};
    if (!fullName.trim()) {
      next.fullName = "Nome completo é obrigatório";
    } else if (fullName.length > 120) {
      next.fullName = "Máximo de 120 caracteres";
    }
    if (!overallRating) {
      next.overallRating = "Selecione uma nota de 1 a 10";
    }
    if (!wouldRecommend) {
      next.wouldRecommend = "Selecione Sim ou Não";
    }
    setFieldErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async () => {
    if (!event || !validate()) return;
    setSubmitError(null);
    setStep("loading");
    const ratingNum = Number.parseInt(overallRating, 10);
    const payload: GenerateCertificatePayload = {
      eventId: event.eventId,
      fullName: fullName.trim(),
      npsResponses: {
        overallRating: ratingNum,
        wouldRecommend: wouldRecommend === "yes",
        highlights: highlights.trim(),
        improvements: improvements.trim(),
      },
    };
    try {
      const res = await apiRequest("POST", "/api/certificates/generate", payload);
      const data = (await res.json()) as { certificateUrl: string };
      setCertificateUrl(data.certificateUrl);
      onCertificateGenerated(event.eventId, data.certificateUrl);
      setStep("success");
    } catch (e) {
      setStep("form");
      setSubmitError(parseApiErrorMessage(e as Error));
    }
  };

  return (
    <Dialog key={event?.eventId ?? "closed"} open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          step === "loading" && "[&>button.absolute]:hidden pointer-events-auto",
        )}
        onPointerDownOutside={(e) => step === "loading" && e.preventDefault()}
        onEscapeKeyDown={(e) => step === "loading" && e.preventDefault()}
      >
        {step === "form" && (
          <>
            <DialogHeader>
              <DialogTitle>Gerar certificado</DialogTitle>
              <DialogDescription>
                {event?.eventName} — responda o feedback para gerar seu certificado.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="cert-full-name">Nome completo</Label>
                <Input
                  id="cert-full-name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  maxLength={120}
                  placeholder="Como deve aparecer no certificado"
                />
                <p className="text-xs text-muted-foreground">
                  Usado apenas no certificado, não atualiza seu perfil.
                </p>
                {fieldErrors.fullName && (
                  <p className="text-sm text-destructive">{fieldErrors.fullName}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Nota geral (1–10)</Label>
                <Select value={overallRating} onValueChange={setOverallRating}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione de 1 a 10" />
                  </SelectTrigger>
                  <SelectContent>
                    {RATING_OPTIONS.map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        {n}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {fieldErrors.overallRating && (
                  <p className="text-sm text-destructive">{fieldErrors.overallRating}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Recomendaria este evento?</Label>
                <RadioGroup value={wouldRecommend} onValueChange={setWouldRecommend}>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="yes" id="rec-yes" />
                    <Label htmlFor="rec-yes" className="font-normal">
                      Sim
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="no" id="rec-no" />
                    <Label htmlFor="rec-no" className="font-normal">
                      Não
                    </Label>
                  </div>
                </RadioGroup>
                {fieldErrors.wouldRecommend && (
                  <p className="text-sm text-destructive">{fieldErrors.wouldRecommend}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="cert-highlights">O que mais gostou? (opcional)</Label>
                <Textarea
                  id="cert-highlights"
                  value={highlights}
                  onChange={(e) => setHighlights(e.target.value)}
                  rows={3}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cert-improvements">O que poderia melhorar? (opcional)</Label>
                <Textarea
                  id="cert-improvements"
                  value={improvements}
                  onChange={(e) => setImprovements(e.target.value)}
                  rows={3}
                />
              </div>
              {submitError && (
                <p className="text-sm text-destructive">{submitError}</p>
              )}
              <Button type="button" className="w-full" onClick={() => void handleSubmit()}>
                Gerar certificado
              </Button>
            </div>
          </>
        )}
        {step === "loading" && (
          <div className="flex flex-col items-center justify-center gap-4 py-12">
            <Loader2 className="animate-spin h-10 w-10 text-primary" />
            <p className="text-muted-foreground text-center">
              Por favor, aguarde, gerando seu certificado...
            </p>
          </div>
        )}
        {step === "success" && certificateUrl && (
          <div className="flex flex-col items-center justify-center gap-4 py-6 text-center">
            <CheckCircle2 className="h-12 w-12 text-green-500" />
            <h3 className="text-lg font-semibold">Certificado gerado com sucesso! 🎉</h3>
            <p className="text-sm text-muted-foreground italic">
              Seu certificado está pronto para download.
            </p>
            <Button type="button" onClick={() => window.open(certificateUrl, "_blank")}>
              Baixar certificado
            </Button>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Fechar
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
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
                <div
                  key={i}
                  className="animate-pulse h-16 rounded-lg bg-muted"
                />
              ))}
            </div>
          ) : items.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              Nenhum certificado disponível.
            </p>
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
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          const u = item.certificateUrl;
                          if (u) window.open(u, "_blank");
                        }}
                      >
                        Baixar certificado
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
            <div className="flex items-center justify-center gap-4 mt-6">
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

      <CertificateGenerateModal
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

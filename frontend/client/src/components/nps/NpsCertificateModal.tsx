import { useCallback, useEffect, useState } from "react";
import { Loader2, CheckCircle2 } from "lucide-react";
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
import { PhoneInputE164 } from "@/components/nps/PhoneInputE164";
import {
  cdpiEventNpsAnswersSchema,
  cdpiApoiandoNpsAnswersSchema,
  type CdpiEventNpsAnswers,
  type CdpiApoiandoNpsAnswers,
} from "@shared/npsAnswerSchemas";
import {
  APPLICABILITY_OPTIONS,
  ATTEND_AGAIN_OPTIONS,
  CDPI_APOIANDO_FIELD_LABELS,
  CDPI_EVENT_FIELD_LABELS,
  EXPERIENCE_RADIO_OPTIONS,
  NPS_SCORE_OPTIONS,
  SIM_NAO_OPTIONS,
  THEMES_RELEVANCE_OPTIONS,
} from "@/lib/npsForms";
import type { ZodIssue } from "zod";

export interface NpsCertificateEventInfo {
  eventId: string;
  eventName: string;
  eventDate: string;
  certificateUrl: string | null;
  npsType: "cdpi_event" | "cdpi_apoiando";
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

function zodIssuesToMap(issues: ZodIssue[]): Record<string, string> {
  const m: Record<string, string> = {};
  for (const i of issues) {
    const k = i.path.length ? i.path.join(".") : "_form";
    if (m[k] === undefined) m[k] = i.message;
  }
  return m;
}

const emptyCdpiEventAnswers = (): CdpiEventNpsAnswers => ({
  name: "",
  email: "",
  phone: "",
  overallRating: "Excelente",
  themesRelevance: "Muito relevantes",
  speakersRating: "Excelente",
  applicability: "Totalmente aplicável",
  highlight: "",
  organizationRating: "Excelente",
  wouldAttendAgain: "Sim, com certeza",
  improvements: "",
  interestInTopics: "Não",
  interestTopicText: "",
  recommendationScore: 10,
});

const emptyCdpiApoiandoAnswers = (): CdpiApoiandoNpsAnswers => ({
  name: "",
  email: "",
  phone: "",
  overallScore: 10,
  themesRelevance: "Muito relevantes",
  applicability: "Totalmente aplicável",
  futureTopics: "",
  organizationExperience: "Excelente",
  improvements: "",
  wantsUpdates: "Não",
});

type Step = "form" | "loading" | "success";

interface NpsCertificateModalProps {
  event: NpsCertificateEventInfo | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCertificateGenerated: (eventId: string, url: string) => void;
}

export function NpsCertificateModal({
  event,
  open,
  onOpenChange,
  onCertificateGenerated,
}: NpsCertificateModalProps) {
  const [step, setStep] = useState<Step>("form");
  const [cdpiEventForm, setCdpiEventForm] = useState(emptyCdpiEventAnswers);
  const [cdpiApoiandoForm, setCdpiApoiandoForm] = useState(emptyCdpiApoiandoAnswers);
  const [certificateUrl, setCertificateUrl] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const resetForm = useCallback(() => {
    setStep("form");
    setCdpiEventForm(emptyCdpiEventAnswers());
    setCdpiApoiandoForm(emptyCdpiApoiandoAnswers());
    setCertificateUrl(null);
    setSubmitError(null);
    setFieldErrors({});
  }, []);

  useEffect(() => {
    if (open && event) {
      resetForm();
    }
  }, [open, event?.eventId, event?.npsType, resetForm]);

  const handleSubmitCdpiEvent = async () => {
    if (!event || event.npsType !== "cdpi_event") return;
    const parsed = cdpiEventNpsAnswersSchema.safeParse(cdpiEventForm);
    if (!parsed.success) {
      setFieldErrors(zodIssuesToMap(parsed.error.issues));
      return;
    }
    setFieldErrors({});
    setSubmitError(null);
    setStep("loading");
    try {
      const res = await apiRequest("POST", "/api/certificates/generate", {
        npsType: "cdpi_event" as const,
        eventId: event.eventId,
        answers: parsed.data,
      });
      const data = (await res.json()) as { certificateUrl: string };
      setCertificateUrl(data.certificateUrl);
      onCertificateGenerated(event.eventId, data.certificateUrl);
      setStep("success");
    } catch (e) {
      setStep("form");
      setSubmitError(parseApiErrorMessage(e as Error));
    }
  };

  const handleSubmitApoiando = async () => {
    if (!event || event.npsType !== "cdpi_apoiando") return;
    const parsed = cdpiApoiandoNpsAnswersSchema.safeParse(cdpiApoiandoForm);
    if (!parsed.success) {
      setFieldErrors(zodIssuesToMap(parsed.error.issues));
      return;
    }
    setFieldErrors({});
    setSubmitError(null);
    setStep("loading");
    try {
      const res = await apiRequest("POST", "/api/certificates/generate", {
        npsType: "cdpi_apoiando" as const,
        eventId: event.eventId,
        answers: parsed.data,
      });
      const data = (await res.json()) as { certificateUrl: string };
      setCertificateUrl(data.certificateUrl);
      onCertificateGenerated(event.eventId, data.certificateUrl);
      setStep("success");
    } catch (e) {
      setStep("form");
      setSubmitError(parseApiErrorMessage(e as Error));
    }
  };

  const err = (k: string) => fieldErrors[k];

  return (
    <Dialog key={event?.eventId ?? "closed"} open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "max-h-[90vh] overflow-y-auto sm:max-w-lg",
          step === "loading" && "[&>button.absolute]:hidden pointer-events-auto",
        )}
        onPointerDownOutside={(e) => step === "loading" && e.preventDefault()}
        onEscapeKeyDown={(e) => step === "loading" && e.preventDefault()}
      >
        {step === "form" && event?.npsType === "cdpi_event" && (
          <>
            <DialogHeader>
              <DialogTitle>Gerar certificado</DialogTitle>
              <DialogDescription>
                {event.eventName} — pesquisa de satisfação (Evento do CDPI).
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="nps-name">{CDPI_EVENT_FIELD_LABELS.name} *</Label>
                <Input
                  id="nps-name"
                  value={cdpiEventForm.name}
                  onChange={(e) => setCdpiEventForm((s) => ({ ...s, name: e.target.value }))}
                  maxLength={255}
                />
                {err("name") && <p className="text-sm text-destructive">{err("name")}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="nps-email">{CDPI_EVENT_FIELD_LABELS.email} *</Label>
                <Input
                  id="nps-email"
                  type="email"
                  autoComplete="email"
                  value={cdpiEventForm.email}
                  onChange={(e) => setCdpiEventForm((s) => ({ ...s, email: e.target.value }))}
                />
                {err("email") && <p className="text-sm text-destructive">{err("email")}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="nps-phone">{CDPI_EVENT_FIELD_LABELS.phone} *</Label>
                <PhoneInputE164
                  id="nps-phone"
                  value={cdpiEventForm.phone}
                  onChange={(phone) => setCdpiEventForm((s) => ({ ...s, phone }))}
                  aria-invalid={Boolean(err("phone"))}
                />
                {err("phone") && <p className="text-sm text-destructive">{err("phone")}</p>}
              </div>

              <FieldSelect
                label={CDPI_EVENT_FIELD_LABELS.overallRating}
                value={cdpiEventForm.overallRating}
                onChange={(v) =>
                  setCdpiEventForm((s) => ({
                    ...s,
                    overallRating: v as CdpiEventNpsAnswers["overallRating"],
                  }))
                }
                options={EXPERIENCE_RADIO_OPTIONS}
                error={err("overallRating")}
              />
              <FieldSelect
                label={CDPI_EVENT_FIELD_LABELS.themesRelevance}
                value={cdpiEventForm.themesRelevance}
                onChange={(v) =>
                  setCdpiEventForm((s) => ({
                    ...s,
                    themesRelevance: v as CdpiEventNpsAnswers["themesRelevance"],
                  }))
                }
                options={THEMES_RELEVANCE_OPTIONS}
                error={err("themesRelevance")}
              />
              <FieldSelect
                label={CDPI_EVENT_FIELD_LABELS.speakersRating}
                value={cdpiEventForm.speakersRating}
                onChange={(v) =>
                  setCdpiEventForm((s) => ({
                    ...s,
                    speakersRating: v as CdpiEventNpsAnswers["speakersRating"],
                  }))
                }
                options={EXPERIENCE_RADIO_OPTIONS}
                error={err("speakersRating")}
              />
              <FieldSelect
                label={CDPI_EVENT_FIELD_LABELS.applicability}
                value={cdpiEventForm.applicability}
                onChange={(v) =>
                  setCdpiEventForm((s) => ({
                    ...s,
                    applicability: v as CdpiEventNpsAnswers["applicability"],
                  }))
                }
                options={APPLICABILITY_OPTIONS}
                error={err("applicability")}
              />

              <div className="space-y-2">
                <Label htmlFor="nps-highlight">{CDPI_EVENT_FIELD_LABELS.highlight} *</Label>
                <Textarea
                  id="nps-highlight"
                  value={cdpiEventForm.highlight}
                  onChange={(e) => setCdpiEventForm((s) => ({ ...s, highlight: e.target.value }))}
                  rows={3}
                />
                {err("highlight") && (
                  <p className="text-sm text-destructive">{err("highlight")}</p>
                )}
              </div>

              <FieldSelect
                label={CDPI_EVENT_FIELD_LABELS.organizationRating}
                value={cdpiEventForm.organizationRating}
                onChange={(v) =>
                  setCdpiEventForm((s) => ({
                    ...s,
                    organizationRating: v as CdpiEventNpsAnswers["organizationRating"],
                  }))
                }
                options={EXPERIENCE_RADIO_OPTIONS}
                error={err("organizationRating")}
              />
              <FieldSelect
                label={CDPI_EVENT_FIELD_LABELS.wouldAttendAgain}
                value={cdpiEventForm.wouldAttendAgain}
                onChange={(v) =>
                  setCdpiEventForm((s) => ({
                    ...s,
                    wouldAttendAgain: v as CdpiEventNpsAnswers["wouldAttendAgain"],
                  }))
                }
                options={ATTEND_AGAIN_OPTIONS}
                error={err("wouldAttendAgain")}
              />

              <div className="space-y-2">
                <Label htmlFor="nps-improvements">{CDPI_EVENT_FIELD_LABELS.improvements} *</Label>
                <Textarea
                  id="nps-improvements"
                  value={cdpiEventForm.improvements}
                  onChange={(e) => setCdpiEventForm((s) => ({ ...s, improvements: e.target.value }))}
                  rows={3}
                />
                {err("improvements") && (
                  <p className="text-sm text-destructive">{err("improvements")}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label>{CDPI_EVENT_FIELD_LABELS.interestInTopics}</Label>
                <RadioGroup
                  value={cdpiEventForm.interestInTopics}
                  onValueChange={(v) =>
                    setCdpiEventForm((s) => ({
                      ...s,
                      interestInTopics: v as CdpiEventNpsAnswers["interestInTopics"],
                      ...(v === "Não" ? { interestTopicText: "" } : {}),
                    }))
                  }
                >
                  {SIM_NAO_OPTIONS.map((opt) => (
                    <div key={opt} className="flex items-center space-x-2">
                      <RadioGroupItem value={opt} id={`interest-${opt}`} />
                      <Label htmlFor={`interest-${opt}`} className="font-normal">
                        {opt}
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
                {err("interestInTopics") && (
                  <p className="text-sm text-destructive">{err("interestInTopics")}</p>
                )}
              </div>

              {cdpiEventForm.interestInTopics === "Sim" && (
                <div className="space-y-2">
                  <Label htmlFor="nps-interest-text">{CDPI_EVENT_FIELD_LABELS.interestTopicText}</Label>
                  <Textarea
                    id="nps-interest-text"
                    value={cdpiEventForm.interestTopicText ?? ""}
                    onChange={(e) =>
                      setCdpiEventForm((s) => ({ ...s, interestTopicText: e.target.value }))
                    }
                    rows={2}
                  />
                  {err("interestTopicText") && (
                    <p className="text-sm text-destructive">{err("interestTopicText")}</p>
                  )}
                </div>
              )}

              <FieldSelect
                label={CDPI_EVENT_FIELD_LABELS.recommendationScore}
                value={String(cdpiEventForm.recommendationScore)}
                onChange={(v) =>
                  setCdpiEventForm((s) => ({ ...s, recommendationScore: Number.parseInt(v, 10) }))
                }
                options={NPS_SCORE_OPTIONS.map(String)}
                error={err("recommendationScore")}
              />

              {submitError && <p className="text-sm text-destructive">{submitError}</p>}
              <Button type="button" className="w-full" onClick={() => void handleSubmitCdpiEvent()}>
                Gerar certificado
              </Button>
            </div>
          </>
        )}

        {step === "form" && event?.npsType === "cdpi_apoiando" && (
          <>
            <DialogHeader>
              <DialogTitle>Gerar certificado</DialogTitle>
              <DialogDescription>
                {event.eventName} — pesquisa de satisfação (CDPI Apoiando Evento).
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="nps-a-name">{CDPI_APOIANDO_FIELD_LABELS.name} *</Label>
                <Input
                  id="nps-a-name"
                  value={cdpiApoiandoForm.name}
                  onChange={(e) => setCdpiApoiandoForm((s) => ({ ...s, name: e.target.value }))}
                  maxLength={255}
                />
                {err("name") && <p className="text-sm text-destructive">{err("name")}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="nps-a-email">{CDPI_APOIANDO_FIELD_LABELS.email} *</Label>
                <Input
                  id="nps-a-email"
                  type="email"
                  autoComplete="email"
                  value={cdpiApoiandoForm.email}
                  onChange={(e) => setCdpiApoiandoForm((s) => ({ ...s, email: e.target.value }))}
                />
                {err("email") && <p className="text-sm text-destructive">{err("email")}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="nps-a-phone">{CDPI_APOIANDO_FIELD_LABELS.phone} *</Label>
                <PhoneInputE164
                  id="nps-a-phone"
                  value={cdpiApoiandoForm.phone}
                  onChange={(phone) => setCdpiApoiandoForm((s) => ({ ...s, phone }))}
                  aria-invalid={Boolean(err("phone"))}
                />
                {err("phone") && <p className="text-sm text-destructive">{err("phone")}</p>}
              </div>

              <FieldSelect
                label={CDPI_APOIANDO_FIELD_LABELS.overallScore}
                value={String(cdpiApoiandoForm.overallScore)}
                onChange={(v) =>
                  setCdpiApoiandoForm((s) => ({
                    ...s,
                    overallScore: Number.parseInt(v, 10),
                  }))
                }
                options={NPS_SCORE_OPTIONS.map(String)}
                error={err("overallScore")}
              />
              <FieldSelect
                label={CDPI_APOIANDO_FIELD_LABELS.themesRelevance}
                value={cdpiApoiandoForm.themesRelevance}
                onChange={(v) =>
                  setCdpiApoiandoForm((s) => ({
                    ...s,
                    themesRelevance: v as CdpiApoiandoNpsAnswers["themesRelevance"],
                  }))
                }
                options={THEMES_RELEVANCE_OPTIONS}
                error={err("themesRelevance")}
              />
              <FieldSelect
                label={CDPI_APOIANDO_FIELD_LABELS.applicability}
                value={cdpiApoiandoForm.applicability}
                onChange={(v) =>
                  setCdpiApoiandoForm((s) => ({
                    ...s,
                    applicability: v as CdpiApoiandoNpsAnswers["applicability"],
                  }))
                }
                options={APPLICABILITY_OPTIONS}
                error={err("applicability")}
              />

              <div className="space-y-2">
                <Label htmlFor="nps-a-future">{CDPI_APOIANDO_FIELD_LABELS.futureTopics} *</Label>
                <Textarea
                  id="nps-a-future"
                  value={cdpiApoiandoForm.futureTopics}
                  onChange={(e) =>
                    setCdpiApoiandoForm((s) => ({ ...s, futureTopics: e.target.value }))
                  }
                  rows={3}
                />
                {err("futureTopics") && (
                  <p className="text-sm text-destructive">{err("futureTopics")}</p>
                )}
              </div>

              <FieldSelect
                label={CDPI_APOIANDO_FIELD_LABELS.organizationExperience}
                value={cdpiApoiandoForm.organizationExperience}
                onChange={(v) =>
                  setCdpiApoiandoForm((s) => ({
                    ...s,
                    organizationExperience: v as CdpiApoiandoNpsAnswers["organizationExperience"],
                  }))
                }
                options={EXPERIENCE_RADIO_OPTIONS}
                error={err("organizationExperience")}
              />

              <div className="space-y-2">
                <Label htmlFor="nps-a-improvements">{CDPI_APOIANDO_FIELD_LABELS.improvements} *</Label>
                <Textarea
                  id="nps-a-improvements"
                  value={cdpiApoiandoForm.improvements}
                  onChange={(e) =>
                    setCdpiApoiandoForm((s) => ({ ...s, improvements: e.target.value }))
                  }
                  rows={3}
                />
                {err("improvements") && (
                  <p className="text-sm text-destructive">{err("improvements")}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label>{CDPI_APOIANDO_FIELD_LABELS.wantsUpdates}</Label>
                <RadioGroup
                  value={cdpiApoiandoForm.wantsUpdates}
                  onValueChange={(v) =>
                    setCdpiApoiandoForm((s) => ({
                      ...s,
                      wantsUpdates: v as CdpiApoiandoNpsAnswers["wantsUpdates"],
                    }))
                  }
                >
                  {SIM_NAO_OPTIONS.map((opt) => (
                    <div key={opt} className="flex items-center space-x-2">
                      <RadioGroupItem value={opt} id={`wants-${opt}`} />
                      <Label htmlFor={`wants-${opt}`} className="font-normal">
                        {opt}
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
                {err("wantsUpdates") && (
                  <p className="text-sm text-destructive">{err("wantsUpdates")}</p>
                )}
              </div>

              {submitError && <p className="text-sm text-destructive">{submitError}</p>}
              <Button type="button" className="w-full" onClick={() => void handleSubmitApoiando()}>
                Gerar certificado
              </Button>
            </div>
          </>
        )}

        {step === "loading" && (
          <div className="flex flex-col items-center justify-center gap-4 py-12">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <p className="text-center text-muted-foreground">
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

function FieldSelect({
  label,
  value,
  onChange,
  options,
  error,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: readonly string[];
  error?: string;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue placeholder="Selecione" />
        </SelectTrigger>
        <SelectContent>
          {options.map((opt) => (
            <SelectItem key={opt} value={opt}>
              {opt}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

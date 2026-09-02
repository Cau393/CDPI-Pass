import { useCallback, useEffect, useState } from "react";
import { Loader2, CheckCircle2, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { PhoneInputE164 } from "@/components/nps/PhoneInputE164";
import {
  cdpiEventNpsAnswersSchema,
  cdpiApoiandoNpsAnswersSchema,
  type CdpiEventNpsAnswers,
} from "@shared/npsAnswerSchemas";
import {
  ATTEND_AGAIN_OPTIONS,
  CAREER_VALUE_OPTIONS,
  CDPI_APOIANDO_FIELD_LABELS,
  CDPI_EVENT_FIELD_LABELS,
  EXPERIENCE_RADIO_OPTIONS,
  NPS_SCORE_OPTIONS,
  SIM_NAO_OPTIONS,
  SUPPORT_RATING_OPTIONS,
  WORKSHOP_FEELING_OPTIONS,
} from "@/lib/npsForms";
import {
  NPS_PRIVACY_CONSENT_SECTIONS,
  NPS_PRIVACY_CONSENT_TITLE,
} from "@/lib/npsPrivacyConsent";
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

type CdpiEventNpsForm = {
  name: string;
  email: string;
  phone: string;
  workshopFeeling: string;
  themesRelevant: string;
  instructorsDidactics: string;
  highlight: string;
  careerValue: string;
  wouldAttendAgain: string;
  supportRating: string;
  supportOtherText: string;
  messageToTeam: string;
  privacyConsent: boolean;
};

type CdpiApoiandoNpsForm = {
  name: string;
  email: string;
  phone: string;
  overallScore: number | undefined;
  futureTopics: string;
  organizationExperience: string;
  organizationOtherText: string;
  feedback: string;
  privacyConsent: boolean;
};

const emptyCdpiEventAnswers = (): CdpiEventNpsForm => ({
  name: "",
  email: "",
  phone: "",
  workshopFeeling: "",
  themesRelevant: "",
  instructorsDidactics: "",
  highlight: "",
  careerValue: "",
  wouldAttendAgain: "",
  supportRating: "",
  supportOtherText: "",
  messageToTeam: "",
  privacyConsent: false,
});

const emptyCdpiApoiandoAnswers = (): CdpiApoiandoNpsForm => ({
  name: "",
  email: "",
  phone: "",
  overallScore: undefined,
  futureTopics: "",
  organizationExperience: "",
  organizationOtherText: "",
  feedback: "",
  privacyConsent: false,
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
                {event.eventName} — pesquisa de satisfação (Evento CDPI).
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
                label={CDPI_EVENT_FIELD_LABELS.workshopFeeling}
                value={cdpiEventForm.workshopFeeling}
                onChange={(v) => setCdpiEventForm((s) => ({ ...s, workshopFeeling: v }))}
                options={WORKSHOP_FEELING_OPTIONS}
                error={err("workshopFeeling")}
                required
              />

              <div className="space-y-2">
                <Label>{CDPI_EVENT_FIELD_LABELS.themesRelevant} *</Label>
                <RadioGroup
                  value={cdpiEventForm.themesRelevant}
                  onValueChange={(v) =>
                    setCdpiEventForm((s) => ({
                      ...s,
                      themesRelevant: v as CdpiEventNpsAnswers["themesRelevant"],
                    }))
                  }
                >
                  {SIM_NAO_OPTIONS.map((opt) => (
                    <div key={opt} className="flex items-center space-x-2">
                      <RadioGroupItem value={opt} id={`themes-${opt}`} />
                      <Label htmlFor={`themes-${opt}`} className="font-normal">
                        {opt}
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
                {err("themesRelevant") && (
                  <p className="text-sm text-destructive">{err("themesRelevant")}</p>
                )}
              </div>

              <FieldSelect
                label={CDPI_EVENT_FIELD_LABELS.instructorsDidactics}
                value={cdpiEventForm.instructorsDidactics}
                onChange={(v) => setCdpiEventForm((s) => ({ ...s, instructorsDidactics: v }))}
                options={EXPERIENCE_RADIO_OPTIONS}
                error={err("instructorsDidactics")}
                required
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
                label={CDPI_EVENT_FIELD_LABELS.careerValue}
                value={cdpiEventForm.careerValue}
                onChange={(v) => setCdpiEventForm((s) => ({ ...s, careerValue: v }))}
                options={CAREER_VALUE_OPTIONS}
                error={err("careerValue")}
                required
              />
              <FieldSelect
                label={CDPI_EVENT_FIELD_LABELS.wouldAttendAgain}
                value={cdpiEventForm.wouldAttendAgain}
                onChange={(v) => setCdpiEventForm((s) => ({ ...s, wouldAttendAgain: v }))}
                options={ATTEND_AGAIN_OPTIONS}
                error={err("wouldAttendAgain")}
                required
              />
              <FieldSelect
                label={CDPI_EVENT_FIELD_LABELS.supportRating}
                value={cdpiEventForm.supportRating}
                onChange={(v) =>
                  setCdpiEventForm((s) => ({
                    ...s,
                    supportRating: v,
                    ...(v !== "Outro" ? { supportOtherText: "" } : {}),
                  }))
                }
                options={SUPPORT_RATING_OPTIONS}
                error={err("supportRating")}
                required
              />

              {cdpiEventForm.supportRating === "Outro" && (
                <div className="space-y-2">
                  <Label htmlFor="nps-support-other">
                    {CDPI_EVENT_FIELD_LABELS.supportOtherText} *
                  </Label>
                  <Textarea
                    id="nps-support-other"
                    value={cdpiEventForm.supportOtherText}
                    onChange={(e) =>
                      setCdpiEventForm((s) => ({ ...s, supportOtherText: e.target.value }))
                    }
                    rows={2}
                  />
                  {err("supportOtherText") && (
                    <p className="text-sm text-destructive">{err("supportOtherText")}</p>
                  )}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="nps-message">{CDPI_EVENT_FIELD_LABELS.messageToTeam}</Label>
                <Textarea
                  id="nps-message"
                  value={cdpiEventForm.messageToTeam}
                  onChange={(e) =>
                    setCdpiEventForm((s) => ({ ...s, messageToTeam: e.target.value }))
                  }
                  rows={3}
                />
                {err("messageToTeam") && (
                  <p className="text-sm text-destructive">{err("messageToTeam")}</p>
                )}
              </div>

              <PrivacyConsentBlock
                checked={cdpiEventForm.privacyConsent}
                onCheckedChange={(checked) =>
                  setCdpiEventForm((s) => ({ ...s, privacyConsent: checked }))
                }
                error={err("privacyConsent")}
                checkboxId="nps-privacy"
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
                {event.eventName} — pesquisa de satisfação (Evento de Terceiros).
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
                value={
                  cdpiApoiandoForm.overallScore === undefined
                    ? ""
                    : String(cdpiApoiandoForm.overallScore)
                }
                onChange={(v) =>
                  setCdpiApoiandoForm((s) => ({
                    ...s,
                    overallScore: Number.parseInt(v, 10),
                  }))
                }
                options={NPS_SCORE_OPTIONS.map(String)}
                error={err("overallScore")}
                required
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
                    organizationExperience: v,
                    ...(v !== "Outro" ? { organizationOtherText: "" } : {}),
                  }))
                }
                options={SUPPORT_RATING_OPTIONS}
                error={err("organizationExperience")}
                required
              />

              {cdpiApoiandoForm.organizationExperience === "Outro" && (
                <div className="space-y-2">
                  <Label htmlFor="nps-a-org-other">
                    {CDPI_APOIANDO_FIELD_LABELS.organizationOtherText} *
                  </Label>
                  <Textarea
                    id="nps-a-org-other"
                    value={cdpiApoiandoForm.organizationOtherText}
                    onChange={(e) =>
                      setCdpiApoiandoForm((s) => ({ ...s, organizationOtherText: e.target.value }))
                    }
                    rows={2}
                  />
                  {err("organizationOtherText") && (
                    <p className="text-sm text-destructive">{err("organizationOtherText")}</p>
                  )}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="nps-a-feedback">{CDPI_APOIANDO_FIELD_LABELS.feedback}</Label>
                <Textarea
                  id="nps-a-feedback"
                  value={cdpiApoiandoForm.feedback}
                  onChange={(e) =>
                    setCdpiApoiandoForm((s) => ({ ...s, feedback: e.target.value }))
                  }
                  rows={3}
                />
                {err("feedback") && (
                  <p className="text-sm text-destructive">{err("feedback")}</p>
                )}
              </div>

              <PrivacyConsentBlock
                checked={cdpiApoiandoForm.privacyConsent}
                onCheckedChange={(checked) =>
                  setCdpiApoiandoForm((s) => ({ ...s, privacyConsent: checked }))
                }
                error={err("privacyConsent")}
                checkboxId="nps-a-privacy"
              />

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
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: readonly string[];
  error?: string;
  required?: boolean;
}) {
  return (
    <div className="space-y-2">
      <Label>
        {label}
        {required ? " *" : ""}
      </Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger aria-label={label}>
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

function PrivacyConsentBlock({
  checked,
  onCheckedChange,
  error,
  checkboxId,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  error?: string;
  checkboxId: string;
}) {
  return (
    <div className="space-y-3 rounded-lg border p-3">
      <Collapsible>
        <CollapsibleTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            className="flex h-auto w-full items-center justify-between px-0 py-1 text-left font-medium hover:bg-transparent"
          >
            {NPS_PRIVACY_CONSENT_TITLE}
            <ChevronDown className="h-4 w-4 shrink-0 opacity-70" />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-3 pt-2 text-sm text-muted-foreground">
          {NPS_PRIVACY_CONSENT_SECTIONS.map((section) => (
            <div key={section.title} className="space-y-1">
              <p className="font-medium text-foreground">{section.title}</p>
              <p>{section.body}</p>
            </div>
          ))}
        </CollapsibleContent>
      </Collapsible>
      <div className="flex items-start space-x-2">
        <Checkbox
          id={checkboxId}
          checked={checked}
          onCheckedChange={(v) => onCheckedChange(v === true)}
        />
        <Label htmlFor={checkboxId} className="font-normal leading-snug">
          {CDPI_EVENT_FIELD_LABELS.privacyConsent} *
        </Label>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

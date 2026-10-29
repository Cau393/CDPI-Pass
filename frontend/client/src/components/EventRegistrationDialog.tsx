import { useEffect, useRef, useState, type FormEvent } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DocumentFields } from "@/components/DocumentFields";
import { PhoneInputE164 } from "@/components/nps/PhoneInputE164";
import { TurnstileWidget, isTurnstileConfigured, type TurnstileHandle } from "@/components/TurnstileWidget";
import { RegistrationFields } from "@/components/RegistrationFields";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
import { parseApiErrorMessage } from "@/lib/eventForm";
import {
  legacyPrefill,
  registrationAnswerErrors,
  registrationAnswersPayload,
  registrationQuestionsFor,
  type RegistrationQuestions,
} from "@/lib/eventRegistration";
import type { GuestBuyer } from "@/lib/guestBuyer";
import { accountEmailSchema, refineAccountDocument, type Event } from "@shared/schema";
import type { SystemField } from "@shared/eventRegistrationForm";
import {
  FOREIGN_PAID_CHECKOUT_ENABLED,
  FOREIGN_PAID_UNAVAILABLE_MESSAGE,
  foreignPaidCheckoutBlocked,
} from "@shared/foreignCheckout";

type DialogEvent = Pick<Event, "title" | "modality" | "isFree" | "registrationForm">;

type IdentityValues = {
  isForeigner: boolean;
  cpf: string;
  foreignDocument: string;
  address: string;
  // Guest mode only (no account): who is buying.
  name: string;
  email: string;
  phone: string;
};

/** What the dialog hands back (R32). `buyer` is present iff the dialog ran in guest mode. */
export interface RegistrationConfirmation {
  answers: Record<string, string>;
  buyer?: GuestBuyer;
  /** Present only when a Turnstile token was solved. */
  turnstileToken?: string;
}

const ACCOUNT_REFRESH_FAILED = "Não foi possível atualizar seus dados. Tente novamente.";

/**
 * Inscription questions (ADR-016): the document and address the event needs
 * and the account lacks, then the event's own questions. The document and
 * address are saved on the account first; the answers go back to the caller,
 * which sends them with the order. Callers skip it when
 * `needsRegistrationDialog` is false.
 *
 * What was typed lives here, not in the dialog content, so reopening after a
 * 400 identity_required keeps it.
 *
 * Guest mode (ADR-017): no account when it opens. It then also asks who is
 * buying (name, e-mail, phone), never saves an identity, and returns the typed
 * data as `buyer` for the caller to send with the order or the subscription.
 */
export function EventRegistrationDialog({
  open,
  event,
  confirmLabel,
  pending = false,
  error,
  missing,
  turnstile = false,
  identityConflict = false,
  buyer: prefillBuyer,
  initialAnswers,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  event: DialogEvent | null;
  confirmLabel: string;
  pending?: boolean;
  /** Error from the caller's inscription request, shown inline. */
  error?: string | null;
  /** From a 400 identity_required: asked even if the cached account has it. */
  missing?: readonly SystemField[];
  /** Guest mode: render the Turnstile challenge and hold the submit until it is solved. */
  turnstile?: boolean;
  /** The request error is a 409 identity_conflict: offer the way out (e-mail lookup, login). */
  identityConflict?: boolean;
  /** Guest mode: the last buyer typed, to prefill a reopened dialog. */
  buyer?: GuestBuyer | null;
  /** The last answers given, to prefill a reopened dialog. */
  initialAnswers?: Record<string, string>;
  onCancel: () => void;
  onConfirm: (confirmation: RegistrationConfirmation) => void;
}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [answerErrors, setAnswerErrors] = useState<Record<string, string>>({});
  const [identityError, setIdentityError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const isBusy = isSaving || pending;
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);

  // The account as it was when the dialog opened: saving the identity
  // refreshes it, and the questions must not vanish while the dialog is open.
  const [wasOpen, setWasOpen] = useState(open);
  const [accountAtOpen, setAccountAtOpen] = useState(user);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setAccountAtOpen(user);
      setIdentityError(null);
      setAnswerErrors({});
      // The widget remounts with the dialog: a token from the last mount is spent.
      setTurnstileToken(null);
    }
  }
  const questions = event ? registrationQuestionsFor(event, accountAtOpen, missing) : null;
  const isGuest = accountAtOpen == null;

  const turnstileRef = useRef<TurnstileHandle>(null);
  const needsTurnstile = turnstile && isTurnstileConfigured();
  const waitingForTurnstile = needsTurnstile && turnstileToken == null;
  // Tokens are single use: a fresh challenge after every request ends.
  const wasPending = useRef(pending);
  useEffect(() => {
    if (wasPending.current && !pending) turnstileRef.current?.reset();
    wasPending.current = pending;
  }, [pending]);

  // Guards onConfirm after an await: closing or unmounting mid-save must not
  // subscribe or open the payment.
  const isOpenRef = useRef(open);
  useEffect(() => {
    isOpenRef.current = open;
    return () => {
      isOpenRef.current = false;
    };
  }, [open]);

  const form = useForm<IdentityValues>({
    resolver: zodResolver(identitySchemaFor(questions, isGuest)),
    defaultValues: {
      isForeigner: false,
      cpf: "",
      foreignDocument: "",
      address: "",
      name: "",
      email: "",
      phone: "",
    },
  });
  // A paid event can't be bought by a foreign visitor yet: saving the passport here
  // would lock the account as foreign (write-once) for a checkout that refuses it.
  const foreignPaidBlocked =
    Boolean(event && !event.isFree) && foreignPaidCheckoutBlocked({ isForeigner: form.watch("isForeigner") });

  // Reopened guest dialog (after identity_required / identity_conflict): fill
  // blanks from what the caller kept; whatever is already typed wins.
  useEffect(() => {
    if (!open) return;
    if (prefillBuyer) {
      const fill = (name: keyof IdentityValues, value: string | boolean | undefined) => {
        if (value === undefined || value === "") return;
        const current = form.getValues(name);
        if (typeof value === "boolean" ? !current : !String(current).trim()) form.setValue(name, value as never);
      };
      fill("name", prefillBuyer.name);
      fill("email", prefillBuyer.email);
      fill("phone", prefillBuyer.phone);
      fill("isForeigner", prefillBuyer.isForeigner);
      fill("cpf", prefillBuyer.cpf);
      fill("foreignDocument", prefillBuyer.foreignDocument);
      fill("address", prefillBuyer.address);
    }
    if (initialAnswers && Object.keys(initialAnswers).length > 0) {
      setAnswers((prev) => {
        const next = { ...prev };
        for (const [fieldId, value] of Object.entries(initialAnswers)) {
          if (!next[fieldId]?.trim()) next[fieldId] = value;
        }
        return next;
      });
    }
  }, [open]);

  useEffect(() => {
    if (!open || !user) return;
    // Prefill blanks only, when opening: the draft wins over the account.
    if (!form.getValues("address").trim() && user.address) form.setValue("address", user.address);
    if (user.isForeigner) form.setValue("isForeigner", true);
    // Legacy questions (Cargo, Empresa, Área): the account's real values, only
    // where the draft is blank (a typed draft wins). Re-runs when the account
    // arrives after the dialog opened.
    const prefill = legacyPrefill(questions?.fields ?? [], user);
    if (Object.keys(prefill).length > 0) {
      setAnswers((prev) => {
        const next = { ...prev };
        for (const [fieldId, value] of Object.entries(prefill)) {
          if (!next[fieldId]?.trim()) next[fieldId] = value;
        }
        return next;
      });
    }
  }, [open, user?.id]);

  const handleCancel = () => {
    if (isBusy) return;
    isOpenRef.current = false;
    onCancel();
  };

  /** Saves what was asked and refreshes the account; returns the error to show, if any. */
  const saveIdentity = async (
    values: IdentityValues,
    asked: RegistrationQuestions,
  ): Promise<string | null> => {
    try {
      await apiRequest("PUT", "/api/profile/identity", identityBody(values, asked));
    } catch (err) {
      return parseApiErrorMessage(err);
    }
    try {
      // The checkout reads isForeigner from this account: never continue on a stale one.
      await queryClient.refetchQueries({ queryKey: ["/api/auth/me"] }, { throwOnError: true });
    } catch {
      return ACCOUNT_REFRESH_FAILED;
    }
    return null;
  };

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    if (foreignPaidBlocked) {
      e.preventDefault();
      return;
    }
    if (!questions) return;
    // Validate the answers alongside the identity fields so every error shows at once.
    const nextAnswerErrors = registrationAnswerErrors(questions.fields, answers);
    setAnswerErrors(nextAnswerErrors);
    void form.handleSubmit(async (values) => {
      if (Object.keys(nextAnswerErrors).length > 0) return;
      setIdentityError(null);
      if (!isGuest && (questions.document || questions.address)) {
        setIsSaving(true);
        try {
          const saveError = await saveIdentity(values, questions);
          if (saveError) {
            setIdentityError(saveError);
            return;
          }
        } finally {
          setIsSaving(false);
        }
      }
      if (!isOpenRef.current) return;
      const confirmation: RegistrationConfirmation = {
        answers: registrationAnswersPayload(questions.fields, answers),
      };
      if (isGuest) {
        confirmation.buyer = buyerFrom(values, questions);
        if (needsTurnstile && turnstileToken) confirmation.turnstileToken = turnstileToken;
      }
      onConfirm(confirmation);
    })(e);
  };

  const shownError = identityError ?? error;
  const addressError = form.formState.errors.address?.message;
  const fieldErrors = form.formState.errors;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) handleCancel();
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        {event && questions ? (
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <DialogHeader>
              <DialogTitle>Complete sua inscrição</DialogTitle>
              <DialogDescription>{event.title}</DialogDescription>
            </DialogHeader>

            {isGuest ? (
              <fieldset className="space-y-3">
                <legend className="text-sm font-semibold">Seus dados</legend>
                <div className="space-y-2">
                  <Label htmlFor="guest-name">Nome completo</Label>
                  <Input
                    id="guest-name"
                    autoComplete="name"
                    className="h-11"
                    aria-invalid={Boolean(fieldErrors.name)}
                    data-testid="input-guest-name"
                    {...form.register("name")}
                  />
                  {fieldErrors.name ? (
                    <p className="text-sm font-medium text-destructive" data-testid="text-guest-name-error">
                      {fieldErrors.name.message}
                    </p>
                  ) : null}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="guest-email">E-mail</Label>
                  <Input
                    id="guest-email"
                    type="email"
                    autoComplete="email"
                    className="h-11"
                    aria-invalid={Boolean(fieldErrors.email)}
                    data-testid="input-guest-email"
                    {...form.register("email")}
                  />
                  {fieldErrors.email ? (
                    <p className="text-sm font-medium text-destructive" data-testid="text-guest-email-error">
                      {fieldErrors.email.message}
                    </p>
                  ) : null}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="guest-phone">Telefone</Label>
                  <Controller
                    name="phone"
                    control={form.control}
                    render={({ field, fieldState }) => (
                      <PhoneInputE164
                        id="guest-phone"
                        value={field.value}
                        onChange={field.onChange}
                        aria-invalid={fieldState.invalid}
                        data-testid="input-guest-phone"
                        className="w-full"
                      />
                    )}
                  />
                  {fieldErrors.phone ? (
                    <p className="text-sm font-medium text-destructive" data-testid="text-guest-phone-error">
                      {fieldErrors.phone.message}
                    </p>
                  ) : null}
                </div>
              </fieldset>
            ) : null}

            {questions.document ? (
              <div className="space-y-2">
                <DocumentFields form={form} />
                {foreignPaidBlocked ? (
                  <p role="alert" className="text-sm font-medium text-destructive">
                    {FOREIGN_PAID_UNAVAILABLE_MESSAGE}
                  </p>
                ) : !event.isFree && FOREIGN_PAID_CHECKOUT_ENABLED ? (
                  <p className="text-sm text-muted-foreground">
                    Estrangeiros pagam apenas com cartão de crédito internacional / Foreign visitors
                    pay by international credit card only
                  </p>
                ) : null}
              </div>
            ) : null}

            {questions.address ? (
              <div className="space-y-2">
                <Label htmlFor="registration-address">Endereço</Label>
                <Input
                  id="registration-address"
                  placeholder="Rua, número, cidade e país"
                  autoComplete="street-address"
                  aria-invalid={Boolean(addressError)}
                  aria-describedby={addressError ? "registration-address-error" : undefined}
                  className="h-11"
                  {...form.register("address")}
                />
                {addressError ? (
                  <p
                    id="registration-address-error"
                    className="text-sm font-medium text-destructive"
                  >
                    {addressError}
                  </p>
                ) : null}
              </div>
            ) : null}

            <RegistrationFields
              fields={questions.fields}
              values={answers}
              errors={answerErrors}
              onChange={(fieldId, value) => setAnswers((prev) => ({ ...prev, [fieldId]: value }))}
            />

            {turnstile ? <TurnstileWidget ref={turnstileRef} onToken={setTurnstileToken} /> : null}

            {shownError ? (
              <p role="alert" className="text-sm font-medium text-destructive">
                {shownError}
              </p>
            ) : null}
            {identityConflict && shownError ? (
              <p className="text-sm">
                <a className="font-medium underline" href="/forgot-email">
                  Esqueci meu e-mail
                </a>
                {" · "}
                <a
                  className="font-medium underline"
                  href={`/login?next=${encodeURIComponent(`${window.location.pathname}${window.location.search}`)}`}
                >
                  Entrar
                </a>
              </p>
            ) : null}

            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                disabled={isBusy}
                onClick={handleCancel}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                className="min-h-11"
                disabled={isBusy || foreignPaidBlocked || waitingForTurnstile}
                data-testid="button-confirm-registration"
              >
                {isBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {confirmLabel}
              </Button>
            </DialogFooter>
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function identitySchemaFor(questions: RegistrationQuestions | null, isGuest: boolean) {
  return z
    .object({
      isForeigner: z.boolean(),
      cpf: z.string(),
      foreignDocument: z.string(),
      address: z.string(),
      name: z.string(),
      email: z.string(),
      phone: z.string(),
    })
    .superRefine((data, ctx) => {
      if (isGuest) refineGuestContact(data, ctx);
      if (questions?.document) refineAccountDocument(data, ctx);
      if (questions?.address && data.address.trim().length < 10) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["address"],
          message: "Endereço deve ter pelo menos 10 caracteres",
        });
      }
    });
}

/** PUT /api/profile/identity body: only what the dialog asked. */
function identityBody(values: IdentityValues, questions: RegistrationQuestions) {
  const address = questions.address ? { address: values.address.trim() } : {};
  if (!questions.document) return address;
  if (values.isForeigner) {
    return { isForeigner: true, foreignDocument: values.foreignDocument, ...address };
  }
  return { cpf: values.cpf, ...address };
}

const issue = (ctx: z.RefinementCtx, path: string, message: string) =>
  ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });

/** Mirrors the server's `parseGuestBuyer` (name 3-120, no markup or links; e-mail; phone). */
function refineGuestContact(data: IdentityValues, ctx: z.RefinementCtx) {
  const name = data.name.trim();
  if (name.length < 3) issue(ctx, "name", "Nome deve ter pelo menos 3 caracteres");
  else if (name.length > 120) issue(ctx, "name", "Nome deve ter no máximo 120 caracteres");
  else if (/[<>]/.test(name) || /https?:\/\/|www\./i.test(name)) issue(ctx, "name", "Nome inválido");
  const email = accountEmailSchema.safeParse(data.email);
  if (!email.success) issue(ctx, "email", email.error.errors[0]?.message ?? "Email inválido");
  if (!/^\d{8,15}$/.test(data.phone)) issue(ctx, "phone", "Informe um telefone válido com DDD");
}

/** The guest buyer: contact data, plus the document and address only when asked. */
function buyerFrom(values: IdentityValues, questions: RegistrationQuestions): GuestBuyer {
  const buyer: GuestBuyer = {
    name: values.name.trim(),
    email: accountEmailSchema.parse(values.email),
    phone: values.phone,
  };
  if (questions.document) {
    if (values.isForeigner) {
      buyer.isForeigner = true;
      buyer.foreignDocument = values.foreignDocument;
    } else {
      buyer.cpf = values.cpf;
    }
  }
  if (questions.address) buyer.address = values.address.trim();
  return buyer;
}

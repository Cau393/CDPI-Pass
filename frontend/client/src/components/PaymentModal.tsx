import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CreditCard, QrCode, FileText, Copy, CheckCircle, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Event } from "@shared/schema";
import type { SystemField } from "@shared/eventRegistrationForm";
import { publicEventLocationLabel } from "@shared/eventModality";
import { isFreeEvent } from "@/lib/eventCta";
import { parseApiError, parseApiErrorMessage } from "@/lib/eventForm";
import type { GuestBuyer } from "@/lib/guestBuyer";
import { identityRequiredMissing, refreshAfterStaleRegistration, RELOAD_PAGE_MESSAGE } from "@/lib/eventRegistration";
import { CardPaymentForm, type CardPaymentFormHandle } from "@/components/CardPaymentForm";
import { CheckoutSuccess } from "@/components/CheckoutSuccess";
import { TurnstileWidget, isTurnstileConfigured, type TurnstileHandle } from "@/components/TurnstileWidget";
import { cardChargeLockFor, lockCardCharge, releaseCardCharge } from "@/lib/cardChargeLock";

interface EventForModal {
  id: string;
  title: string;
  date: string;
  location: string;
  price: string;
  promoCode?: string | null; // <-- Add promoCode here
}

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  event: Event; // Use the real Event type
  promoCode: string | null; // The promo code to be sent to the backend
  displayPrice: number; // The final price to display and use
  /** Answers from EventRegistrationDialog, sent with the order. */
  answers: Record<string, string>;
  /** The order needs a document/address the account lacks: reopen the registration dialog. */
  /** `freshEvent` is the event refetched after the refusal, when it could be. */
  onIdentityRequired: (missing: SystemField[], message: string, freshEvent?: Event) => void;
  /** Guest only: who is buying, sent with the order. */
  buyer?: GuestBuyer;
  /** A 409 identity_conflict (guest): the page reopens the registration dialog with `message`. */
  onIdentityConflict?: (message: string) => void;
  onSuccess: () => void;
}

/** R37: the card charge may have gone through; the order, if any, stays pending. */
const UNCONFIRMED_MESSAGE =
  "Não conseguimos confirmar seu pagamento agora. Não pague de novo: se a cobrança for aprovada, você recebe o ingresso por e-mail.";
const EMAIL_LATER_MESSAGE = "Você recebe o ingresso por e-mail quando o pagamento for confirmado.";
const PAID_PAYMENT_STATUSES = new Set(["CONFIRMED", "RECEIVED"]);
const POLL_INTERVAL_MS = 5_000;

interface PollTarget {
  orderId: string;
  /** Guest: the `orderAccessToken` (X-Order-Access). Logged-in: null, the session is used. */
  accessToken: string | null;
}

/** What an order attempt leaves behind. A reopened modal starts over, except for the card-charge lock. */
interface CheckoutState {
  /** PIX, boleto or hosted-card instructions (the 201 body). */
  paymentData: any;
  /** Card result screen: 201 pending (risk analysis) or 202 (outcome unknown). */
  cardOutcome: { kind: "review" } | { kind: "unconfirmed"; message: string } | null;
  paid: boolean;
  /** `order.amount` once an order exists: the total shown from then on (never `payment.value`). */
  orderAmount: number | string | null;
  poll: PollTarget | null;
  /** Polling ended without a payment: cancelled, or the order cannot be read. */
  pollNotice: string | null;
  /** After an unknown or pending card outcome: no new card submit (see `cardChargeLock`). */
  cardLocked: boolean;
  /** A card response shown inline; "unconfirmed" stays visible on every tab. */
  cardAlert: { kind: "error" | "unconfirmed"; message: string } | null;
}

const FRESH: CheckoutState = {
  paymentData: null,
  cardOutcome: null,
  paid: false,
  orderAmount: null,
  poll: null,
  pollNotice: null,
  cardLocked: false,
  cardAlert: null,
};

/** Polling for a pending order: a guest asks with its order token, a logged-in buyer with the session. */
function pollFor(orderId: unknown, accessToken: unknown, isGuest: boolean): Partial<CheckoutState> {
  if (typeof orderId !== "string") return {};
  const token = typeof accessToken === "string" ? accessToken : null;
  // Without the token a guest cannot ask (the session path would answer 401).
  if (isGuest && !token) return { pollNotice: EMAIL_LATER_MESSAGE };
  return { poll: { orderId, accessToken: token } };
}

/**
 * How a mounted or reopened modal starts: FRESH, or, while a card charge for the event is unresolved,
 * with the card submit locked, the amber alert, and polling resumed when the order is known.
 */
function startState(eventId: string, isGuest: boolean): CheckoutState {
  const lock = cardChargeLockFor(eventId);
  if (!lock) return FRESH;
  return {
    ...FRESH,
    cardLocked: true,
    cardAlert: { kind: "unconfirmed", message: UNCONFIRMED_MESSAGE },
    ...pollFor(lock.orderId, lock.accessToken, isGuest),
  };
}

export default function PaymentModal({
  isOpen,
  onClose,
  event,
  promoCode,
  displayPrice,
  answers,
  onIdentityRequired,
  buyer,
  onIdentityConflict,
  onSuccess,
}: PaymentModalProps) {
  const { toast } = useToast();
  const { user, isAuthenticated } = useAuth();
  // Guest = no authenticated user, the same test the pages use.
  const isGuest = !isAuthenticated;
  const isForeigner = user?.isForeigner === true;
  const [selectedMethod, setSelectedMethod] = useState<"pix" | "credit_card" | "boleto">("pix");

  useEffect(() => {
    if (isForeigner) setSelectedMethod("credit_card");
  }, [isForeigner]);
  // A remount (the home page unmounts the modal on close) must not lift the card-charge lock.
  const [checkout, setCheckout] = useState<CheckoutState>(() => startState(event.id, isGuest));
  const update = (patch: Partial<CheckoutState>) => setCheckout((current) => ({ ...current, ...patch }));
  const { paymentData, cardOutcome, paid, orderAmount, poll, pollNotice, cardLocked, cardAlert } = checkout;
  const [submitting, setSubmitting] = useState(false);
  // Synchronous guard: a second click before the re-render must not send a second charge.
  const inFlight = useRef(false);
  const cardFormRef = useRef<CardPaymentFormHandle>(null);
  const turnstileRef = useRef<TurnstileHandle>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);

  // Brazilian buyers type the card here; a foreign buyer keeps the hosted invoice.
  const inlineCard = selectedMethod === "credit_card" && !isForeigner;
  // The server asks Turnstile of every guest order and of every card order (R34).
  const needsTurnstile = isGuest || selectedMethod === "credit_card";
  const waitingForTurnstile = needsTurnstile && isTurnstileConfigured() && turnstileToken == null;
  const total = orderAmount != null && Number.isFinite(Number(orderAmount)) ? Number(orderAmount) : displayPrice + 5;

  useEffect(() => {
    if (!needsTurnstile) setTurnstileToken(null);
  }, [needsTurnstile]);

  // Closing drops the card data; reopening starts over (no stale order or notice), but an unresolved
  // card charge for the event stays locked.
  const wasOpen = useRef(isOpen);
  useLayoutEffect(() => {
    if (!isOpen && wasOpen.current) cardFormRef.current?.clear();
    if (isOpen && !wasOpen.current) {
      setCheckout(startState(event.id, isGuest));
      setTurnstileToken(null);
    }
    wasOpen.current = isOpen;
  }, [isOpen]);

  const markPaid = (amount?: number | string | null) => {
    // The buyer holds a paid order for the event: the server refuses a second one (409).
    releaseCardCharge(event.id);
    cardFormRef.current?.clear();
    setCheckout((current) => ({ ...current, paid: true, poll: null, orderAmount: amount ?? current.orderAmount }));
    if (!isGuest) void queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
  };

  const watchOrder = (orderId: unknown, accessToken: unknown) => pollFor(orderId, accessToken, isGuest);

  // Every 5 s while open; stops on paid, cancelled, 404, close or unmount.
  useEffect(() => {
    if (!isOpen || !poll) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const headers = poll.accessToken ? { "X-Order-Access": poll.accessToken } : undefined;
    const check = async () => {
      let again = true;
      try {
        const res = await apiRequest("POST", `/api/orders/${poll.orderId}/check-status`, undefined, headers);
        const body = await res.json();
        if (stopped) return;
        // Token path: {status, paymentStatus}. Session path: {message, order, paymentStatus}.
        if (body?.status === "paid" || body?.order?.status === "paid") {
          again = false;
          markPaid(body?.order?.amount);
        } else if (body?.status === "cancelled" || body?.order?.status === "cancelled") {
          again = false;
          // Only the cancel of the locked card order frees the card (not a PIX or boleto order's).
          const freed = cardChargeLockFor(event.id)?.orderId === poll.orderId;
          if (freed) releaseCardCharge(event.id);
          update({
            poll: null,
            pollNotice: "Pagamento cancelado",
            ...(freed ? { cardLocked: false, cardAlert: null } : {}),
          });
        }
      } catch (error) {
        if (stopped) return;
        if (parseApiError(error).status === 404) {
          again = false;
          update({ poll: null, pollNotice: EMAIL_LATER_MESSAGE });
        }
      }
      if (again && !stopped) timer = setTimeout(check, POLL_INTERVAL_MS);
    };
    timer = setTimeout(check, POLL_INTERVAL_MS);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [isOpen, poll]);

  const handleOrder = (method: string, data: any) => {
    const payUrl = data?.payment?.link ?? data?.payment?.paymentLink;
    if (method === "credit_card" && payUrl) {
      globalThis.open(payUrl, "_blank", "noopener,noreferrer");
    }
    const order = data?.order;
    update({
      paymentData: data,
      orderAmount: order?.amount ?? null,
      ...(order?.status === "pending" ? watchOrder(order.id, data?.orderAccessToken) : {}),
    });
    toast({
      title: "Pedido criado!",
      description: "Complete o pagamento para confirmar seu ingresso.",
    });
  };

  const handleCardOrder = (status: number, data: any) => {
    const order = data?.order;
    if (status !== 202 && (PAID_PAYMENT_STATUSES.has(data?.payment?.status) || order?.status === "paid")) {
      markPaid(order?.amount);
      return;
    }
    // 202 (outcome unknown, order kept) or 201 pending (risk analysis): never charge again from here.
    lockCardCharge(event.id, {
      orderId: typeof order?.id === "string" ? order.id : null,
      accessToken: typeof data?.orderAccessToken === "string" ? data.orderAccessToken : null,
    });
    update({
      cardLocked: true,
      orderAmount: order?.amount ?? null,
      cardOutcome:
        status === 202
          ? { kind: "unconfirmed", message: typeof data?.message === "string" && data.message ? data.message : UNCONFIRMED_MESSAGE }
          : { kind: "review" },
      ...watchOrder(order?.id, data?.orderAccessToken),
    });
  };

  const handleOrderError = (error: unknown, card: boolean) => {
    const parsed = parseApiError(error);
    // R37: no answer (network) or a gateway page instead of JSON: the charge may have gone through.
    // The card-charge lock set when the POST was sent stays.
    if (card && (parsed.status === null || (parsed.status >= 500 && parsed.body === undefined))) {
      update({ cardLocked: true, cardAlert: { kind: "unconfirmed", message: UNCONFIRMED_MESSAGE } });
      if (!isGuest) void queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      return;
    }
    // Every other answer is the server refusing before any charge: the card may be tried again.
    if (card) releaseCardCharge(event.id);
    const refreshed = refreshAfterStaleRegistration(error, event.id);
    if (parsed.code === "identity_conflict" && onIdentityConflict) {
      onIdentityConflict(parseApiErrorMessage(error));
      return;
    }
    const missing = identityRequiredMissing(error);
    if (missing) {
      // Reopen the dialog with the refetched event, not the captured one.
      void refreshed.then(({ event: fresh }) => {
        const message = parseApiErrorMessage(error);
        if (fresh) onIdentityRequired(missing, message, fresh);
        else onIdentityRequired(missing, message);
      });
      return;
    }
    if (card) {
      update({ cardAlert: { kind: "error", message: parseApiErrorMessage(error) } });
    } else {
      toast({
        title: "Erro ao processar pagamento",
        description: parseApiErrorMessage(error),
        variant: "destructive",
      });
    }
    void refreshed.then(({ stale, event: fresh }) => {
      if (stale === "form" && !fresh) {
        toast({ title: "Erro ao processar pagamento", description: RELOAD_PAGE_MESSAGE, variant: "destructive" });
      }
    });
  };

  const handlePayment = async () => {
    if (isFreeEvent(event) || inFlight.current) return;
    const method = selectedMethod;
    const card = method === "credit_card" && !isForeigner;
    if (card && (cardLocked || cardChargeLockFor(event.id))) return;
    // PCI: the card body is built here, never stored, and dropped once the answer is in.
    let cardFields = card ? (cardFormRef.current?.read() ?? null) : null;
    if (card && !cardFields) return;
    inFlight.current = true;
    setSubmitting(true);
    if (cardAlert?.kind === "error") update({ cardAlert: null });
    // From here the charge may happen: locked even if the modal unmounts before the answer.
    if (card) lockCardCharge(event.id);
    let result: { response: Response; data: any } | { error: unknown };
    try {
      const response = await apiRequest("POST", "/api/orders", {
        eventId: event.id,
        paymentMethod: method,
        promoCode: promoCode, // <-- This is the crucial addition
        answers,
        ...(buyer ? { buyer } : {}),
        ...(cardFields ?? {}),
        ...(needsTurnstile && turnstileToken ? { turnstileToken } : {}),
      });
      result = { response, data: await response.json() };
    } catch (error) {
      result = { error };
    } finally {
      cardFields = null;
      inFlight.current = false;
    }
    // Turnstile tokens are single use, and no CVV outlives an answer.
    turnstileRef.current?.reset();
    if (card) cardFormRef.current?.clearCvv();
    setSubmitting(false);
    if ("error" in result) handleOrderError(result.error, card);
    else if (card) handleCardOrder(result.response.status, result.data);
    else handleOrder(method, result.data);
  };

  const finish = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
    onSuccess();
    onClose();
  };

  const closeAfterOrder = () => {
    if (!isGuest) void queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
    onClose();
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copiado!",
      description: "Código PIX copiado para a área de transferência.",
    });
  };

  const formatCurrency = (value: number | string) => {
    const numValue = typeof value === 'string' ? parseFloat(value) : value;
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(numValue);
  };

  if (isFreeEvent(event)) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Inscrição gratuita</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600">
            Este evento é gratuito. Use a inscrição gratuita, não o pagamento.
          </p>
          <Button onClick={onClose} className="w-full" data-testid="button-close-free-payment">
            Fechar
          </Button>
        </DialogContent>
      </Dialog>
    );
  }

  const pollNoticeText = pollNotice ? (
    <p role="status" className="text-sm font-medium text-gray-700" data-testid="text-payment-poll-status">
      {pollNotice}
    </p>
  ) : null;

  return (
    <Dialog
      open={isOpen}
      onOpenChange={() => {
        // Closing mid-charge would let a reopened modal send a second charge.
        if (inFlight.current) return;
        onClose();
      }}
    >
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" closeDisabled={submitting}>
        <DialogHeader>
          <DialogTitle>Finalizar Compra - {event?.title}</DialogTitle>
        </DialogHeader>

        {paid ? (
          <CheckoutSuccess
            variant="paid"
            guest={isGuest}
            email={buyer?.email ?? user?.email}
            amount={orderAmount}
            onContinue={finish}
            onClose={onClose}
          />
        ) : (
        <div className="space-y-4">
          {/* Event Summary */}
          <Card>
            <CardContent className="pt-6">
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-600">Evento:</span>
                  <span className="font-semibold">{event?.title}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Data:</span>
                  <span>{new Date(event?.date).toLocaleDateString('pt-BR')}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Local:</span>
                  <span>{publicEventLocationLabel(event)}</span>
                </div>
                <div className="border-t pt-2 mt-2">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Valor do Ingresso:</span>
                    <span>{formatCurrency(displayPrice)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Taxa de Conveniência:</span>
                    <span>{formatCurrency(5)}</span>
                  </div>
                  {promoCode && (
                    <div className="flex justify-between text-sm text-gray-500">
                      <span>Preço Original:</span>
                      <span className="line-through">{formatCurrency(parseFloat(event?.price) || 0)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold text-lg mt-2">
                    <span>Total:</span>
                    <span className="text-primary" data-testid="text-payment-total">
                      {formatCurrency(total)}
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {cardOutcome ? (
            <>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center space-y-4">
                    <Clock className="h-12 w-12 mx-auto text-primary" />
                    {cardOutcome.kind === "review" ? (
                      <>
                        <h3 className="font-semibold text-lg">Pagamento em análise</h3>
                        <p className="text-sm text-gray-600" data-testid="text-payment-review">
                          A operadora está analisando o pagamento. Você recebe o ingresso por e-mail assim que ele for aprovado.
                        </p>
                      </>
                    ) : (
                      <>
                        <h3 className="font-semibold text-lg">Aguardando confirmação</h3>
                        <p role="alert" className="text-sm text-gray-700" data-testid="text-payment-unconfirmed">
                          {cardOutcome.message}
                        </p>
                      </>
                    )}
                    {pollNoticeText}
                  </div>
                </CardContent>
              </Card>
              <Button variant="outline" className="w-full" onClick={closeAfterOrder} data-testid="button-payment-close">
                Fechar
              </Button>
            </>
          ) : !paymentData ? (
            <>
              {/* Payment Method Selection */}
              <Tabs value={selectedMethod} onValueChange={(v) => setSelectedMethod(v as any)}>
                <TabsList className={`grid w-full ${isForeigner ? "grid-cols-1" : "grid-cols-3"}`}>
                  {!isForeigner && (
                  <TabsTrigger value="pix" disabled={submitting} className="flex items-center gap-2">
                    <QrCode className="h-4 w-4" />
                    PIX
                  </TabsTrigger>
                  )}
                  <TabsTrigger value="credit_card" disabled={submitting} className="flex items-center gap-2">
                    <CreditCard className="h-4 w-4" />
                    Cartão
                  </TabsTrigger>
                  {!isForeigner && (
                  <TabsTrigger value="boleto" disabled={submitting} className="flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Boleto
                  </TabsTrigger>
                  )}
                </TabsList>

                <TabsContent value="pix" className="space-y-4">
                  <Card>
                    <CardContent className="pt-6">
                      <div className="text-center space-y-2">
                        <QrCode className="h-12 w-12 mx-auto text-primary" />
                        <h3 className="font-semibold">Pagamento via PIX</h3>
                        <p className="text-sm text-gray-600">
                          Ao clicar em "Gerar PIX", você receberá um QR Code para pagamento
                        </p>
                        <p className="text-sm text-gray-600">
                          O código expira em 30 minutos
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="credit_card" className="space-y-4">
                  <Card>
                    <CardContent className="pt-6 space-y-4">
                      <div className="text-center space-y-2">
                        <CreditCard className="h-12 w-12 mx-auto text-primary" />
                        <h3 className="font-semibold">Pagamento com Cartão</h3>
                        {isForeigner ? (
                          <p className="text-sm text-gray-600">
                            Pagamento internacional somente com cartão de crédito ou débito, à vista. PIX, boleto e parcelamento não estão disponíveis.
                          </p>
                        ) : (
                          <p className="text-sm text-gray-600">
                            Aceitamos as principais bandeiras e parcelamento em até 3x.
                          </p>
                        )}
                      </div>
                      {isForeigner ? null : (
                        <CardPaymentForm
                          ref={cardFormRef}
                          total={total}
                          defaultHolder={isGuest ? { name: buyer?.name, cpf: buyer?.cpf } : { name: user?.name, cpf: user?.cpf }}
                          disabled={submitting}
                        />
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="boleto" className="space-y-4">
                  <Card>
                    <CardContent className="pt-6">
                      <div className="text-center space-y-2">
                        <FileText className="h-12 w-12 mx-auto text-primary" />
                        <h3 className="font-semibold">Pagamento via Boleto</h3>
                        <p className="text-sm text-gray-600">
                          Você receberá o boleto para pagamento
                        </p>
                        <p className="text-sm text-gray-600">
                          Vencimento em 7 dias úteis
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>

              {cardAlert?.kind === "unconfirmed" ? (
                <p
                  role="alert"
                  className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
                  data-testid="text-payment-unconfirmed"
                >
                  {cardAlert.message}
                </p>
              ) : null}
              {/* A reopened modal polling the locked card order: e.g. "Pagamento cancelado". */}
              {pollNoticeText}
              {cardAlert?.kind === "error" && inlineCard ? (
                <p role="alert" className="text-sm font-medium text-destructive" data-testid="text-card-error">
                  {cardAlert.message}
                </p>
              ) : null}
              {needsTurnstile ? <TurnstileWidget ref={turnstileRef} onToken={setTurnstileToken} /> : null}

              <Button
                onClick={() => void handlePayment()}
                className="w-full bg-primary hover:bg-secondary"
                disabled={submitting || waitingForTurnstile || (inlineCard && cardLocked)}
                data-testid="button-confirm-payment"
              >
                {submitting ? "Processando..." : 
                 selectedMethod === "pix" ? "Gerar PIX" :
                 selectedMethod === "credit_card" ? "Pagar com Cartão" :
                 "Gerar Boleto"}
              </Button>
              {submitting ? (
                // The close is blocked in flight, and a reload would drop the card-charge lock.
                <p role="status" className="text-center text-sm font-medium text-gray-700" data-testid="text-payment-in-flight">
                  Não feche nem recarregue esta página
                </p>
              ) : null}
            </>
          ) : (
            /* Payment Instructions */
            <div className="space-y-4">
              {selectedMethod === "pix" && paymentData.payment.pixQrCode && (
                <Card>
                  <CardContent className="pt-6">
                    <div className="space-y-4">
                      <div className="text-center">
                        <CheckCircle className="h-12 w-12 mx-auto text-green-500 mb-2" />
                        <h3 className="font-semibold text-lg">PIX Gerado com Sucesso!</h3>
                        <p className="text-sm text-gray-600 mt-2">
                          Escaneie o QR Code ou copie o código PIX
                        </p>
                      </div>
                      
                      {/* QR Code Image */}
                      <div className="flex justify-center">
                        <img 
                          src={`data:image/png;base64,${paymentData.payment.pixQrCode}`}
                          alt="QR Code PIX"
                          className="w-64 h-64"
                        />
                      </div>
                      
                      {/* PIX Copy Code */}
                      <div className="space-y-2">
                        <p className="text-sm font-medium text-center">Código PIX:</p>
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={paymentData.payment.pixPayload || ''}
                            readOnly
                            className="flex-1 p-2 border rounded text-xs"
                          />
                          <Button
                            onClick={() => copyToClipboard(paymentData.payment.pixPayload)}
                            size="sm"
                            variant="outline"
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                      
                      <div className="flex items-center justify-center text-sm text-yellow-600">
                        <Clock className="h-4 w-4 mr-2" />
                        Código expira em 30 minutos
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {selectedMethod === "credit_card" && (
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-center space-y-4">
                      <CreditCard className="h-12 w-12 mx-auto text-primary" />
                      <h3 className="font-semibold text-lg">Pagamento pendente</h3>
                      <p className="text-sm text-gray-600">
                        Complete o pagamento e, quando confirmado, seu QR Code será enviado por e-mail.
                      </p>
                      {(paymentData?.payment?.link ?? paymentData?.payment?.paymentLink) && (
                        <Button
                          type="button"
                          variant="outline"
                          className="w-full"
                          onClick={() =>
                            globalThis.open(
                              paymentData.payment.link ?? paymentData.payment.paymentLink,
                              "_blank",
                              "noopener,noreferrer",
                            )
                          }
                        >
                          Abrir link de pagamento
                        </Button>
                      )}
                      <p className="text-xs text-gray-500">
                        O mesmo link foi enviado para o seu e-mail.
                      </p>
                    </div>
                  </CardContent>
                </Card>
              )}

              {selectedMethod === "boleto" && (
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-center space-y-4">
                      <FileText className="h-12 w-12 mx-auto text-primary" />
                      <h3 className="font-semibold text-lg">Boleto Gerado!</h3>
                      <p className="text-sm text-gray-600">
                        Clique no botão abaixo para visualizar e imprimir o boleto
                      </p>
                      <Button asChild className="w-full bg-primary hover:bg-secondary">
                        {/* A real link, not window.open: in-app browsers and iOS with
                            pop-ups blocked silently ignore programmatic window.open. */}
                        <a
                          href={paymentData.payment.boletoUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          data-testid="link-boleto"
                        >
                          Abrir Boleto
                        </a>
                      </Button>
                      <p className="text-xs text-gray-500">
                        Vencimento: {new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              )}

              {pollNoticeText}
              <div className="text-center">
                <p className="text-sm text-gray-600 mb-4">
                  Após o pagamento, você receberá o ingresso por e-mail
                </p>
                <Button
                  onClick={finish}
                  variant="outline"
                  className="w-full"
                >
                  Concluir
                </Button>
              </div>
            </div>
          )}
        </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CreditCard, QrCode, FileText, Copy, CheckCircle, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Event } from "@shared/schema";

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
  onSuccess: () => void;
}

export default function PaymentModal({ isOpen, onClose, event, promoCode, displayPrice, onSuccess }: PaymentModalProps) {
  const { toast } = useToast();
  const [selectedMethod, setSelectedMethod] = useState<"pix" | "credit_card" | "boleto">("pix");
  const [paymentData, setPaymentData] = useState<any>(null);

  const createOrderMutation = useMutation({
    mutationFn: async (paymentMethod: string) => {
      const response = await apiRequest("POST", "/api/orders", {
        eventId: event.id,
        paymentMethod,
        promoCode: promoCode, // <-- This is the crucial addition
      });
      return response.json();
    },
    onSuccess: (data) => {
      setPaymentData(data);
      toast({
        title: "Pedido criado!",
        description: "Complete o pagamento para confirmar seu ingresso.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao processar pagamento",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handlePayment = () => {
    createOrderMutation.mutate(selectedMethod);
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

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Finalizar Compra - {event?.title}</DialogTitle>
        </DialogHeader>

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
                  <span>{event?.location}</span>
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
                    <span className="text-primary">
                      {formatCurrency(displayPrice + 5)}
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {!paymentData ? (
            <>
              {/* Payment Method Selection */}
              <Tabs value={selectedMethod} onValueChange={(v) => setSelectedMethod(v as any)}>
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="pix" className="flex items-center gap-2">
                    <QrCode className="h-4 w-4" />
                    PIX
                  </TabsTrigger>
                  <TabsTrigger value="credit_card" className="flex items-center gap-2">
                    <CreditCard className="h-4 w-4" />
                    Cartão
                  </TabsTrigger>
                  <TabsTrigger value="boleto" className="flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Boleto
                  </TabsTrigger>
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
                    <CardContent className="pt-6">
                      <div className="text-center space-y-2">
                        <CreditCard className="h-12 w-12 mx-auto text-primary" />
                        <h3 className="font-semibold">Pagamento com Cartão</h3>
                        <p className="text-sm text-gray-600">
                          O link de pagamento será enviado no seu email!
                        </p>
                        <p className="text-sm text-gray-600">
                          Aceitamos todas as bandeiras
                        </p>
                      </div>
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

              <Button
                onClick={handlePayment}
                className="w-full bg-primary hover:bg-secondary"
                disabled={createOrderMutation.isPending}
                data-testid="button-confirm-payment"
              >
                {createOrderMutation.isPending ? "Processando..." : 
                 selectedMethod === "pix" ? "Gerar PIX" :
                 selectedMethod === "credit_card" ? "Pagar com Cartão" :
                 "Gerar Boleto"}
              </Button>
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
                      <h3 className="font-semibold text-lg">Pagamento Pendente, cheque seu email</h3>
                      <p className="text-sm text-gray-600">
                        Foi enviado um link no seu email para finalizar o pagamento!
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
                      <Button
                        onClick={() => window.open(paymentData.payment.boletoUrl, '_blank')}
                        className="w-full bg-primary hover:bg-secondary"
                      >
                        Abrir Boleto
                      </Button>
                      <p className="text-xs text-gray-500">
                        Vencimento: {new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              )}

              <div className="text-center">
                <p className="text-sm text-gray-600 mb-4">
                  Após o pagamento, você receberá o ingresso por e-mail
                </p>
                <Button
                  onClick={() => {
                    queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
                    onSuccess();
                    onClose();
                  }}
                  variant="outline"
                  className="w-full"
                >
                  Concluir
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
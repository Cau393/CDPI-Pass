import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
import { Ticket, CreditCard, QrCode, FileBarChart } from "lucide-react";
import type { Event } from "@shared/schema";

interface PurchaseModalProps {
  event: Event | null;
  isOpen: boolean;
  onClose: () => void;
}

export default function PurchaseModal({ event, isOpen, onClose }: PurchaseModalProps) {
  const { toast } = useToast();
  const { isAuthenticated } = useAuth();
  const [paymentMethod, setPaymentMethod] = useState("credit_card");

  const createOrderMutation = useMutation({
    mutationFn: async (data: { eventId: string; paymentMethod: string }) => {
      const response = await apiRequest("POST", "/api/orders", data);
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Pedido criado com sucesso!",
        description: "Você será redirecionado para o pagamento.",
      });
      
      // Handle payment redirect based on method
      if (data.payment?.paymentLink) {
        window.open(data.payment.paymentLink, '_blank');
      }
      
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      onClose();
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao criar pedido",
        description: error.message || "Tente novamente",
        variant: "destructive",
      });
    },
  });

  const handlePurchase = () => {
    if (!isAuthenticated) {
      toast({
        title: "Login necessário",
        description: "Você precisa estar logado para comprar ingressos.",
        variant: "destructive",
      });
      return;
    }

    if (!event) return;

    createOrderMutation.mutate({
      eventId: event.id,
      paymentMethod,
    });
  };

  const formatCurrency = (price: string | number) => {
    const value = typeof price === "string" ? parseFloat(price) : price;
    return value.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
  };

  const getPaymentIcon = (method: string) => {
    switch (method) {
      case "credit_card":
        return <CreditCard className="h-4 w-4" />;
      case "pix":
        return <QrCode className="h-4 w-4" />;
      case "bank_slip":
        return <FileBarChart className="h-4 w-4" />;
      default:
        return <CreditCard className="h-4 w-4" />;
    }
  };

  if (!event) return null;

  const eventPrice = parseFloat(event.price);
  const convenienceFee = 5.00;
  const totalPrice = eventPrice + convenienceFee;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md mx-4" data-testid="modal-purchase">
        <DialogHeader className="text-center">
          <div className="flex justify-center mb-4">
            <Ticket className="h-12 w-12 text-primary" />
          </div>
          <DialogTitle className="text-2xl font-bold text-gray-900">
            Confirmar Compra
          </DialogTitle>
          <DialogDescription className="text-gray-600" data-testid="text-modal-event-title">
            {event.title}
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 mb-6">
          <div className="flex justify-between">
            <span className="text-gray-700">Valor:</span>
            <span className="font-semibold text-primary" data-testid="text-modal-event-price">
              {formatCurrency(eventPrice)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-700">Taxa de conveniência:</span>
            <span className="font-semibold">{formatCurrency(convenienceFee)}</span>
          </div>
          <hr />
          <div className="flex justify-between text-lg font-bold">
            <span>Total:</span>
            <span className="text-primary" data-testid="text-modal-total-price">
              {formatCurrency(totalPrice)}
            </span>
          </div>
        </div>

        <div className="space-y-4 mb-6">
          <h4 className="font-semibold text-gray-900">Forma de Pagamento</h4>
          <RadioGroup value={paymentMethod} onValueChange={setPaymentMethod}>
            <div className="flex items-center space-x-3">
              <RadioGroupItem value="credit_card" id="credit_card" data-testid="radio-credit-card" />
              <Label htmlFor="credit_card" className="flex items-center cursor-pointer">
                <CreditCard className="h-4 w-4 mr-2 text-primary" />
                Cartão de Crédito
              </Label>
            </div>
            <div className="flex items-center space-x-3">
              <RadioGroupItem value="pix" id="pix" data-testid="radio-pix" />
              <Label htmlFor="pix" className="flex items-center cursor-pointer">
                <QrCode className="h-4 w-4 mr-2 text-primary" />
                PIX
              </Label>
            </div>
            <div className="flex items-center space-x-3">
              <RadioGroupItem value="bank_slip" id="bank_slip" data-testid="radio-bank-slip" />
              <Label htmlFor="bank_slip" className="flex items-center cursor-pointer">
                <FileBarChart className="h-4 w-4 mr-2 text-primary" />
                Boleto Bancário
              </Label>
            </div>
          </RadioGroup>
        </div>

        <div className="flex space-x-4">
          <Button
            variant="outline"
            onClick={onClose}
            className="flex-1"
            data-testid="button-cancel-purchase"
          >
            Cancelar
          </Button>
          <Button
            onClick={handlePurchase}
            className="flex-1 bg-primary hover:bg-secondary"
            disabled={createOrderMutation.isPending}
            data-testid="button-confirm-purchase"
          >
            {createOrderMutation.isPending ? "Processando..." : "Confirmar Compra"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, UserX, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { parseApiErrorMessage } from "@/lib/eventForm";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export type RedemptionRow = {
  orderId: string;
  orderStatus: string;
  amntUsed: number;
  maxUses: number;
  attendeeName: string;
  attendeeEmail: string;
  attendeeCpf: string;
  attendeePhone: string;
  checkedIn: boolean;
  checkedInAt: string | null;
  createdAt: string;
};

export type CourtesyLinkRedemptionsLink = {
  id: string;
  code: string;
  eventId: string;
  eventTitle: string;
  recipientName: string | null;
  recipientEmail: string | null;
  ticketCount: number;
  usedCount: number;
};

export type RedemptionsResponse = {
  link: CourtesyLinkRedemptionsLink;
  data: RedemptionRow[];
  total: number;
};

export function formatResgateAt(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("pt-BR");
}

export type CourtesyLinkRedemptionsTableProps = {
  link: { id: string; code: string };
  eventId: string;
  onBack?: () => void;
  onCancellationSuccess?: () => void | Promise<void>;
};

export default function CourtesyLinkRedemptionsTable({
  link,
  eventId,
  onBack,
  onCancellationSuccess,
}: CourtesyLinkRedemptionsTableProps) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [cancellingOrderId, setCancellingOrderId] = useState<string | null>(null);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["courtesy-link-redemptions", eventId, link.id],
    queryFn: async (): Promise<RedemptionsResponse> => {
      const res = await apiRequest(
        "GET",
        `/api/admin/events/${eventId}/courtesy-links/${link.id}/redemptions`,
      );
      return res.json() as Promise<RedemptionsResponse>;
    },
    enabled: !!link.id,
  });

  const handleCancelOrder = async (orderId: string, participantName: string) => {
    setCancellingOrderId(orderId);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/admin/orders/${orderId}/cancel`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: "include",
      });
      const body = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        message?: string;
      };
      if (!res.ok) {
        const fallback =
          res.status === 409
            ? "Este ingresso já está cancelado."
            : "Não foi possível cancelar a inscrição.";
        throw new Error(
          `${res.status}: ${JSON.stringify({ message: body.message ?? fallback })}`,
        );
      }
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["courtesy-link-redemptions", eventId, link.id] }),
        qc.invalidateQueries({ queryKey: ["mass-send-recipients", eventId] }),
      ]);
      await onCancellationSuccess?.();
      await refetch();
      toast({
        title: "Cancelamento concluído",
        description:
          typeof body.message === "string"
            ? body.message
            : `A inscrição de ${participantName} foi cancelada.`,
      });
    } catch (e) {
      toast({
        title: "Erro no cancelamento",
        description: parseApiErrorMessage(e),
        variant: "destructive",
      });
    } finally {
      setCancellingOrderId(null);
    }
  };

  useEffect(() => {
    if (isError && error) {
      const m = (error as Error).message;
      if (m.startsWith("403:")) {
        toast({
          title: "Acesso negado",
          description: "Você não tem permissão para visualizar estes resgates.",
          variant: "destructive",
        });
        return;
      }
      if (m.startsWith("500:") || m.startsWith("404:")) {
        const parsed = parseApiErrorMessage(error).trim();
        toast({
          title: "Erro ao carregar",
          description: parsed ? parsed : "Não foi possível carregar os resgates.",
          variant: "destructive",
        });
      }
    }
  }, [isError, error, toast]);

  const subtitle = data?.link ? (
    <p className="text-sm text-muted-foreground">
      Código: <code className="font-mono text-foreground">{data.link.code}</code>
      {data.link.recipientName ? (
        <>
          {" "}
          · Enviado para: <strong>{data.link.recipientName}</strong> (
          {data.link.recipientEmail ?? "—"})
        </>
      ) : null}
      {" · "}
      {data.link.eventTitle}
    </p>
  ) : null;

  function renderCancelDialog(p: RedemptionRow) {
    return (
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            size="sm"
            variant="destructive"
            disabled={
              p.amntUsed !== 0 ||
              p.orderStatus === "cancelled" ||
              cancellingOrderId === p.orderId
            }
          >
            {cancellingOrderId === p.orderId ? (
              <>
                <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                Cancelando...
              </>
            ) : (
              <>
                <UserX className="mr-2 h-3 w-3" />
                Cancelar inscrição
              </>
            )}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar cancelamento?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2 text-left">
              <span>
                Isso cancela a inscrição de <strong>{p.attendeeName}</strong>. O QR
                Code será invalidado e um e-mail será enviado ao participante.
              </span>
              <span className="block text-sm text-muted-foreground">
                O estorno financeiro (Asaas), se aplicável, deve ser feito manualmente.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => void handleCancelOrder(p.orderId, p.attendeeName)}
            >
              Confirmar cancelamento
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }

  const colSpan = 7;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        {onBack && (
          <Button type="button" variant="outline" size="sm" onClick={onBack}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar
          </Button>
        )}
        {subtitle}
      </div>

      <div className="rounded-md border">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>E-mail</TableHead>
                <TableHead>CPF</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead>Check-in</TableHead>
                <TableHead>Data do resgate</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={`sk-${i}`}>
                    {Array.from({ length: 7 }).map((__, j) => (
                      <TableCell key={`sk-${i}-${j}`}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : isError && !data ? (
                <TableRow>
                  <TableCell
                    colSpan={colSpan}
                    className="h-24 text-center text-muted-foreground"
                  >
                    Não foi possível carregar os resgates.
                  </TableCell>
                </TableRow>
              ) : !data || data.data.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={colSpan}
                    className="h-24 text-center text-muted-foreground"
                  >
                    Nenhum resgate ainda.
                  </TableCell>
                </TableRow>
              ) : (
                data.data.map((p) => (
                  <TableRow key={p.orderId}>
                    <TableCell className="font-medium">{p.attendeeName}</TableCell>
                    <TableCell className="max-w-[200px] break-all">{p.attendeeEmail}</TableCell>
                    <TableCell className="whitespace-nowrap">{p.attendeeCpf}</TableCell>
                    <TableCell className="whitespace-nowrap">{p.attendeePhone}</TableCell>
                    <TableCell>
                      {p.checkedIn ? (
                        <Badge className="bg-green-600 hover:bg-green-600">Presente</Badge>
                      ) : (
                        <Badge variant="secondary">Não registrado</Badge>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{formatResgateAt(p.createdAt)}</TableCell>
                    <TableCell className="text-right">{renderCancelDialog(p)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}

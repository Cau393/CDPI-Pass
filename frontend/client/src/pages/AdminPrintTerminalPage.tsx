import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Printer, Usb, AlertTriangle } from "lucide-react";
import EventSelector from "@/components/admin/EventSelector";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { buildNameLabelZpl } from "@/lib/zebraZpl";
import {
  connectZebraZD220Like,
  isWebUsbSupported,
  type ZebraUsbSession,
} from "@/lib/webUsbZebra";
import type { Event } from "@shared/schema";

type PrintHistoryRow = {
  id: string;
  orderId: string;
  displayName: string;
  status: string;
  attempts: number;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  createdAt: string | null;
  completedAt: string | null;
};

type WsServerMsg =
  | {
      type: "print_job";
      job_id: string;
      ticket_id: string;
      display_name: string;
    }
  | {
      type: "print_dead_letter";
      job_id: string;
      display_name: string | null;
      message: string;
    }
  | { type: "print_queue_notify" };

export default function AdminPrintTerminalPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [usbSession, setUsbSession] = useState<ZebraUsbSession | null>(null);
  const usbSessionRef = useRef<ZebraUsbSession | null>(null);
  const [usbBusy, setUsbBusy] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const eventIdRef = useRef<string | null>(null);

  useEffect(() => {
    usbSessionRef.current = usbSession;
  }, [usbSession]);

  const webOk = isWebUsbSupported();

  const { data: historyRes, refetch: refetchHistory } = useQuery<{
    data: PrintHistoryRow[];
  }>({
    queryKey: ["/api/admin/events", selectedEvent?.id, "print-history"],
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/admin/events/${selectedEvent!.id}/print-history?limit=100`,
      );
      return res.json() as Promise<{ data: PrintHistoryRow[] }>;
    },
    enabled: !!selectedEvent?.id,
    refetchInterval: 4000,
  });

  const sendPrinterReady = useCallback(() => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN && usbSessionRef.current) {
      ws.send(JSON.stringify({ type: "printer_ready" }));
    }
  }, []);

  const sendPrinterOffline = useCallback(() => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "printer_offline" }));
    }
  }, []);

  const refetchHistoryRef = useRef(refetchHistory);
  refetchHistoryRef.current = refetchHistory;
  const queryClientRef = useRef(qc);
  queryClientRef.current = qc;
  const toastRef = useRef(toast);
  toastRef.current = toast;

  useEffect(() => {
    eventIdRef.current = selectedEvent?.id ?? null;
  }, [selectedEvent?.id]);

  // WebSocket: depend only on event id so refetch/callback identity changes do not reconnect
  // the socket (reconnects orphaned server-side jobs in "processing" and broke automatic print).
  useEffect(() => {
    if (!selectedEvent?.id) {
      sendPrinterOffline();
      try {
        wsRef.current?.close();
      } catch {
        // ignore
      }
      return;
    }
    const eventId = selectedEvent.id;
    const token = localStorage.getItem("token");
    if (!token) {
      return;
    }
    const proto = globalThis.location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${proto}//${globalThis.location.host}/api/ws/print?token=${encodeURIComponent(
      token,
    )}&eventId=${encodeURIComponent(eventId)}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;
    ws.onopen = () => {
      setWsConnected(true);
      if (usbSessionRef.current) {
        sendPrinterReady();
      }
    };
    ws.onclose = () => {
      setWsConnected(false);
      if (wsRef.current === ws) {
        wsRef.current = null;
      }
    };
    ws.onerror = () => {
      setWsConnected(false);
    };
    ws.onmessage = (ev) => {
      void (async () => {
        let data: WsServerMsg | Record<string, unknown>;
        try {
          data = JSON.parse(ev.data as string) as WsServerMsg;
        } catch {
          return;
        }
        if (
          typeof data === "object" &&
          data &&
          "type" in data &&
          data.type === "print_queue_notify"
        ) {
          await refetchHistoryRef.current();
          return;
        }
        if (
          typeof data === "object" &&
          data &&
          "type" in data &&
          data.type === "print_dead_letter" &&
          "message" in data
        ) {
          toastRef.current({
            title: "Falha na impressão",
            description: String(
              (data as { message?: string }).message ?? "",
            ),
            variant: "destructive",
          });
          await refetchHistoryRef.current();
          return;
        }
        if (
          typeof data === "object" &&
          data &&
          "type" in data &&
          data.type === "print_job" &&
          "job_id" in data &&
          "display_name" in data
        ) {
          const job = data as {
            job_id: string;
            display_name: string;
          };
          const wsCur = wsRef.current;
          if (!wsCur || wsCur.readyState !== WebSocket.OPEN) {
            return;
          }
          const session = usbSessionRef.current;
          if (!session) {
            wsCur.send(
              JSON.stringify({
                type: "print_ack",
                job_id: job.job_id,
                status: "FAILED",
                error_code: "USB_DISCONNECTED",
                message:
                  "A impressora Zebra foi desconectada. Verifique o cabo USB.",
              }),
            );
            return;
          }
          try {
            const zpl = buildNameLabelZpl(job.display_name);
            await session.printZpl(zpl);
            wsCur.send(
              JSON.stringify({
                type: "print_ack",
                job_id: job.job_id,
                status: "SUCCESS",
              }),
            );
          } catch (e) {
            wsCur.send(
              JSON.stringify({
                type: "print_ack",
                job_id: job.job_id,
                status: "FAILED",
                error_code: "TRANSFER_ERROR",
                message: e instanceof Error ? e.message : "Erro no envio USB",
              }),
            );
          }
          await refetchHistoryRef.current();
          const eid = eventIdRef.current;
          if (eid) {
            await queryClientRef.current.invalidateQueries({
              queryKey: ["/api/admin/events", eid, "print-history"],
            });
          }
        }
      })();
    };
    return () => {
      try {
        ws.close();
      } catch {
        // ignore
      }
      if (wsRef.current === ws) {
        wsRef.current = null;
      }
      setWsConnected(false);
    };
  }, [selectedEvent?.id, sendPrinterOffline, sendPrinterReady]);

  useEffect(() => {
    if (usbSession && wsRef.current?.readyState === WebSocket.OPEN) {
      sendPrinterReady();
    }
  }, [usbSession, sendPrinterReady]);

  useEffect(() => {
    if (!isWebUsbSupported()) {
      return;
    }
    const onDisconnect = (e: USBConnectionEvent) => {
      const session = usbSessionRef.current;
      if (session && e.device === session.device) {
        setUsbSession(null);
        sendPrinterOffline();
        toast({
          title: "USB desconectado",
          description:
            "A impressora foi desconectada. Reconecte o cabo e pareie novamente.",
          variant: "destructive",
        });
      }
    };
    navigator.usb.addEventListener("disconnect", onDisconnect);
    return () => {
      navigator.usb.removeEventListener("disconnect", onDisconnect);
    };
  }, [sendPrinterOffline, toast]);

  const handleConnectUsb = async () => {
    if (!webOk) {
      return;
    }
    setUsbBusy(true);
    try {
      if (usbSession) {
        await usbSession.close();
        setUsbSession(null);
        usbSessionRef.current = null;
        sendPrinterOffline();
      }
      const session = await connectZebraZD220Like();
      setUsbSession(session);
    } catch (e) {
      toast({
        title: "Não foi possível conectar",
        description: e instanceof Error ? e.message : "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setUsbBusy(false);
    }
  };

  const handleLocalReprint = async (name: string) => {
    const session = usbSessionRef.current;
    if (!session) {
      toast({
        title: "Conecte a impressora",
        description: "Pareie a impressora USB antes de reimprimir.",
        variant: "destructive",
      });
      return;
    }
    try {
      const zpl = buildNameLabelZpl(name);
      await session.printZpl(zpl);
      toast({ title: "Reimpressão enviada", description: name });
    } catch (e) {
      toast({
        title: "Erro ao reimprimir",
        description: e instanceof Error ? e.message : "Falha no USB",
        variant: "destructive",
      });
    }
  };

  const rows = historyRes?.data ?? [];

  if (!webOk) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Navegador incompatível
            </CardTitle>
            <CardDescription>
              O seu navegador não suporta conexão direta com impressoras. Por
              favor, utilize o Google Chrome ou Microsoft Edge.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Terminal de impressão</h1>
        <p className="text-sm text-muted-foreground">
          Credenciamento: fila de etiquetas (WebUSB + WebSocket)
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Evento e impressora</CardTitle>
          <CardDescription>
            Selecione o evento em operação, depois conecte a Zebra no USB (o
            navegador pedirá permissão uma vez a cada pareamento). A fila do
            servidor envia jobs apenas a terminais com impressora pronta.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Evento ativo</Label>
            <EventSelector
              value={selectedEvent?.id ?? null}
              onSelect={(e) => {
                setSelectedEvent(e);
              }}
            />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              onClick={() => {
                void handleConnectUsb();
              }}
              disabled={usbBusy}
            >
              <Usb className="mr-2 h-4 w-4" />
              {usbBusy ? "Conectando…" : "Conectar Impressora"}
            </Button>
            <div className="text-sm text-muted-foreground">
              WebSocket: {wsConnected ? "conectado" : "desconectado"} · USB:{" "}
              {usbSession ? "conectada" : "não conectada"}
            </div>
          </div>
        </CardContent>
      </Card>

      {selectedEvent && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Printer className="h-5 w-5" />
              Histórico e reimpressão manual
            </CardTitle>
            <CardDescription>
              A reimpressão abaixo envia ZPL localmente, sem enfileirar de novo
              no servidor.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={4}
                        className="h-24 text-center text-muted-foreground"
                      >
                        Nenhum registro ainda. Os jobs aparecem após o check-in
                        com impressão ativa.
                      </TableCell>
                    </TableRow>
                  ) : (
                    rows.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">
                          {r.displayName}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">{r.status}</Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {r.createdAt
                            ? new Date(r.createdAt).toLocaleString("pt-BR")
                            : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => void handleLocalReprint(r.displayName)}
                          >
                            Imprimir novamente
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

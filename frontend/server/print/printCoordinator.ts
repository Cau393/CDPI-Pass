import type { Server } from "http";
import { randomUUID } from "crypto";
import jwt from "jsonwebtoken";
import { WebSocket, WebSocketServer } from "ws";
import type { PrintJob } from "@shared/schema";
import { storage } from "../storage";

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key";

type Client = {
  socketId: string;
  userId: string;
  eventId: string;
  ready: boolean;
  busy: boolean;
  currentJobId?: string;
  ws: WebSocket;
};

const clients = new Map<WebSocket, Client>();


type IncomingJson =
  | { type: "printer_ready" }
  | { type: "printer_offline" }
  | {
      type: "print_ack";
      job_id: string;
      status: "SUCCESS" | "FAILED";
      error_code?: string;
      message?: string;
    };

function parseQuery(request: { url?: string; headers: { host?: string } }): {
  token: string | null;
  eventId: string | null;
} {
  const host = request.headers.host ?? "localhost";
  const u = new URL(request.url ?? "/", `http://${host}`);
  return {
    token: u.searchParams.get("token"),
    eventId: u.searchParams.get("eventId"),
  };
}

/**
 * New job in DB: wake idle ready terminals for this event.
 * Awaits dispatch (claim + print_job WebSocket send) before print_queue_notify so the
 * browser always receives the job message before the history refresh ping.
 */
export async function notifyNewPrintJob(eventId: string): Promise<void> {
  const toWake: Client[] = [];
  for (const c of Array.from(clients.values())) {
    if (c.eventId === eventId && c.ready && !c.busy) {
      toWake.push(c);
    }
  }
  await Promise.all(
    toWake.map((c) =>
      tryDispatchToClient(c).catch((err) => {
        console.error("tryDispatchToClient:", err);
      }),
    ),
  );
  // Let all browsers on this event refetch print history (check-in may be in another tab).
  const qMsg = JSON.stringify({ type: "print_queue_notify" });
  for (const c of Array.from(clients.values())) {
    if (c.eventId === eventId && c.ws.readyState === WebSocket.OPEN) {
      try {
        c.ws.send(qMsg);
      } catch (e) {
        console.error("print_queue_notify send:", e);
      }
    }
  }
}

async function tryDispatchToClient(c: Client): Promise<void> {
  if (c.busy || !c.ready || c.ws.readyState !== WebSocket.OPEN) {
    return;
  }
  // Take the dispatch slot before await so concurrent notify passes cannot double-claim.
  c.busy = true;
  let job: PrintJob | undefined;
  try {
    job = await storage.claimNextPrintJobForEvent(c.eventId, c.socketId);
  } catch (e) {
    console.error("claimNextPrintJobForEvent:", e);
    c.busy = false;
    return;
  }
  if (!job) {
    c.busy = false;
    return;
  }
  c.currentJobId = job.id;
  let sendOk = false;
  try {
    c.ws.send(
      JSON.stringify({
        type: "print_job",
        job_id: job.id,
        ticket_id: job.orderId,
        display_name: job.displayName,
        ...(job.companyLine
          ? { company_line: job.companyLine }
          : {}),
      }),
    );
    sendOk = true;
  } catch (e) {
    console.error("ws.send print_job:", e);
  }
  if (!sendOk) {
    c.currentJobId = undefined;
    c.busy = false;
    await storage.requeueJobOnSocketDisconnect(job.id, c.socketId);
    await notifyNewPrintJob(c.eventId);
  }
}

function broadcastToEvent(
  eventId: string,
  payload: Record<string, unknown>,
) {
  const msg = JSON.stringify(payload);
  for (const c of Array.from(clients.values())) {
    if (c.eventId === eventId && c.ws.readyState === WebSocket.OPEN) {
      c.ws.send(msg);
    }
  }
}

async function handleMessage(c: Client, raw: string) {
  let data: IncomingJson;
  try {
    data = JSON.parse(raw) as IncomingJson;
  } catch {
    return;
  }
  if (data.type === "printer_ready") {
    c.ready = true;
    void notifyNewPrintJob(c.eventId).catch((e) =>
      console.error("notify after printer_ready:", e),
    );
    return;
  }
  if (data.type === "printer_offline") {
    c.ready = false;
    if (c.currentJobId) {
      const jid = c.currentJobId;
      c.busy = false;
      c.currentJobId = undefined;
      void (async () => {
        await storage.requeueJobOnSocketDisconnect(jid, c.socketId);
        await notifyNewPrintJob(c.eventId);
      })();
    }
    return;
  }
  if (data.type === "print_ack" && data.job_id) {
    if (!c.busy || c.currentJobId !== data.job_id) {
      return;
    }
    const ts = new Date().toISOString();
    if (data.status === "SUCCESS") {
      await storage.completePrintJob(data.job_id, c.socketId);
      c.ws.send(
        JSON.stringify({ status: "SUCCESS", job_id: data.job_id, timestamp: ts }),
      );
    } else {
      const code = data.error_code ?? "TRANSFER_ERROR";
      const message = data.message ?? "Falha na impressão";
      const { terminalFailure } = await storage.failPrintJob(
        data.job_id,
        c.socketId,
        code,
        message,
      );
      c.ws.send(
        JSON.stringify({
          status: "FAILED",
          job_id: data.job_id,
          error_code: code,
          message,
          timestamp: ts,
        }),
      );
      if (terminalFailure) {
        const job = await storage.getPrintJobById(data.job_id);
        broadcastToEvent(c.eventId, {
          type: "print_dead_letter",
          job_id: data.job_id,
          display_name: job?.displayName ?? null,
          message:
            "Falha definitiva na impressão. Utilize a impressão manual na tabela.",
        });
      }
    }
    c.busy = false;
    c.currentJobId = undefined;
    await notifyNewPrintJob(c.eventId);
  }
}

export function initPrintWebSocket(httpServer: Server) {
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on("upgrade", (request, socket, head) => {
    const host = request.headers.host ?? "localhost";
    const path = new URL(request.url ?? "/", `http://${host}`).pathname;
    if (path === "/api/ws/print") {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit("connection", ws, request);
      });
    }
  });

  wss.on("connection", (ws, request) => {
    void (async () => {
      const { token, eventId } = parseQuery(request);
      if (!token || !eventId) {
        ws.close(4000, "token ou eventId ausente");
        return;
      }
      let userId: string;
      try {
        const dec = jwt.verify(token, JWT_SECRET) as { userId: string };
        userId = dec.userId;
      } catch {
        ws.close(4001, "token inválido");
        return;
      }
      const user = await storage.getUser(userId);
      if (!user?.isAdmin) {
        ws.close(4002, "acesso negado");
        return;
      }
      const c: Client = {
        socketId: randomUUID(),
        userId,
        eventId,
        ready: false,
        busy: false,
        ws,
      };
      clients.set(ws, c);

      ws.on("message", (data) => {
        const raw = data.toString();
        void handleMessage(c, raw);
      });
      ws.on("close", () => {
        const cur = clients.get(ws);
        clients.delete(ws);
        if (cur?.currentJobId) {
          void (async () => {
            await storage.requeueJobOnSocketDisconnect(
              cur.currentJobId!,
              cur.socketId,
            );
            await notifyNewPrintJob(cur.eventId);
          })();
        }
      });
    })().catch(() => {
      try {
        ws.close(4003, "erro");
      } catch {
        // ignore
      }
    });
  });
}

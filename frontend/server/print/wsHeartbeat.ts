import type { WebSocket, WebSocketServer } from "ws";

/**
 * Ping interval for print terminals. Must stay well under nginx's default 60s
 * `proxy_read_timeout` and the ~30s idle cutoff of some venue NATs/firewalls, which
 * otherwise drop an idle terminal socket. Browsers answer pings automatically.
 */
export const PRINT_WS_HEARTBEAT_MS = 20_000;

/**
 * Pings every client each interval and terminates any that did not answer the previous
 * ping (dead TCP connection), which fires its `close` handler so its job is requeued.
 * @returns stop function
 */
export function startWsHeartbeat(
  wss: WebSocketServer,
  intervalMs: number = PRINT_WS_HEARTBEAT_MS,
): () => void {
  const alive = new WeakSet<WebSocket>();
  wss.on("connection", (ws: WebSocket) => {
    alive.add(ws);
    ws.on("pong", () => alive.add(ws));
  });
  const timer = setInterval(() => {
    for (const ws of Array.from(wss.clients)) {
      if (!alive.has(ws)) {
        ws.terminate();
        continue;
      }
      alive.delete(ws);
      ws.ping();
    }
  }, intervalMs);
  timer.unref();
  const stop = () => clearInterval(timer);
  wss.on("close", stop);
  return stop;
}

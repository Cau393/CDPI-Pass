import { createServer, type Server } from "http";
import type { AddressInfo } from "net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WebSocket, WebSocketServer } from "ws";
import { startWsHeartbeat } from "../../print/wsHeartbeat";

const INTERVAL_MS = 50;

let server: Server | undefined;
let wss: WebSocketServer | undefined;
let stop: (() => void) | undefined;

async function listen(): Promise<string> {
  server = createServer();
  wss = new WebSocketServer({ noServer: true });
  server.on("upgrade", (req, socket, head) => {
    wss!.handleUpgrade(req, socket, head, (ws) => wss!.emit("connection", ws, req));
  });
  stop = startWsHeartbeat(wss, INTERVAL_MS);
  await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
  return `ws://127.0.0.1:${(server!.address() as AddressInfo).port}`;
}

function opened(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    ws.once("open", () => resolve());
    ws.once("error", reject);
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

afterEach(async () => {
  stop?.();
  for (const c of wss?.clients ?? []) c.terminate();
  wss?.close();
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
  server = undefined;
  wss = undefined;
});

describe("startWsHeartbeat", () => {
  it("pings an idle client so proxies see traffic, and keeps it open while it answers", async () => {
    const url = await listen();
    const client = new WebSocket(url);
    let pings = 0;
    client.on("ping", () => pings++);
    await opened(client);
    await sleep(INTERVAL_MS * 6);
    expect(pings).toBeGreaterThanOrEqual(3);
    expect(client.readyState).toBe(WebSocket.OPEN);
    client.close();
  });

  it("terminates a client that stops answering pings", async () => {
    const url = await listen();
    const client = new WebSocket(url, { autoPong: false });
    const closed = new Promise<void>((resolve) => client.once("close", () => resolve()));
    await opened(client);
    await Promise.race([
      closed,
      sleep(INTERVAL_MS * 10).then(() => {
        throw new Error("dead client was not terminated");
      }),
    ]);
    await vi.waitFor(() => expect(wss!.clients.size).toBe(0));
  });
});

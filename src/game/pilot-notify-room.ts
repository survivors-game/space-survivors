import { DurableObject } from "cloudflare:workers";

/**
 * Canal de notificaciones por jugador. Cada jugador tiene su propio objeto y
 * mantiene su conexión WebSocket abierta. El servidor le envía un aviso cuando
 * recibe un premio nuevo; el cliente vuelve a pedir su historial solo en ese momento.
 */
export class PilotNotifyRoom extends DurableObject {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/websocket" && request.method === "GET") {
      if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
        return new Response("WebSocket upgrade required.", { status: 426 });
      }
      const pair = new WebSocketPair();
      this.ctx.acceptWebSocket(pair[1]);
      return new Response(null, { status: 101, webSocket: pair[0] });
    }

    if (url.pathname === "/notify" && request.method === "POST") {
      const payload = await request.text();
      for (const socket of this.ctx.getWebSockets()) {
        try {
          socket.send(payload);
        } catch {
          // Conexión ya cerrada: el cliente se reconectará y recargará su historial.
        }
      }
      return new Response(null, { status: 204 });
    }

    return new Response("Not found.", { status: 404 });
  }
}

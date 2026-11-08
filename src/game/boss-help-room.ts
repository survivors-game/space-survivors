import { DurableObject } from "cloudflare:workers";
import type { DurableObjectState } from "cloudflare:workers";

interface Participant {
  pilotId: string;
  allianceId: string;
  callsign: string;
  role: "member" | "host" | "helper";
  shipId: string;
}

interface BossHelpAttachment extends Participant {
  sessionId?: string;
}

interface BossHelpMessage {
  type: string;
  sessionId?: string;
  x?: number;
  y?: number;
  boss?: { x: number; y: number; hp: number; maxHp: number; name: string };
  host?: { x: number; y: number; hp: number; maxHp: number; shipId?: string };
  helper?: { x: number; y: number; shipId: string };
  enemyShots?: { x: number; y: number }[];
}

interface HibernatingWebSocket extends WebSocket {
  serializeAttachment(value: BossHelpAttachment): void;
  deserializeAttachment(): BossHelpAttachment;
}

export class BossHelpRoom extends DurableObject {
  constructor(ctx: DurableObjectState, env: unknown) {
    super(ctx, env);
    ctx.storage.sql.exec(
      `CREATE TABLE IF NOT EXISTS boss_help_rate_limits (
        key TEXT PRIMARY KEY, value INTEGER NOT NULL
      )`,
    );
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/websocket" && request.method === "GET") {
      if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
        return new Response("WebSocket upgrade required.", { status: 426 });
      }
      const participant: Participant = {
        pilotId: url.searchParams.get("pilotId") ?? "",
        allianceId: url.searchParams.get("allianceId") ?? "",
        callsign: url.searchParams.get("callsign") ?? "PILOTO",
        role: url.searchParams.get("role") as Participant["role"],
        shipId: url.searchParams.get("shipId") ?? "falcon",
      };
      if (
        !participant.pilotId ||
        !participant.allianceId ||
        !["member", "host", "helper"].includes(participant.role)
      ) {
        return new Response("Invalid participant.", { status: 400 });
      }
      const pair = new WebSocketPair();
      const client = pair[0];
      const socket = pair[1] as HibernatingWebSocket;
      socket.serializeAttachment({
        ...participant,
        ...(url.searchParams.get("sessionId")
          ? { sessionId: url.searchParams.get("sessionId")! }
          : {}),
      });
      this.ctx.acceptWebSocket(socket);
      socket.send(JSON.stringify({ type: "ready" }));
      return new Response(null, { status: 101, webSocket: client });
    }

    if (url.pathname === "/notify" && request.method === "POST") {
      const body = (await request.json().catch(() => null)) as {
        sessionId: string;
        bossId: string;
        bossName: string;
        world: number;
        hostPilotId: string;
        hostName: string;
        expiresAt: number;
      } | null;
      if (
        !body ||
        typeof body.sessionId !== "string" ||
        typeof body.bossId !== "string" ||
        typeof body.hostPilotId !== "string" ||
        typeof body.hostName !== "string" ||
        !Number.isSafeInteger(body.world)
      ) {
        return new Response("Invalid help notification.", { status: 400 });
      }
      this.broadcast({
        type: "invite",
        sessionId: body.sessionId,
        bossId: body.bossId,
        bossName: body.bossName,
        world: body.world,
        hostPilotId: body.hostPilotId,
        hostName: body.hostName,
        expiresAt: body.expiresAt,
      });
      return new Response(null, { status: 204 });
    }

    if (url.pathname === "/joined" && request.method === "POST") {
      const body = (await request.json().catch(() => null)) as {
        sessionId?: string;
        hostPilotId?: string;
        helperPilotId?: string;
        helperName?: string;
        shipId?: string;
      } | null;
      if (
        !body?.sessionId ||
        !body.hostPilotId ||
        !body.helperPilotId ||
        !body.helperName ||
        !body.shipId
      ) {
        return new Response("Invalid join notification.", { status: 400 });
      }
      this.broadcast({
        type: "joined",
        sessionId: body.sessionId,
        hostPilotId: body.hostPilotId,
        helperPilotId: body.helperPilotId,
        helperName: body.helperName,
        shipId: body.shipId,
      });
      return new Response(null, { status: 204 });
    }

    if (url.pathname === "/ended" && request.method === "POST") {
      const body = (await request.json().catch(() => null)) as {
        sessionId?: string;
        status?: "expired" | "left" | "completed";
        pilotId?: string;
      } | null;
      if (!body?.sessionId || !body.status) {
        return new Response("Invalid session completion.", { status: 400 });
      }
      this.broadcast({ type: body.status, sessionId: body.sessionId, pilotId: body.pilotId ?? "" });
      this.closeParticipants(body.sessionId);
      return new Response(null, { status: 204 });
    }

    if (url.pathname === "/state" && request.method === "POST") {
      const message = (await request.json().catch(() => null)) as BossHelpMessage | null;
      if (!message || message.type !== "state" || !message.sessionId) {
        return new Response("Invalid combat state.", { status: 400 });
      }
      this.broadcast(message, message.sessionId);
      return new Response(null, { status: 204 });
    }

    return new Response("Not found.", { status: 404 });
  }

  webSocketMessage(socket: WebSocket, raw: string | ArrayBuffer): void {
    const text = typeof raw === "string" ? raw : new TextDecoder().decode(raw);
    let message: BossHelpMessage;
    try {
      message = JSON.parse(text) as BossHelpMessage;
    } catch {
      return;
    }
    const sender = (socket as HibernatingWebSocket).deserializeAttachment();
    if (message.type === "state") {
      if (sender.role !== "host" || sender.sessionId !== message.sessionId) return;
      this.broadcast(message, message.sessionId);
      return;
    }
    if (!message.sessionId || !["fire", "move"].includes(message.type)) return;
    if (sender.role !== "helper" || sender.sessionId !== message.sessionId) return;

    if (message.type === "fire") {
      const now = Date.now();
      const key = `shot:${sender.pilotId}:${message.sessionId}`;
      const previous = this.ctx.storage.sql
        .exec<{ value: number }>("SELECT value FROM boss_help_rate_limits WHERE key = ?", key)
        .toArray()[0]?.value;
      if (previous !== undefined && now - previous < 500) return;
      this.ctx.storage.sql.exec(
        `INSERT INTO boss_help_rate_limits (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        key,
        now,
      );
      this.sendToHosts(message.sessionId, {
        type: "helper-fire",
        sessionId: message.sessionId,
        helperPilotId: sender.pilotId,
        damage: 35,
      });
      this.broadcast(
        {
          type: "helper-fire-visual",
          sessionId: message.sessionId,
          helperPilotId: sender.pilotId,
        },
        message.sessionId,
      );
      return;
    }

    const x = Number(message.x);
    const y = Number(message.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    this.broadcast(
      {
        type: "helper-position",
        sessionId: message.sessionId,
        helper: {
          x: Math.max(-100, Math.min(100, x)),
          y: Math.max(-100, Math.min(100, y)),
          shipId: sender.shipId,
        },
      },
      message.sessionId,
    );
  }

  private broadcast(message: object, sessionId?: string): void {
    const serialized = JSON.stringify(message);
    for (const socket of this.ctx.getWebSockets()) {
      const attachment = (socket as HibernatingWebSocket).deserializeAttachment();
      if (sessionId && attachment.sessionId !== sessionId) continue;
      if (attachment.role === "host" && "type" in message && message.type === "invite") continue;
      try {
        socket.send(serialized);
      } catch (error) {
        console.error("No se pudo enviar un mensaje de ayuda de boss:", error);
        socket.close(1011, "Boss help delivery failed");
      }
    }
  }

  private sendToHosts(sessionId: string, message: object): void {
    const serialized = JSON.stringify(message);
    for (const socket of this.ctx.getWebSockets()) {
      const attachment = (socket as HibernatingWebSocket).deserializeAttachment();
      if (attachment.role !== "host" || attachment.sessionId !== sessionId) continue;
      socket.send(serialized);
    }
  }

  private closeParticipants(sessionId: string): void {
    for (const socket of this.ctx.getWebSockets()) {
      const attachment = (socket as HibernatingWebSocket).deserializeAttachment();
      if (attachment.sessionId === sessionId) socket.close(1000, "Boss help session ended");
    }
  }
}

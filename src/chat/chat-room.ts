import { DurableObject, WebSocketRequestResponsePair } from "cloudflare:workers";
import type { DurableObjectState } from "cloudflare:workers";

type MessageType = "chat" | "boss_kill" | "drop" | "join" | "leave";

export interface ChatMessage {
  id: number;
  type: MessageType;
  callsign: string;
  text: string;
  timestamp: number;
}

interface StoredMessage extends ChatMessage {
  pilot_id: string;
}

interface NewMessage {
  type: MessageType;
  pilotId: string;
  callsign: string;
  text: string;
}

interface ChatAttachment {
  pilotId: string;
  callsign: string;
}

interface HibernatingWebSocket extends WebSocket {
  serializeAttachment(value: ChatAttachment): void;
  deserializeAttachment(): ChatAttachment;
}

interface IncomingChat {
  type: "chat";
  text: string;
}

interface IncomingEvent {
  pilotId: string;
  callsign: string;
  type: "boss_kill" | "drop";
  text: string;
}

const MAX_MESSAGE_LENGTH = 500;

export class ChatRoom extends DurableObject {
  constructor(ctx: DurableObjectState, env: unknown) {
    super(ctx, env);
    ctx.storage.sql.exec(
      `CREATE TABLE IF NOT EXISTS chat_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        pilot_id TEXT NOT NULL,
        callsign TEXT NOT NULL,
        text TEXT NOT NULL,
        timestamp INTEGER NOT NULL
      )`,
    );
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/websocket" && request.method === "GET") {
      if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
        return new Response("WebSocket upgrade required.", { status: 426 });
      }

      const pilotId = url.searchParams.get("pilotId");
      const callsign = url.searchParams.get("callsign");
      if (!pilotId || !callsign) return new Response("Missing pilot identity.", { status: 400 });

      const pair = new WebSocketPair();
      const client = pair[0];
      const server = pair[1] as HibernatingWebSocket;
      server.serializeAttachment({ pilotId, callsign });
      this.ctx.acceptWebSocket(server);
      this.sendHistory(server);
      this.broadcast(
        this.saveMessage({
          type: "join",
          pilotId,
          callsign,
          text: `${callsign} se unió al chat.`,
        }),
      );
      return new Response(null, { status: 101, webSocket: client });
    }

    if (url.pathname === "/event" && request.method === "POST") {
      const payload = (await request.json().catch(() => null)) as IncomingEvent | null;
      if (
        !payload ||
        typeof payload.pilotId !== "string" ||
        typeof payload.callsign !== "string" ||
        !["boss_kill", "drop"].includes(payload.type) ||
        !isValidMessage(payload.text)
      ) {
        return new Response("Invalid chat event.", { status: 400 });
      }
      this.broadcast(
        this.saveMessage({
          type: payload.type,
          pilotId: payload.pilotId,
          callsign: payload.callsign,
          text: payload.text.trim(),
        }),
      );
      return new Response(null, { status: 204 });
    }

    return new Response("Not found.", { status: 404 });
  }

  webSocketMessage(socket: WebSocket, message: string | ArrayBuffer): void {
    const client = socket as HibernatingWebSocket;
    const attachment = client.deserializeAttachment();
    const text = typeof message === "string" ? message : new TextDecoder().decode(message);
    let payload: IncomingChat;
    try {
      payload = JSON.parse(text) as IncomingChat;
    } catch {
      return;
    }
    if (payload?.type !== "chat" || !isValidMessage(payload.text)) return;

    this.broadcast(
      this.saveMessage({
        type: "chat",
        pilotId: attachment.pilotId,
        callsign: attachment.callsign,
        text: payload.text.trim(),
      }),
    );
  }

  webSocketClose(socket: WebSocket): void {
    const { pilotId, callsign } = (socket as HibernatingWebSocket).deserializeAttachment();
    this.broadcast(
      this.saveMessage({
        type: "leave",
        pilotId,
        callsign,
        text: `${callsign} salió del chat.`,
      }),
    );
  }

  broadcast(message: ChatMessage): void {
    const serialized = JSON.stringify(message);
    for (const socket of this.ctx.getWebSockets()) {
      try {
        socket.send(serialized);
      } catch (error) {
        console.error("No se pudo enviar un mensaje a un socket del chat:", error);
        socket.close(1011, "Chat delivery failed");
      }
    }
  }

  saveMessage(input: NewMessage): ChatMessage {
    const timestamp = Date.now();
    const result = this.ctx.storage.sql.exec<{ id: number }>(
      `INSERT INTO chat_messages (type, pilot_id, callsign, text, timestamp)
       VALUES (?, ?, ?, ?, ?) RETURNING id`,
      input.type,
      input.pilotId,
      input.callsign,
      input.text,
      timestamp,
    );
    this.ctx.storage.sql.exec(
      `DELETE FROM chat_messages
       WHERE id NOT IN (SELECT id FROM chat_messages ORDER BY id DESC LIMIT 200)`,
    );
    const id = result.toArray()[0]?.id;
    if (id === undefined) throw new Error("SQLite no devolvió el identificador del mensaje.");
    return {
      id,
      type: input.type,
      callsign: input.callsign,
      text: input.text,
      timestamp,
    };
  }

  sendHistory(socket: WebSocket): void {
    const messages = this.ctx.storage.sql
      .exec<StoredMessage>(
        `SELECT id, type, pilot_id, callsign, text, timestamp
         FROM chat_messages ORDER BY id DESC LIMIT 50`,
      )
      .toArray()
      .reverse();
    for (const message of messages) {
      socket.send(
        JSON.stringify({
          id: message.id,
          type: message.type,
          callsign: message.callsign,
          text: message.text,
          timestamp: message.timestamp,
        }),
      );
    }
  }
}

function isValidMessage(text: unknown): text is string {
  return typeof text === "string" && text.trim().length > 0 && text.length <= MAX_MESSAGE_LENGTH;
}

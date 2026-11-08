import { DurableObject } from "cloudflare:workers";
import type { DurableObjectState } from "cloudflare:workers";

export type ChatLanguage = "en" | "es";
type MessageType = "chat" | "boss_kill" | "drop";

export interface ChatMessage {
  id: number;
  type: MessageType;
  language: ChatLanguage;
  pilotId: string;
  callsign: string;
  allianceTag?: string | null;
  text: string;
  timestamp: number;
}

interface StoredMessage extends ChatMessage {
  pilot_id: string;
  alliance_tag: string | null;
}

interface NewMessage {
  type: MessageType;
  language: ChatLanguage;
  pilotId: string;
  callsign: string;
  allianceTag: string | null;
  text: string;
}

interface ChatAttachment {
  pilotId: string;
  callsign: string;
  allianceTag: string | null;
  language: ChatLanguage;
}

interface HibernatingWebSocket extends WebSocket {
  serializeAttachment(value: ChatAttachment): void;
  deserializeAttachment(): ChatAttachment;
}

interface IncomingChat {
  type: "chat";
  language: ChatLanguage;
  text: string;
}

interface IncomingEvent {
  pilotId: string;
  callsign: string;
  allianceTag: string | null;
  type: "boss_kill" | "drop";
  language: ChatLanguage;
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
        language TEXT NOT NULL DEFAULT 'es',
        alliance_tag TEXT,
        timestamp INTEGER NOT NULL
      )`,
    );
    const schema = ctx.storage.sql
      .exec<{ sql: string | null }>(
        "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'chat_messages'",
      )
      .toArray()[0]?.sql;
    if (!schema?.includes("language")) {
      ctx.storage.sql.exec(
        "ALTER TABLE chat_messages ADD COLUMN language TEXT NOT NULL DEFAULT 'es'",
      );
    }
    if (!schema?.includes("alliance_tag")) {
      ctx.storage.sql.exec("ALTER TABLE chat_messages ADD COLUMN alliance_tag TEXT");
    }
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/websocket" && request.method === "GET") {
      if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
        return new Response("WebSocket upgrade required.", { status: 426 });
      }

      const pilotId = url.searchParams.get("pilotId");
      const callsign = url.searchParams.get("callsign");
      const language = url.searchParams.get("language");
      const allianceTag = url.searchParams.get("allianceTag");
      if (!pilotId || !callsign || !isChatLanguage(language)) {
        return new Response("Missing chat identity or language.", { status: 400 });
      }

      const pair = new WebSocketPair();
      const client = pair[0];
      const server = pair[1] as HibernatingWebSocket;
      server.serializeAttachment({
        pilotId,
        callsign,
        allianceTag: allianceTag || null,
        language,
      });
      this.ctx.acceptWebSocket(server);
      this.sendHistory(server, language);
      return new Response(null, { status: 101, webSocket: client });
    }

    if (url.pathname === "/event" && request.method === "POST") {
      const payload = (await request.json().catch(() => null)) as IncomingEvent | null;
      if (
        !payload ||
        typeof payload.pilotId !== "string" ||
        typeof payload.callsign !== "string" ||
        !isChatLanguage(payload.language) ||
        !["boss_kill", "drop"].includes(payload.type) ||
        !isValidMessage(payload.text)
      ) {
        return new Response("Invalid chat event.", { status: 400 });
      }
      this.broadcast(
        this.saveMessage({
          type: payload.type,
          language: payload.language,
          pilotId: payload.pilotId,
          callsign: payload.callsign,
          allianceTag: payload.allianceTag,
          text: payload.text.trim(),
        }),
      );
      return new Response(null, { status: 204 });
    }

    return new Response("Not found.", { status: 404 });
  }

  webSocketMessage(socket: WebSocket, message: string | ArrayBuffer): void {
    if (message === "ping") {
      socket.send("pong");
      return;
    }
    const client = socket as HibernatingWebSocket;
    const attachment = client.deserializeAttachment();
    const text = typeof message === "string" ? message : new TextDecoder().decode(message);
    let payload: IncomingChat;
    try {
      payload = JSON.parse(text) as IncomingChat;
    } catch {
      return;
    }
    if (
      payload?.type !== "chat" ||
      payload.language !== attachment.language ||
      !isValidMessage(payload.text)
    ) {
      return;
    }

    this.broadcast(
      this.saveMessage({
        type: "chat",
        language: attachment.language,
        pilotId: attachment.pilotId,
        callsign: attachment.callsign,
        allianceTag: attachment.allianceTag,
        text: payload.text.trim(),
      }),
    );
  }

  broadcast(message: ChatMessage): void {
    const serialized = JSON.stringify(message);
    for (const socket of this.ctx.getWebSockets()) {
      const client = socket as HibernatingWebSocket;
      if (client.deserializeAttachment().language !== message.language) continue;
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
      `INSERT INTO chat_messages
        (type, pilot_id, callsign, text, language, alliance_tag, timestamp)
       VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      input.type,
      input.pilotId,
      input.callsign,
      input.text,
      input.language,
      input.allianceTag,
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
      language: input.language,
      pilotId: input.pilotId,
      callsign: input.callsign,
      allianceTag: input.allianceTag,
      text: input.text,
      timestamp,
    };
  }

  sendHistory(socket: WebSocket, language: ChatLanguage): void {
    const messages = this.ctx.storage.sql
      .exec<StoredMessage>(
        `SELECT id, type, pilot_id, callsign, text, language, alliance_tag, timestamp
         FROM chat_messages
         WHERE language = ? AND type NOT IN ('join', 'leave')
         ORDER BY id DESC LIMIT 50`,
        language,
      )
      .toArray()
      .reverse();
    for (const message of messages) {
      socket.send(
        JSON.stringify({
          id: message.id,
          type: message.type,
          language: message.language,
          pilotId: message.pilot_id,
          callsign: message.callsign,
          allianceTag: message.alliance_tag,
          text: message.text,
          timestamp: message.timestamp,
        }),
      );
    }
  }
}

function isChatLanguage(value: string | null): value is ChatLanguage {
  return value === "en" || value === "es";
}

function isValidMessage(text: unknown): text is string {
  return typeof text === "string" && text.trim().length > 0 && text.length <= MAX_MESSAGE_LENGTH;
}

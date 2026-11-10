import { DurableObject } from "cloudflare:workers";
import type { DurableObjectState } from "cloudflare:workers";
import type { ChatLanguage, ChatMessage, ChatMessageType as MessageType } from "./types";

interface StoredMessage extends Omit<ChatMessage, "vip"> {
  pilot_id: string;
  alliance_tag: string | null;
  vip: number;
}

interface NewMessage {
  type: MessageType;
  language: ChatLanguage;
  pilotId: string;
  callsign: string;
  allianceTag: string | null;
  vip: boolean;
  text: string;
}

interface ChatAttachment {
  pilotId: string;
  callsign: string;
  allianceTag: string | null;
  vip: boolean;
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
  vip?: boolean;
  type: "boss_kill";
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
    ctx.storage.sql.exec(
      `CREATE TABLE IF NOT EXISTS chat_settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        enabled INTEGER NOT NULL DEFAULT 1
      )`,
    );
    ctx.storage.sql.exec("INSERT OR IGNORE INTO chat_settings (id, enabled) VALUES (1, 1)");
    ctx.storage.sql.exec(
      `CREATE TABLE IF NOT EXISTS chat_mutes (
        pilot_id TEXT PRIMARY KEY,
        expires_at INTEGER,
        reason TEXT NOT NULL,
        created_at INTEGER NOT NULL
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
    if (!schema?.includes("vip INTEGER")) {
      ctx.storage.sql.exec("ALTER TABLE chat_messages ADD COLUMN vip INTEGER NOT NULL DEFAULT 0");
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
      const vip = url.searchParams.get("vip") === "1";
      if (!pilotId || !callsign || !isChatLanguage(language)) {
        return new Response("Missing chat identity or language.", { status: 400 });
      }

      const chatEnabled =
        this.ctx.storage.sql
          .exec<{ enabled: number }>("SELECT enabled FROM chat_settings WHERE id = 1")
          .toArray()[0]?.enabled !== 0;
      if (!chatEnabled)
        return new Response("El chat está temporalmente suspendido.", { status: 503 });

      const mute = this.ctx.storage.sql
        .exec<{ expires_at: number | null }>(
          "SELECT expires_at FROM chat_mutes WHERE pilot_id = ?",
          pilotId,
        )
        .toArray()[0];
      if (mute && (mute["expires_at"] === null || mute["expires_at"] > Date.now())) {
        return new Response("El acceso al chat está restringido.", { status: 403 });
      }
      if (mute) this.ctx.storage.sql.exec("DELETE FROM chat_mutes WHERE pilot_id = ?", pilotId);

      const pair = new WebSocketPair();
      const client = pair[0];
      const server = pair[1] as HibernatingWebSocket;
      server.serializeAttachment({
        pilotId,
        callsign,
        allianceTag: allianceTag || null,
        vip,
        language,
      });
      this.ctx.acceptWebSocket(server);
      this.sendHistory(server, language);
      return new Response(null, { status: 101, webSocket: client });
    }

    if (url.pathname === "/admin" && request.method === "GET") {
      const messages = this.ctx.storage.sql
        .exec(
          `SELECT id, type, pilot_id, callsign, text, language, alliance_tag, vip, timestamp
           FROM chat_messages ORDER BY id DESC LIMIT 100`,
        )
        .toArray()
        .map((message) => ({
          id: Number(message["id"]),
          type: String(message["type"]),
          pilotId: String(message["pilot_id"]),
          callsign: String(message["callsign"]),
          text: String(message["text"]),
          language: String(message["language"]),
          allianceTag: message["alliance_tag"] ? String(message["alliance_tag"]) : null,
          vip: Number(message["vip"]) === 1,
          timestamp: Number(message["timestamp"]),
        }));
      const mutes = this.ctx.storage.sql
        .exec(
          `SELECT pilot_id, expires_at, reason, created_at
           FROM chat_mutes ORDER BY created_at DESC LIMIT 100`,
        )
        .toArray()
        .map((mute) => ({
          pilotId: String(mute["pilot_id"]),
          expiresAt: mute["expires_at"] === null ? null : Number(mute["expires_at"]),
          reason: String(mute["reason"]),
          createdAt: Number(mute["created_at"]),
        }));
      const chatEnabled =
        this.ctx.storage.sql
          .exec<{ enabled: number }>("SELECT enabled FROM chat_settings WHERE id = 1")
          .toArray()[0]?.enabled !== 0;
      return Response.json({ messages, mutes, chatEnabled });
    }

    if (url.pathname === "/admin" && request.method === "POST") {
      const payload = (await request.json().catch(() => null)) as Record<string, unknown> | null;
      const action = payload?.["action"];
      const now = Date.now();
      if (action === "set-chat-enabled") {
        if (typeof payload?.["enabled"] !== "boolean") {
          return Response.json({ error: "El estado del chat no es válido." }, { status: 400 });
        }
        this.ctx.storage.sql.exec(
          "UPDATE chat_settings SET enabled = ? WHERE id = 1",
          payload["enabled"] ? 1 : 0,
        );
        if (!payload["enabled"]) {
          for (const socket of this.ctx.getWebSockets())
            socket.close(1012, "Chat temporarily suspended");
        }
        return Response.json({ success: true, enabled: payload["enabled"] });
      }

      if (action === "delete-message") {
        const messageId = Number(payload?.["messageId"]);
        if (!Number.isSafeInteger(messageId) || messageId <= 0) {
          return Response.json({ error: "Identificador de mensaje no válido." }, { status: 400 });
        }
        const deleted = this.ctx.storage.sql.exec<{ id: number }>(
          "DELETE FROM chat_messages WHERE id = ? RETURNING id",
          messageId,
        );
        if (deleted.toArray().length === 0) {
          return Response.json({ error: "El mensaje ya no existe." }, { status: 404 });
        }
        const notice = JSON.stringify({ type: "deleted", messageId });
        for (const socket of this.ctx.getWebSockets()) {
          try {
            socket.send(notice);
          } catch {
            socket.close(1011, "Chat delivery failed");
          }
        }
        return Response.json({ success: true });
      }

      if (action === "mute" || action === "ban" || action === "unmute") {
        const pilotId = typeof payload?.["pilotId"] === "string" ? payload["pilotId"].trim() : "";
        const reason =
          typeof payload?.["reason"] === "string" ? payload["reason"].trim().slice(0, 240) : "";
        if (!/^plt_[0-9a-f]{24}$/.test(pilotId)) {
          return Response.json({ error: "Identificador de jugador no válido." }, { status: 400 });
        }
        if (action !== "unmute" && reason.length < 5) {
          return Response.json(
            { error: "Escribe un motivo de al menos 5 caracteres." },
            { status: 400 },
          );
        }
        if (action === "unmute") {
          this.ctx.storage.sql.exec("DELETE FROM chat_mutes WHERE pilot_id = ?", pilotId);
        } else {
          const expiresAt = action === "mute" ? now + 24 * 60 * 60 * 1000 : null;
          this.ctx.storage.sql.exec(
            `INSERT INTO chat_mutes (pilot_id, expires_at, reason, created_at)
             VALUES (?, ?, ?, ?)
             ON CONFLICT(pilot_id) DO UPDATE SET expires_at = excluded.expires_at,
               reason = excluded.reason, created_at = excluded.created_at`,
            pilotId,
            expiresAt,
            reason,
            now,
          );
          for (const socket of this.ctx.getWebSockets()) {
            const attachment = (socket as HibernatingWebSocket).deserializeAttachment();
            if (attachment.pilotId === pilotId) socket.close(1008, "Chat access restricted");
          }
        }
        return Response.json({ success: true });
      }
      return Response.json({ error: "Acción de moderación no válida." }, { status: 400 });
    }

    if (url.pathname === "/event" && request.method === "POST") {
      const chatEnabled =
        this.ctx.storage.sql
          .exec<{ enabled: number }>("SELECT enabled FROM chat_settings WHERE id = 1")
          .toArray()[0]?.enabled !== 0;
      if (!chatEnabled)
        return new Response("El chat está temporalmente suspendido.", { status: 503 });
      const payload = (await request.json().catch(() => null)) as IncomingEvent | null;
      if (
        !payload ||
        typeof payload.pilotId !== "string" ||
        typeof payload.callsign !== "string" ||
        !isChatLanguage(payload.language) ||
        payload.type !== "boss_kill" ||
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
          vip: payload.vip === true,
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
    const chatEnabled =
      this.ctx.storage.sql
        .exec<{ enabled: number }>("SELECT enabled FROM chat_settings WHERE id = 1")
        .toArray()[0]?.enabled !== 0;
    if (!chatEnabled) {
      socket.close(1012, "Chat temporarily suspended");
      return;
    }
    const mute = this.ctx.storage.sql
      .exec<{ expires_at: number | null }>(
        "SELECT expires_at FROM chat_mutes WHERE pilot_id = ?",
        attachment.pilotId,
      )
      .toArray()[0];
    if (mute && (mute["expires_at"] === null || mute["expires_at"] > Date.now())) {
      socket.close(1008, "Chat access restricted");
      return;
    }
    if (mute)
      this.ctx.storage.sql.exec("DELETE FROM chat_mutes WHERE pilot_id = ?", attachment.pilotId);
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
        vip: attachment.vip === true,
        text: payload.text.trim(),
      }),
    );
  }

  broadcast(message: ChatMessage): void {
    const serialized = JSON.stringify(message);
    for (const socket of this.ctx.getWebSockets()) {
      const client = socket as HibernatingWebSocket;
      if (client.deserializeAttachment().language !== message["language"]) continue;
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
        (type, pilot_id, callsign, text, language, alliance_tag, timestamp, vip)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      input.type,
      input.pilotId,
      input.callsign,
      input.text,
      input.language,
      input.allianceTag,
      timestamp,
      input.vip ? 1 : 0,
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
      vip: input.vip,
      text: input.text,
      timestamp,
    };
  }

  sendHistory(socket: WebSocket, language: ChatLanguage): void {
    const messages = this.ctx.storage.sql
      .exec<StoredMessage>(
        `SELECT id, type, pilot_id, callsign, text, language, alliance_tag, vip, timestamp
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
          id: message["id"],
          type: message["type"],
          language: message["language"],
          pilotId: message["pilot_id"],
          callsign: message["callsign"],
          allianceTag: message["alliance_tag"],
          vip: message["vip"] === 1,
          text: message["text"],
          timestamp: message["timestamp"],
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

import type { ChatMessage } from "./chat-room";

interface D1Statement {
  bind(...values: (string | number)[]): D1Statement;
  first<T>(): Promise<T | null>;
}

interface ChatDatabase {
  prepare(query: string): D1Statement;
}

interface ChatRoomStub {
  fetch(request: Request): Promise<Response>;
}

interface ChatRoomNamespace {
  idFromName(name: string): unknown;
  get(id: unknown): ChatRoomStub;
}

export interface ChatWorkerEnv {
  DB?: unknown;
  CHAT_ROOM?: ChatRoomNamespace;
}

interface PlayerAccount {
  google_sub: string;
  pilot_id: string;
  display_name: string;
}

const SESSION_COOKIE = "__Host-ss_session";
const PILOT_ID_PATTERN = /^plt_[0-9a-f]{24}$/;
const MAX_EVENT_TEXT_LENGTH = 240;

export async function handleChatRequest(
  request: Request,
  env: ChatWorkerEnv | undefined,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== "/api/chat/ws" && url.pathname !== "/api/chat/event") return null;
  if (!env || !isChatDatabase(env.DB)) {
    return json({ error: "La base de datos no está disponible en este Worker." }, 503);
  }
  const db = env.DB;

  if (url.pathname === "/api/chat/ws" && request.method === "GET") {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return json({ error: "Se requiere una conexión WebSocket." }, 426);
    }
    if (request.headers.get("origin") !== url.origin) {
      return json({ error: "Origen de conexión no autorizado." }, 403);
    }
    const player = await getChatPlayer(request, db);
    if (!player) return json({ error: "Inicia sesión con Google para usar el chat." }, 401);
    if (!env.CHAT_ROOM) {
      return json({ error: "La sala de chat no está disponible en este Worker." }, 503);
    }

    const room = env.CHAT_ROOM.get(env.CHAT_ROOM.idFromName("global"));
    const socketUrl = new URL(request.url);
    socketUrl.pathname = "/websocket";
    socketUrl.search = new URLSearchParams({
      pilotId: player.pilot_id,
      callsign: player.display_name,
    }).toString();
    return room.fetch(new Request(socketUrl, request));
  }

  if (url.pathname === "/api/chat/event" && request.method === "POST") {
    if (request.headers.get("origin") !== url.origin) {
      return json({ error: "Solicitud no autorizada." }, 403);
    }
    const player = await getChatPlayer(request, db);
    if (!player) return json({ error: "Inicia sesión con Google para usar el chat." }, 401);
    if (!env.CHAT_ROOM) {
      return json({ error: "La sala de chat no está disponible en este Worker." }, 503);
    }
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body["type"] !== "string") {
      return json({ error: "El evento de chat no es válido." }, 400);
    }

    let type: "boss_kill" | "drop";
    let text: string;
    if (
      body["type"] === "boss_kill" &&
      isShortText(body["bossName"], 50) &&
      isShortText(body["shipName"], 50)
    ) {
      type = "boss_kill";
      text = `mató al boss ${body["bossName"].trim()} con la nave ${body["shipName"].trim()}.`;
    } else if (body["type"] === "drop" && isShortText(body["itemName"], 50)) {
      type = "drop";
      text = `obtuvo ${body["itemName"].trim()}.`;
    } else {
      return json({ error: "El evento de chat no es válido." }, 400);
    }
    if (text.length > MAX_EVENT_TEXT_LENGTH) {
      return json({ error: "El evento de chat es demasiado largo." }, 400);
    }

    const room = env.CHAT_ROOM.get(env.CHAT_ROOM.idFromName("global"));
    const response = await room.fetch(
      new Request("https://chat-room/event", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          pilotId: player.pilot_id,
          callsign: player.display_name,
          type,
          text: `${player.display_name} ${text}`,
        }),
      }),
    );
    if (!response.ok) {
      console.error("El Durable Object rechazó un evento de chat:", response.status);
      return json({ error: "No se pudo publicar el evento en el chat." }, 502);
    }
    return new Response(null, { status: 204 });
  }

  return json({ error: "Método de chat no permitido." }, 405);
}

async function getChatPlayer(request: Request, db: ChatDatabase): Promise<PlayerAccount | null> {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) return null;
  const tokenHash = await sha256Hex(token);
  const session = await db
    .prepare(
      `SELECT wallet_address FROM auth_sessions
       WHERE token_hash = ? AND expires_at > ?`,
    )
    .bind(tokenHash, Date.now())
    .first<{ wallet_address: string }>();
  if (!session?.wallet_address.startsWith("google:")) return null;

  const account = await db
    .prepare(
      `SELECT a.google_sub, a.pilot_id, p.display_name
       FROM player_accounts a
       LEFT JOIN player_profiles p ON p.pilot_id = a.pilot_id
       WHERE a.google_sub = ?`,
    )
    .bind(session.wallet_address.slice("google:".length))
    .first<{ google_sub: string; pilot_id: string; display_name: string | null }>();
  if (!account || !PILOT_ID_PATTERN.test(account.pilot_id)) return null;
  return {
    google_sub: account.google_sub,
    pilot_id: account.pilot_id,
    display_name: account.display_name?.trim() || "PILOTO",
  };
}

function isChatDatabase(value: unknown): value is ChatDatabase {
  return (
    typeof value === "object" &&
    value !== null &&
    "prepare" in value &&
    typeof value.prepare === "function"
  );
}

function readCookie(request: Request, name: string): string | null {
  for (const item of (request.headers.get("cookie") ?? "").split(";")) {
    const separator = item.indexOf("=");
    if (separator >= 0 && item.slice(0, separator).trim() === name) {
      return item.slice(separator + 1).trim() || null;
    }
  }
  return null;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function isShortText(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maxLength;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export type { ChatMessage };

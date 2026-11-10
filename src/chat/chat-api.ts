import type { ChatMessage } from "./types";
import { hasVip } from "../game/meta/vip";

interface D1Statement {
  bind(...values: (string | number)[]): D1Statement;
  first<T>(): Promise<T | null>;
  run(): Promise<unknown>;
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
  alliance_tag: string | null;
  vip: boolean;
}

const SESSION_COOKIE = "__Host-ss_session";
const PILOT_ID_PATTERN = /^plt_[0-9a-f]{24}$/;
const MAX_EVENT_TEXT_LENGTH = 240;
let adminPlayerStatusSchemaPromise: Promise<void> | undefined;

async function ensureAdminPlayerStatusSchema(db: ChatDatabase): Promise<void> {
  if (!adminPlayerStatusSchemaPromise) {
    adminPlayerStatusSchemaPromise = db
      .prepare(
        `CREATE TABLE IF NOT EXISTS admin_player_status (
        pilot_id TEXT PRIMARY KEY,
        suspended_at INTEGER,
        reason TEXT,
        updated_at INTEGER NOT NULL
      )`,
      )
      .run()
      .then(() =>
        db
          .prepare(
            `CREATE TABLE IF NOT EXISTS chat_reports (
              id TEXT PRIMARY KEY,
              message_id INTEGER NOT NULL,
              language TEXT NOT NULL,
              reporter_pilot_id TEXT NOT NULL,
              target_pilot_id TEXT NOT NULL,
              reason TEXT NOT NULL,
              status TEXT NOT NULL DEFAULT 'OPEN',
              created_at INTEGER NOT NULL,
              reviewed_at INTEGER,
              reviewed_by TEXT,
              resolution_note TEXT
            )`,
          )
          .run(),
      )
      .then(() =>
        db
          .prepare(
            `CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_reports_unique
             ON chat_reports(message_id, language, reporter_pilot_id)`,
          )
          .run(),
      )
      .then(() => undefined)
      .catch((error) => {
        adminPlayerStatusSchemaPromise = undefined;
        throw error;
      });
  }
  await adminPlayerStatusSchemaPromise;
}

export async function handleChatRequest(
  request: Request,
  env: ChatWorkerEnv | undefined,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (
    url.pathname !== "/api/chat/ws" &&
    url.pathname !== "/api/chat/event" &&
    url.pathname !== "/api/chat/report"
  )
    return null;
  if (!env || !isChatDatabase(env.DB)) {
    return json({ error: "La base de datos no está disponible en este Worker." }, 503);
  }
  const db = env.DB;
  try {
    await ensureAdminPlayerStatusSchema(db);
  } catch (error) {
    console.error("No se pudo preparar el estado administrativo de jugadores:", error);
    return json({ error: "No se pudo comprobar el estado de la cuenta." }, 503);
  }

  if (url.pathname === "/api/chat/report" && request.method === "POST") {
    if (request.headers.get("origin") !== url.origin) {
      return json({ error: "Solicitud no autorizada." }, 403);
    }
    const player = await getChatPlayer(request, db);
    if (!player) return json({ error: "Inicia sesión con Google para denunciar mensajes." }, 401);
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const messageId = Number(body?.["messageId"]);
    const targetPilotId = typeof body?.["pilotId"] === "string" ? body["pilotId"].trim() : "";
    const language = body?.["language"];
    const reason = typeof body?.["reason"] === "string" ? body["reason"].trim() : "";
    if (
      !Number.isSafeInteger(messageId) ||
      messageId <= 0 ||
      !PILOT_ID_PATTERN.test(targetPilotId) ||
      targetPilotId === player.pilot_id ||
      (language !== "es" && language !== "en") ||
      reason.length < 5 ||
      reason.length > 240
    ) {
      return json(
        { error: "Selecciona un mensaje y escribe un motivo de al menos 5 caracteres." },
        400,
      );
    }
    try {
      await db
        .prepare(
          `INSERT INTO chat_reports
           (id, message_id, language, reporter_pilot_id, target_pilot_id, reason, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          messageId,
          language,
          player.pilot_id,
          targetPilotId,
          reason,
          Date.now(),
        )
        .run();
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message.includes("UNIQUE")) {
        return json({ error: "Ya denunciaste este mensaje." }, 409);
      }
      throw error;
    }
    return json({ success: true });
  }

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
    const language = url.searchParams.get("language");
    if (language !== "en" && language !== "es") {
      return json({ error: "Selecciona un idioma válido para el chat." }, 400);
    }
    const socketUrl = new URL(request.url);
    socketUrl.pathname = "/websocket";
    socketUrl.search = new URLSearchParams({
      pilotId: player.pilot_id,
      callsign: player.display_name,
      allianceTag: player.alliance_tag ?? "",
      vip: player.vip ? "1" : "0",
      language,
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

    let type: "boss_kill";
    let englishText: string;
    let spanishText: string;
    if (
      body["type"] === "boss_kill" &&
      isShortText(body["bossName"], 50) &&
      isShortText(body["shipName"], 50)
    ) {
      type = "boss_kill";
      englishText = `defeated boss ${body["bossName"].trim()} and received ship ${body["shipName"].trim()}.`;
      spanishText = `mató al boss ${body["bossName"].trim()} y recibió la nave ${body["shipName"].trim()}.`;
    } else {
      return json({ error: "El evento de chat no es válido." }, 400);
    }
    if (englishText.length > MAX_EVENT_TEXT_LENGTH || spanishText.length > MAX_EVENT_TEXT_LENGTH) {
      return json({ error: "El evento de chat es demasiado largo." }, 400);
    }

    const room = env.CHAT_ROOM.get(env.CHAT_ROOM.idFromName("global"));
    const eventRequests = (["en", "es"] as const).map((language) =>
      room.fetch(
        new Request("https://chat-room/event", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            pilotId: player.pilot_id,
            callsign: player.display_name,
            allianceTag: player.alliance_tag,
            vip: player.vip,
            type,
            language,
            text: `${player.display_name} ${language === "en" ? englishText : spanishText}`,
          }),
        }),
      ),
    );
    const responses = await Promise.all(eventRequests);
    if (responses.some((response) => !response.ok)) {
      console.error(
        "El Durable Object rechazó un evento de chat:",
        responses.filter((response) => !response.ok).map((response) => response.status),
      );
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
      `SELECT a.google_sub, a.pilot_id, p.display_name, alliance.tag AS alliance_tag, pilot.vip_until AS vip_until
       FROM player_accounts a
       LEFT JOIN player_profiles p ON p.pilot_id = a.pilot_id
       LEFT JOIN pilots pilot ON pilot.pilot_id = a.pilot_id
       LEFT JOIN admin_player_status admin_status ON admin_status.pilot_id = a.pilot_id
       LEFT JOIN alliance_members member ON member.pilot_id = a.pilot_id
       LEFT JOIN alliances alliance ON alliance.alliance_id = member.alliance_id
       WHERE a.google_sub = ? AND admin_status.suspended_at IS NULL`,
    )
    .bind(session.wallet_address.slice("google:".length))
    .first<{
      google_sub: string;
      pilot_id: string;
      display_name: string | null;
      alliance_tag: string | null;
      vip_until: number | null;
    }>();
  if (!account || !PILOT_ID_PATTERN.test(account.pilot_id)) return null;
  return {
    google_sub: account.google_sub,
    pilot_id: account.pilot_id,
    display_name: account.display_name?.trim() || "PILOTO",
    alliance_tag: account.alliance_tag,
    vip: hasVip({ vip_until: account.vip_until }),
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

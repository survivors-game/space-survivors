import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { SHIPS } from "./game/data/ships";
import { BOSS_COOLDOWN_MS, BOSS_REWARDS } from "./game/data/boss-rewards";
import { defaultProgress } from "./game/meta/progress";
import {
  P2P_COUNTRIES,
  P2P_PRICE_LIMITS,
  P2P_USDT_NETWORKS,
  paymentMethodKey,
  paymentMethodLabel,
  type P2PCountry,
  type P2PCurrency,
  type P2PPayMethod,
  type P2PPaymentMethodChoice,
  type P2PPublicPaymentMethod,
  type P2PUsdtNetwork,
} from "./game/data/market";
import {
  createBossCombatProof,
  type BossCombatEvidence,
  type BossCombatEvent,
} from "./game/meta/boss-combat-proof";
import { handleChatRequest, type ChatWorkerEnv } from "./chat/chat-api";
import { hasVip } from "./game/meta/vip";
import { BossHelpRoom } from "./game/boss-help-room";
import { bossById } from "./game/data/bosses";

type D1Result<T = Record<string, unknown>> = {
  meta?: { changes?: number };
  results?: T[];
};
type D1Statement = {
  bind(...values: unknown[]): D1Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run(): Promise<D1Result>;
};
type D1Database = {
  prepare(query: string): D1Statement;
  batch<T = Record<string, unknown>>(statements: D1Statement[]): Promise<D1Result<T>[]>;
};
type KVNamespace = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
};
type WorkerEnv = ChatWorkerEnv & {
  DB?: D1Database;
  LEADERBOARD?: KVNamespace;
  WAR_ROOM?: {
    idFromName(name: string): unknown;
    get(id: unknown): { fetch(request: Request): Promise<Response> };
  };
  BOSS_HELP?: {
    idFromName(name: string): unknown;
    get(id: unknown): { fetch(request: Request): Promise<Response> };
  };
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GOOGLE_REDIRECT_URI?: string;
  ADMIN_PANEL_PASSWORD?: string;
  TURNSTILE_SECRET_KEY?: string;
  TURNSTILE_SITE_KEY?: string;
};
type CloudflareRequest = Request & {
  runtime?: { cloudflare?: { env?: WorkerEnv } };
};
type NitroGlobal = typeof globalThis & { __env__?: WorkerEnv };
type ServerEntry = {
  fetch: (request: Request) => Promise<Response> | Response;
};

const SESSION_COOKIE = "__Host-ss_session";
const PILOT_COOKIE = "__Host-ss_pilot";
const OAUTH_STATE_COOKIE = "__Host-ss_google_state";
const ADMIN_SESSION_COOKIE = "__Host-ss_admin";
const ADMIN_SESSION_TTL_MS = 30 * 60 * 1000;
const ADMIN_LOGIN_WINDOW_MS = 15 * 60 * 1000;
const ADMIN_LOGIN_MAX_ATTEMPTS = 5;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const GOOGLE_STATE_TTL_MS = 10 * 60 * 1000;
const BOSS_ATTEMPT_TTL_MS = 10 * 60 * 1000;
const BOSS_COMBAT_PARAMS: Record<
  string,
  { hp: number; damage: number; minCombatMs: number; maxHitDamage: number }
> = {
  leviathan: { hp: 26_000, damage: 36, minCombatMs: 30_000, maxHitDamage: 6_500 },
  nemesis: { hp: 9_000, damage: 28, minCombatMs: 45_000, maxHitDamage: 2_250 },
  colossus: { hp: 19_000, damage: 34, minCombatMs: 60_000, maxHitDamage: 4_750 },
};
const ADMIN_EMAIL = "emprendedora.onlinevee@gmail.com";
const GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const LEADERBOARD_KEY = "global:top100";
const INVITEE_OBS_REWARD = 5;
const INVITEE_CR_REWARD = 100;
const INVITEE_ITEM = "iman";
const INVITEE_ITEM_QTY = 5;
const REFERRER_OBS_REWARD = 3;
const REFERRAL_CODE_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const DEFAULT_REFERRAL_PROGRESS = JSON.stringify(defaultProgress());
let serverEntryPromise: Promise<ServerEntry> | undefined;
let schemaPromise: Promise<void> | undefined;
let marketSchemaPromise: Promise<void> | undefined;
let googleJwksPromise: Promise<{ keys: JsonWebKey[] }> | undefined;
let googleJwksCache: { keys: JsonWebKey[]; expiresAt: number } | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

async function ensureAuthSchema(db: D1Database): Promise<void> {
  if (!schemaPromise) {
    schemaPromise = (async () => {
      await db
        .prepare(
          `CREATE TABLE IF NOT EXISTS google_oauth_states (
        state_hash TEXT PRIMARY KEY,
        nonce TEXT NOT NULL,
        code_verifier TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        consumed_at INTEGER
      )`,
        )
        .run();
      await db
        .prepare(
          `CREATE INDEX IF NOT EXISTS idx_google_oauth_states_expiry
        ON google_oauth_states(expires_at)`,
        )
        .run();
      await db
        .prepare(
          `CREATE TABLE IF NOT EXISTS player_accounts (
        google_sub TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        pilot_id TEXT NOT NULL UNIQUE,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )`,
        )
        .run();
      await db
        .prepare(
          `CREATE TABLE IF NOT EXISTS player_progress (
        pilot_id TEXT PRIMARY KEY,
        progress_json TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      )`,
        )
        .run();
      await db
        .prepare(
          `CREATE TABLE IF NOT EXISTS player_profiles (
        pilot_id TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      )`,
        )
        .run();
      await db
        .prepare(
          `CREATE INDEX IF NOT EXISTS idx_player_accounts_email
        ON player_accounts(email)`,
        )
        .run();
      await db
        .prepare(
          `CREATE TABLE IF NOT EXISTS auth_sessions (
        token_hash TEXT PRIMARY KEY,
        wallet_address TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
      )`,
        )
        .run();
      await db
        .prepare(
          `CREATE INDEX IF NOT EXISTS idx_auth_sessions_expiry
        ON auth_sessions(expires_at)`,
        )
        .run();      await db
        .prepare(
          `CREATE TABLE IF NOT EXISTS admin_sessions (
        token_hash TEXT PRIMARY KEY,
        google_sub TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
      )`,
        )
        .run();
      await db
        .prepare(
          `CREATE INDEX IF NOT EXISTS idx_admin_sessions_expiry
        ON admin_sessions(expires_at)`,
        )
        .run();
      await db
        .prepare(
          `CREATE TABLE IF NOT EXISTS admin_login_attempts (
        ip_hash TEXT PRIMARY KEY,
        attempts INTEGER NOT NULL,
        window_started_at INTEGER NOT NULL,
        blocked_until INTEGER NOT NULL DEFAULT 0
      )`,
        )
        .run();
    })().catch((error) => {
      schemaPromise = undefined;
      throw error;
    });
  }
  return schemaPromise;
}

function getWorkerEnv(request: Request, env: unknown): WorkerEnv | undefined {
  const cloudflareEnv = (request as CloudflareRequest).runtime?.cloudflare?.env;
  const workerEnv = env && typeof env === "object" ? (env as WorkerEnv) : undefined;
  const nitroEnv = (globalThis as NitroGlobal).__env__;
  const candidates = [workerEnv, cloudflareEnv, nitroEnv].filter(
    (candidate): candidate is WorkerEnv => candidate !== undefined,
  );

  // Cloudflare/Nitro can expose partial env objects in different places.
  // Resolve each binding independently so a partial object with DB cannot
  // hide Google OAuth secrets supplied by another runtime env object.
  const database = candidates.find(
    (candidate) => candidate.DB && typeof candidate.DB.prepare === "function",
  )?.DB;
  if (!database && candidates.length === 0) return undefined;

  const chatRoom = candidates.find((candidate) => candidate.CHAT_ROOM)?.CHAT_ROOM;
  const bossHelp = candidates.find((candidate) => candidate.BOSS_HELP)?.BOSS_HELP;
  const warRoom = candidates.find((candidate) => candidate.WAR_ROOM)?.WAR_ROOM;
  const googleClientId = candidates.find(
    (candidate) => candidate.GOOGLE_CLIENT_ID,
  )?.GOOGLE_CLIENT_ID;
  const googleClientSecret = candidates.find(
    (candidate) => candidate.GOOGLE_CLIENT_SECRET,
  )?.GOOGLE_CLIENT_SECRET;
  const googleRedirectUri = candidates.find(
    (candidate) => candidate.GOOGLE_REDIRECT_URI,
  )?.GOOGLE_REDIRECT_URI;
  const adminPanelPassword = candidates.find(
    (candidate) => candidate.ADMIN_PANEL_PASSWORD,
  )?.ADMIN_PANEL_PASSWORD;
  const leaderboard = candidates.find((candidate) => candidate.LEADERBOARD)?.LEADERBOARD;
  const turnstileSecretKey = candidates.find(
    (candidate) => candidate.TURNSTILE_SECRET_KEY,
  )?.TURNSTILE_SECRET_KEY;
  const turnstileSiteKey = candidates.find(
    (candidate) => candidate.TURNSTILE_SITE_KEY,
  )?.TURNSTILE_SITE_KEY;
  return {
    ...(database ? { DB: database } : {}),
    ...(chatRoom ? { CHAT_ROOM: chatRoom } : {}),
    ...(bossHelp ? { BOSS_HELP: bossHelp } : {}),
    ...(warRoom ? { WAR_ROOM: warRoom } : {}),
    ...(leaderboard ? { LEADERBOARD: leaderboard } : {}),
    ...(googleClientId ? { GOOGLE_CLIENT_ID: googleClientId } : {}),
    ...(googleClientSecret ? { GOOGLE_CLIENT_SECRET: googleClientSecret } : {}),
    ...(googleRedirectUri ? { GOOGLE_REDIRECT_URI: googleRedirectUri } : {}),
    ...(adminPanelPassword ? { ADMIN_PANEL_PASSWORD: adminPanelPassword } : {}),
    ...(turnstileSecretKey ? { TURNSTILE_SECRET_KEY: turnstileSecretKey } : {}),
    ...(turnstileSiteKey ? { TURNSTILE_SITE_KEY: turnstileSiteKey } : {}),
  };
}

function json(data: unknown, status = 200, headers?: HeadersInit): Response {
  const resultHeaders = new Headers(headers);
  resultHeaders.set("content-type", "application/json; charset=utf-8");
  resultHeaders.set("cache-control", "no-store");
  return new Response(JSON.stringify(data), { status, headers: resultHeaders });
}

function randomHex(length: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function readCookie(request: Request, name: string): string | null {
  const cookieHeader = request.headers.get("cookie") ?? "";
  for (const item of cookieHeader.split(";")) {
    const separator = item.indexOf("=");
    if (separator < 0) continue;
    if (item.slice(0, separator).trim() === name) {
      return item.slice(separator + 1).trim() || null;
    }
  }
  return null;
}

function sessionCookie(token: string, maxAge: number): string {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

function googleStateCookie(state: string, maxAge: number): string {
  return `${OAUTH_STATE_COOKIE}=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

function googleRedirect(location: string): Response {
  const headers = new Headers({
    location,
    "cache-control": "no-store",
    "referrer-policy": "no-referrer",
  });
  return new Response(null, { status: 302, headers });
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function base64UrlDecode(value: string): Uint8Array {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function decodeJwtPart<T>(value: string): T {
  return JSON.parse(new TextDecoder().decode(base64UrlDecode(value))) as T;
}

type GoogleIdClaims = {
  iss: string;
  aud: string | string[];
  azp?: string;
  exp: number;
  iat: number;
  nonce: string;
  sub: string;
  email: string;
  email_verified: boolean;
};

async function getGoogleJwks(): Promise<{ keys: JsonWebKey[] }> {
  if (googleJwksCache && googleJwksCache.expiresAt > Date.now()) {
    return googleJwksCache;
  }
  if (!googleJwksPromise) {
    googleJwksPromise = fetch(GOOGLE_JWKS_URL, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Google JWKS respondió HTTP ${response.status}.`);
        const keySet = (await response.json()) as { keys: JsonWebKey[] };
        googleJwksCache = { ...keySet, expiresAt: Date.now() + 5 * 60 * 1000 };
        return keySet;
      })
      .catch((error) => {
        googleJwksPromise = undefined;
        throw error;
      });
  }
  try {
    return await googleJwksPromise;
  } finally {
    googleJwksPromise = undefined;
  }
}

async function verifyGoogleIdToken(
  token: string,
  clientId: string,
  expectedNonce: string,
): Promise<GoogleIdClaims | null> {
  const parts = token.split(".");
  if (parts.length !== 3 || parts.some((part) => part.length > 16384)) return null;
  try {
    const header = decodeJwtPart<{ alg?: string; kid?: string }>(parts[0]!);
    const claims = decodeJwtPart<GoogleIdClaims>(parts[1]!);
    if (header.alg !== "RS256" || typeof header.kid !== "string") return null;
    const key = (await getGoogleJwks()).keys.find(
      (candidate) => (candidate as JsonWebKey & { kid?: string }).kid === header.kid,
    );
    if (!key) return null;
    const publicKey = await crypto.subtle.importKey(
      "jwk",
      key,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const signatureValid = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      publicKey,
      new Uint8Array(base64UrlDecode(parts[2]!)).buffer,
      new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
    );
    const now = Math.floor(Date.now() / 1000);
    const audienceMatches = Array.isArray(claims.aud)
      ? claims.aud.includes(clientId)
      : claims.aud === clientId;
    if (
      !signatureValid ||
      !["accounts.google.com", "https://accounts.google.com"].includes(claims.iss) ||
      !audienceMatches ||
      (claims.azp !== undefined && claims.azp !== clientId) ||
      (Array.isArray(claims.aud) && claims.aud.length > 1 && claims.azp !== clientId) ||
      !Number.isFinite(claims.exp) ||
      claims.exp <= now ||
      !Number.isFinite(claims.iat) ||
      claims.iat > now + 60 ||
      claims.nonce !== expectedNonce ||
      claims.email_verified !== true ||
      typeof claims.sub !== "string" ||
      !claims.sub ||
      typeof claims.email !== "string" ||
      !claims.email.includes("@")
    ) {
      return null;
    }
    return claims;
  } catch (error) {
    console.error("No se pudo validar el token de identidad de Google:", error);
    return null;
  }
}

function isSameOriginPost(request: Request, url: URL): boolean {
  const origin = request.headers.get("origin");
  return origin === url.origin;
}

async function readJson(
  request: Request,
  maxLength = 8192,
): Promise<Record<string, unknown> | null> {
  try {
    const text = await request.text();
    if (text.length > maxLength) return null;
    const value: unknown = JSON.parse(text);
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function randomReferralCode(): string {
  let suffix = "";
  while (suffix.length < 6) {
    for (const byte of crypto.getRandomValues(new Uint8Array(8))) {
      if (byte < 252) suffix += REFERRAL_CODE_ALPHABET[byte % REFERRAL_CODE_ALPHABET.length];
      if (suffix.length === 6) break;
    }
  }
  return `SG-${suffix}`;
}

async function ensurePilotReferralCode(db: D1Database, pilotId: string): Promise<string> {
  for (let attempt = 0; attempt < 32; attempt += 1) {
    const pilot = await db
      .prepare("SELECT referral_code FROM pilots WHERE pilot_id = ?")
      .bind(pilotId)
      .first<{ referral_code: string | null }>();
    if (!pilot) throw new Error("No se encontró el piloto para asignar su código de invitación.");
    if (pilot.referral_code) return pilot.referral_code;

    const code = randomReferralCode();
    const result = await db
      .prepare(
        `UPDATE pilots SET referral_code = ?
        WHERE pilot_id = ? AND referral_code IS NULL
          AND NOT EXISTS (SELECT 1 FROM pilots WHERE referral_code = ?)`,
      )
      .bind(code, pilotId, code)
      .run();
    if (result.meta?.changes === 1) return code;
  }
  throw new Error("No se pudo generar un código de invitación único.");
}

async function handleVipBuy(request: Request, env: WorkerEnv | undefined): Promise<Response> {
  void request;
  void env;
  return json(
    {
      error:
        "La compra de VIP con OBS está temporalmente deshabilitada. El VIP solo puede ser asignado por la administración.",
    },
    403,
  );
}

async function handleSocialRequest(
  request: Request,
  env: WorkerEnv | undefined,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname.startsWith("/api/alliance/") || url.pathname === "/api/admin/set-vip") {
    return handleAllianceRequest(request, env);
  }
  if (url.pathname === "/api/vip/buy") return handleVipBuy(request, env);
  const isMine = url.pathname === "/api/referral/mine";
  const isLeaderboard = url.pathname === "/api/referral/leaderboard";
  const isMyCode = url.pathname === "/api/referral/my-code";
  const isRedeem = url.pathname === "/api/referral/redeem";
  if (!url.pathname.startsWith("/api/referral/")) return null;
  if (!isMine && !isLeaderboard && !isMyCode && !isRedeem) {
    return json({ error: "Ruta de invitaciones no encontrada." }, 404);
  }

  async function handleAllianceRequest(
    request: Request,
    env: WorkerEnv | undefined,
  ): Promise<Response | null> {
    const url = new URL(request.url);
    const isAlliancePath = url.pathname.startsWith("/api/alliance/");
    const isAdminVipPath = url.pathname === "/api/admin/set-vip";
    if (!isAlliancePath && !isAdminVipPath) return null;
    if (!env?.DB)
      return json({ error: "La base de datos no está disponible en este Worker." }, 503);
    if (request.method !== "GET" && request.method !== "POST") {
      return json({ error: "Método no permitido." }, 405);
    }
    if (request.method === "POST" && !isSameOriginPost(request, url)) {
      return json({ error: "Solicitud no autorizada." }, 403);
    }
    const db = env.DB;
    try {
      await ensureAuthSchema(db);
    } catch (error) {
      console.error("No se pudo preparar la autenticación para alianzas:", error);
      return json({ error: "No se pudo preparar el sistema de alianzas." }, 503);
    }
    const account = await getAuthenticatedAccount(db, await requestSessionHash(request));

    if (isAdminVipPath) {
      if (request.method !== "POST") return json({ error: "Método no permitido." }, 405);
      if (!account) return json({ error: "Inicia sesión con la cuenta administradora." }, 401);
      if (account.email.toLowerCase() !== ADMIN_EMAIL || !(await hasValidAdminSession(db, request, account.google_sub))) {
        return json({ error: "Acceso administrativo requerido." }, 403);
      }
      const body = await readJson(request);
      const pilotId = body?.["pilot_id"];
      const days = body?.["days"];
      if (
        !validPilotId(pilotId) ||
        typeof days !== "number" ||
        !Number.isSafeInteger(days) ||
        days < 1 ||
        days > Math.floor((Number.MAX_SAFE_INTEGER - Date.now()) / (24 * 60 * 60 * 1000))
      ) {
        return json({ error: "Indica un pilot_id válido y un número de días positivo." }, 400);
      }
      const vipUntil = Date.now() + days * 24 * 60 * 60 * 1000;
      const updated = await db
        .prepare("UPDATE pilots SET vip_until = ?, updated_at = ? WHERE pilot_id = ?")
        .bind(vipUntil, Date.now(), pilotId)
        .run();
      if (updated.meta?.changes !== 1) return json({ error: "No se encontró el piloto." }, 404);
      return json({ success: true, pilot_id: pilotId, vip_until: vipUntil });
    }

    if (!account) return json({ error: "Inicia sesión con Google para usar las alianzas." }, 401);
    if (request.method === "POST" && !url.pathname.startsWith("/api/alliance/")) {
      return json({ error: "Ruta de alianza no encontrada." }, 404);
    }
    const now = Date.now();
    const pilotId = account.pilot_id;

    if (url.pathname === "/api/alliance/leaderboard" && request.method === "GET") {
      const rows = await db
        .prepare(
          `SELECT a.alliance_id,a.name,a.tag,a.level,a.war_wins,a.war_losses,
        (SELECT COUNT(*) FROM alliance_members m WHERE m.alliance_id=a.alliance_id) AS member_count
        FROM alliances a WHERE a.war_wins+a.war_losses>0 ORDER BY a.war_wins DESC,a.level DESC,a.name ASC LIMIT 100`,
        )
        .all();
      return json({ alliances: rows.results ?? [] });
    }
    if (url.pathname === "/api/alliance/war/opponents" && request.method === "GET") {
      const own = await db
        .prepare(
          "SELECT a.alliance_id,a.level FROM alliance_members m JOIN alliances a ON a.alliance_id=m.alliance_id WHERE m.pilot_id=?",
        )
        .bind(pilotId)
        .first<{ alliance_id: string; level: number }>();
      if (!own) return json({ error: "No perteneces a una alianza." }, 404);
      const opponents = await db
        .prepare(
          `SELECT a.alliance_id,a.name,a.tag,a.level,
        (SELECT COUNT(*) FROM alliance_members m WHERE m.alliance_id=a.alliance_id) AS member_count
        FROM alliances a WHERE a.alliance_id!=? AND a.level BETWEEN ? AND ?
        AND (SELECT COUNT(*) FROM alliance_members m WHERE m.alliance_id=a.alliance_id)>=3
        AND NOT EXISTS (SELECT 1 FROM alliance_wars w WHERE w.status IN ('DECLARED','PREPARING','ACTIVE')
          AND (w.attacker_alliance_id=a.alliance_id OR w.defender_alliance_id=a.alliance_id))
        ORDER BY a.level,a.name LIMIT 100`,
        )
        .bind(own.alliance_id, own.level, own.level + 1)
        .all();
      return json({ opponents: opponents.results ?? [] });
    }
    if (url.pathname === "/api/alliance/war/history" && request.method === "GET") {
      const own = await db
        .prepare("SELECT alliance_id FROM alliance_members WHERE pilot_id=?")
        .bind(pilotId)
        .first<{ alliance_id: string }>();
      if (!own) return json({ wars: [] });
      const rows = await db
        .prepare(
          `SELECT w.*,aa.name AS attacker_name,aa.tag AS attacker_tag,
        da.name AS defender_name,da.tag AS defender_tag FROM alliance_wars w
        JOIN alliances aa ON aa.alliance_id=w.attacker_alliance_id JOIN alliances da ON da.alliance_id=w.defender_alliance_id
        WHERE w.attacker_alliance_id=? OR w.defender_alliance_id=? ORDER BY w.created_at DESC LIMIT 50`,
        )
        .bind(own.alliance_id, own.alliance_id)
        .all();
      return json({ wars: rows.results ?? [] });
    }
    if (url.pathname.startsWith("/api/alliance/war/")) {
      if (!env.WAR_ROOM) return json({ error: "El servicio de guerras no está disponible." }, 503);
      const action = url.pathname.slice("/api/alliance/war/".length);
      if (action === "ships" && request.method === "GET") {
        const ships = await db
          .prepare(
            "SELECT item_id,item_name FROM pilot_inventory WHERE pilot_id=? AND item_type='nave' AND is_locked=0 AND quantity>0 ORDER BY created_at",
          )
          .bind(pilotId)
          .all();
        return json({ ships: ships.results ?? [] });
      }
      if (action.startsWith("status/") && request.method === "GET") {
        const warId = action.slice("status/".length);
        if (!/^war_[a-f0-9]{24}$/.test(warId))
          return json({ error: "Identificador de guerra inválido." }, 400);
        const room = env.WAR_ROOM.get(env.WAR_ROOM.idFromName(warId));
        const response = await room.fetch(
          new Request(
            `https://war.internal/status?war_id=${encodeURIComponent(warId)}&pilot_id=${encodeURIComponent(pilotId)}`,
          ),
        );
        return json(await response.json(), response.status);
      }
      if (request.method !== "POST") return json({ error: "Método no permitido." }, 405);
      const body = await readJson(request);
      if (!body) return json({ error: "Datos de guerra inválidos." }, 400);
      if (action === "declare") {
        const defenderAllianceId = body["defender_alliance_id"];
        if (typeof defenderAllianceId !== "string" || defenderAllianceId.length > 64)
          return json({ error: "Selecciona una alianza rival." }, 400);
        const own = await db
          .prepare("SELECT alliance_id FROM alliance_members WHERE pilot_id=?")
          .bind(pilotId)
          .first<{ alliance_id: string }>();
        if (!own) return json({ error: "No perteneces a una alianza." }, 404);
        const warId = `war_${randomHex(12)}`;
        const room = env.WAR_ROOM.get(env.WAR_ROOM.idFromName(warId));
        const response = await room.fetch(
          new Request("https://war.internal/declare", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              warId,
              actorPilotId: pilotId,
              attackerAllianceId: own.alliance_id,
              defenderAllianceId,
            }),
          }),
        );
        return json(await response.json(), response.status);
      }
      const warId = body["war_id"];
      if (typeof warId !== "string" || !/^war_[a-f0-9]{24}$/.test(warId))
        return json({ error: "Identificador de guerra inválido." }, 400);
      const internalPath =
        action === "respond"
          ? "/respond"
          : action === "select-ship"
            ? "/select-ship"
            : action === "start"
              ? "/start"
              : action === "action"
                ? "/action"
                : "";
      if (!internalPath) return json({ error: "Ruta de guerra no encontrada." }, 404);
      const room = env.WAR_ROOM.get(env.WAR_ROOM.idFromName(warId));
      const response = await room.fetch(
        new Request(`https://war.internal${internalPath}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...body, warId, actorPilotId: pilotId }),
        }),
      );
      return json(await response.json(), response.status);
    }

    if (url.pathname === "/api/alliance/mine" && request.method === "GET") {
      const membership = await db
        .prepare(
          `SELECT alliance.alliance_id, alliance.name, alliance.tag, alliance.level,
            alliance.leader_pilot_id, member.role
           FROM alliance_members member
           JOIN alliances alliance ON alliance.alliance_id = member.alliance_id
           WHERE member.pilot_id = ?`,
        )
        .bind(pilotId)
        .first<{
          alliance_id: string;
          name: string;
          tag: string;
          level: number;
          leader_pilot_id: string;
          role: "lider" | "teniente" | "miembro";
        }>();
      const invites = await db
        .prepare(
          `SELECT invite.invite_id, invite.alliance_id, alliance.name AS alliance_name,
            alliance.tag, invite.invited_by,
            COALESCE(NULLIF(profile.display_name, ''), pilot.callsign, 'PILOTO') AS inviter_name,
            invite.created_at
           FROM alliance_invites invite
           JOIN alliances alliance ON alliance.alliance_id = invite.alliance_id
           JOIN pilots pilot ON pilot.pilot_id = invite.invited_by
           LEFT JOIN player_profiles profile ON profile.pilot_id = pilot.pilot_id
           WHERE invite.invited_pilot_id = ? AND invite.status = 'PENDIENTE'
           ORDER BY invite.created_at DESC`,
        )
        .bind(pilotId)
        .all<{
          invite_id: string;
          alliance_id: string;
          alliance_name: string;
          tag: string;
          invited_by: string;
          inviter_name: string;
          created_at: number;
        }>();
      const members = membership
        ? await db
            .prepare(
              `SELECT member.pilot_id, member.role, member.joined_at,
                COALESCE(NULLIF(profile.display_name, ''), pilot.callsign, 'PILOTO') AS callsign
               FROM alliance_members member
               JOIN pilots pilot ON pilot.pilot_id = member.pilot_id
               LEFT JOIN player_profiles profile ON profile.pilot_id = member.pilot_id
               WHERE member.alliance_id = ?
               ORDER BY CASE member.role WHEN 'lider' THEN 0 WHEN 'teniente' THEN 1 ELSE 2 END,
                 member.joined_at ASC`,
            )
            .bind(membership.alliance_id)
            .all<{ pilot_id: string; role: string; joined_at: number; callsign: string }>()
        : { results: [] };
      const pilot = await db
        .prepare("SELECT vip_until FROM pilots WHERE pilot_id = ?")
        .bind(pilotId)
        .first<{ vip_until: number | null }>();
      return json({
        pilot_id: pilotId,
        alliance: membership ? { ...membership, members: members.results ?? [] } : null,
        invites: invites.results ?? [],
        vip: pilot ? hasVip(pilot, now) : false,
        vip_until: pilot?.vip_until ?? null,
      });
    }

    if (url.pathname === "/api/alliance/create" && request.method === "POST") {
      const body = await readJson(request);
      const name = typeof body?.["name"] === "string" ? body["name"].trim() : "";
      const tag = typeof body?.["tag"] === "string" ? body["tag"].trim().toUpperCase() : "";
      if (
        name.length < 3 ||
        name.length > 20 ||
        /\p{Cc}/u.test(name) ||
        !/^[A-Z0-9]{2,5}$/.test(tag)
      ) {
        return json(
          { error: "Nombre (3-20 caracteres) o etiqueta (2-5 letras/números) no válidos." },
          400,
        );
      }
      const pilot = await db
        .prepare("SELECT vip_until, obsidian FROM pilots WHERE pilot_id = ?")
        .bind(pilotId)
        .first<{ vip_until: number | null; obsidian: number }>();
      if (!pilot) return json({ error: "No se encontró el piloto." }, 404);
      if (!hasVip(pilot, now))
        return json({ error: "Necesitas VIP activo para crear una alianza." }, 403);
      if (pilot.obsidian < 20)
        return json({ error: "Necesitas 20 OBS para crear una alianza." }, 409);
      const existing = await db
        .prepare("SELECT alliance_id FROM alliance_members WHERE pilot_id = ?")
        .bind(pilotId)
        .first<{ alliance_id: string }>();
      if (existing) return json({ error: "Ya perteneces a una alianza." }, 409);
      const allianceId = `all_${randomHex(12)}`;
      let wasCharged = false;
      try {
        const created = await db
          .prepare(
            `INSERT INTO alliances (alliance_id, name, tag, leader_pilot_id, created_at)
             SELECT ?, ?, ?, pilot_id, ? FROM pilots
             WHERE pilot_id = ? AND vip_until > ? AND obsidian >= 20
               AND NOT EXISTS (SELECT 1 FROM alliance_members WHERE pilot_id = ?)
             RETURNING alliance_id`,
          )
          .bind(allianceId, name, tag, now, pilotId, now, pilotId)
          .first<{ alliance_id: string }>();
        if (!created)
          return json(
            { error: "No se pudo crear la alianza; verifica VIP, OBS y membresía." },
            409,
          );
        await db
          .prepare(
            "INSERT INTO alliance_members (alliance_id, pilot_id, role, joined_at) VALUES (?, ?, 'lider', ?)",
          )
          .bind(allianceId, pilotId, now)
          .run();
        const charged = await db
          .prepare(
            `UPDATE pilots SET obsidian = obsidian - 20, updated_at = ?
             WHERE pilot_id = ? AND vip_until > ? AND obsidian >= 20
               AND EXISTS (SELECT 1 FROM alliance_members WHERE alliance_id = ? AND pilot_id = ?)`,
          )
          .bind(now, pilotId, now, allianceId, pilotId)
          .run();
        if (charged.meta?.changes !== 1) {
          await db.prepare("DELETE FROM alliances WHERE alliance_id = ?").bind(allianceId).run();
          return json(
            { error: "No se pudo cobrar el costo de creación. Inténtalo de nuevo." },
            409,
          );
        }
        wasCharged = true;
        const balance = await db
          .prepare("SELECT obsidian FROM pilots WHERE pilot_id = ?")
          .bind(pilotId)
          .first<{ obsidian: number }>();
        return json({
          success: true,
          alliance_id: allianceId,
          name,
          tag,
          obsidian: balance?.obsidian ?? pilot.obsidian - 20,
        });
      } catch (error) {
        await db.prepare("DELETE FROM alliances WHERE alliance_id = ?").bind(allianceId).run();
        if (wasCharged) {
          await db
            .prepare(
              "UPDATE pilots SET obsidian = obsidian + 20, updated_at = ? WHERE pilot_id = ?",
            )
            .bind(Date.now(), pilotId)
            .run();
        }
        console.error("No se pudo crear la alianza:", error);
        return json(
          { error: "El nombre o la etiqueta ya están en uso, o no se pudo crear la alianza." },
          409,
        );
      }
    }

    if (url.pathname === "/api/alliance/invite" && request.method === "POST") {
      const body = await readJson(request);
      const targetPilotId = body?.["pilot_id"];
      if (!validPilotId(targetPilotId) || targetPilotId === pilotId) {
        return json({ error: "El piloto a invitar no es válido." }, 400);
      }
      const alliance = await db
        .prepare(
          `SELECT alliance.alliance_id, member.role,
            (SELECT COUNT(*) FROM alliance_members WHERE alliance_id = alliance.alliance_id) AS member_count
           FROM alliance_members member JOIN alliances alliance
             ON alliance.alliance_id = member.alliance_id
           WHERE member.pilot_id = ?`,
        )
        .bind(pilotId)
        .first<{ alliance_id: string; role: string; member_count: number }>();
      if (!alliance || (alliance.role !== "lider" && alliance.role !== "teniente")) {
        return json({ error: "Solo el líder o un teniente puede invitar." }, 403);
      }
      if (alliance.member_count >= 10)
        return json({ error: "La alianza ya tiene 10 miembros." }, 409);
      const target = await db
        .prepare("SELECT pilot_id FROM pilots WHERE pilot_id = ?")
        .bind(targetPilotId)
        .first<{ pilot_id: string }>();
      if (!target) return json({ error: "No se encontró al piloto invitado." }, 404);
      const targetMembership = await db
        .prepare("SELECT alliance_id FROM alliance_members WHERE pilot_id = ?")
        .bind(targetPilotId)
        .first<{ alliance_id: string }>();
      if (targetMembership) return json({ error: "El piloto ya pertenece a una alianza." }, 409);
      try {
        const invite = await db
          .prepare(
            `INSERT INTO alliance_invites
              (invite_id, alliance_id, invited_pilot_id, invited_by, created_at)
             SELECT ?, ?, ?, ?, ?
             WHERE NOT EXISTS (SELECT 1 FROM alliance_members WHERE pilot_id = ?)
               AND (SELECT COUNT(*) FROM alliance_members WHERE alliance_id = ?) < 10
             RETURNING invite_id`,
          )
          .bind(
            `inv_${randomHex(12)}`,
            alliance.alliance_id,
            targetPilotId,
            pilotId,
            now,
            targetPilotId,
            alliance.alliance_id,
          )
          .first<{ invite_id: string }>();
        if (!invite)
          return json(
            { error: "No se pudo enviar la invitación: revisa la membresía y capacidad." },
            409,
          );
        return json({ success: true, invite_id: invite.invite_id });
      } catch (error) {
        console.error("No se pudo enviar la invitación de alianza:", error);
        return json(
          { error: "El piloto ya tiene una invitación pendiente o no se pudo invitar." },
          409,
        );
      }
    }

    if (url.pathname === "/api/alliance/accept" && request.method === "POST") {
      const body = await readJson(request);
      const inviteId = body?.["invite_id"];
      if (typeof inviteId !== "string" || inviteId.length > 64) {
        return json({ error: "La invitación indicada no es válida." }, 400);
      }
      try {
        const invite = await db
          .prepare(
            `SELECT alliance_id FROM alliance_invites
             WHERE invite_id = ? AND invited_pilot_id = ? AND status = 'PENDIENTE'`,
          )
          .bind(inviteId, pilotId)
          .first<{ alliance_id: string }>();
        if (!invite) return json({ error: "La invitación ya no está disponible." }, 404);
        const joined = await db
          .prepare(
            `INSERT INTO alliance_members (alliance_id, pilot_id, role, joined_at)
             SELECT ?, ?, 'miembro', ?
             WHERE NOT EXISTS (SELECT 1 FROM alliance_members WHERE pilot_id = ?)
               AND (SELECT COUNT(*) FROM alliance_members WHERE alliance_id = ?) < 10
             RETURNING pilot_id`,
          )
          .bind(invite.alliance_id, pilotId, now, pilotId, invite.alliance_id)
          .first<{ pilot_id: string }>();
        if (!joined)
          return json({ error: "Ya perteneces a otra alianza o la alianza está llena." }, 409);
        await db
          .prepare(
            "UPDATE alliance_invites SET status = 'ACEPTADA', responded_at = ? WHERE invite_id = ? AND status = 'PENDIENTE'",
          )
          .bind(now, inviteId)
          .run();
        return json({ success: true });
      } catch (error) {
        console.error("No se pudo aceptar la invitación de alianza:", error);
        return json({ error: "No se pudo aceptar la invitación." }, 409);
      }
    }

    if (url.pathname === "/api/alliance/reject" && request.method === "POST") {
      const body = await readJson(request);
      const inviteId = body?.["invite_id"];
      if (typeof inviteId !== "string" || inviteId.length > 64) {
        return json({ error: "La invitación indicada no es válida." }, 400);
      }
      const rejected = await db
        .prepare(
          `UPDATE alliance_invites SET status = 'RECHAZADA', responded_at = ?
           WHERE invite_id = ? AND invited_pilot_id = ? AND status = 'PENDIENTE'`,
        )
        .bind(now, inviteId, pilotId)
        .run();
      if (rejected.meta?.changes !== 1)
        return json({ error: "La invitación ya no está disponible." }, 404);
      return json({ success: true });
    }

    if (url.pathname === "/api/alliance/leave" && request.method === "POST") {
      const membership = await db
        .prepare("SELECT role FROM alliance_members WHERE pilot_id = ?")
        .bind(pilotId)
        .first<{ role: string }>();
      if (!membership) return json({ error: "No perteneces a una alianza." }, 404);
      if (membership.role === "lider") {
        return json({ error: "El líder debe transferir el liderazgo o disolver la alianza." }, 409);
      }
      await db.prepare("DELETE FROM alliance_members WHERE pilot_id = ?").bind(pilotId).run();
      return json({ success: true });
    }

    if (url.pathname === "/api/alliance/kick" && request.method === "POST") {
      const body = await readJson(request);
      const targetPilotId = body?.["pilot_id"];
      if (!validPilotId(targetPilotId) || targetPilotId === pilotId) {
        return json({ error: "El piloto a expulsar no es válido." }, 400);
      }
      const result = await db
        .prepare(
          `DELETE FROM alliance_members
           WHERE pilot_id = ? AND role != 'lider'
             AND alliance_id = (
               SELECT alliance_id FROM alliance_members
               WHERE pilot_id = ? AND role IN ('lider', 'teniente')
             )
             AND EXISTS (
               SELECT 1 FROM alliance_members actor
               WHERE actor.pilot_id = ? AND actor.role = 'lider'
                 OR (actor.pilot_id = ? AND actor.role = 'teniente'
                   AND alliance_members.role = 'miembro')
             )`,
        )
        .bind(targetPilotId, pilotId, pilotId, pilotId)
        .run();
      if (result.meta?.changes !== 1) {
        return json({ error: "No tienes permiso para expulsar a ese miembro." }, 403);
      }
      return json({ success: true });
    }

    if (url.pathname === "/api/alliance/promote" && request.method === "POST") {
      const body = await readJson(request);
      const targetPilotId = body?.["pilot_id"];
      const role = body?.["role"];
      if (
        !validPilotId(targetPilotId) ||
        (role !== "teniente" && role !== "miembro") ||
        targetPilotId === pilotId
      ) {
        return json({ error: "Indica un miembro y un rol válido." }, 400);
      }
      const updated = await db
        .prepare(
          `UPDATE alliance_members SET role = ?
           WHERE pilot_id = ? AND role != 'lider' AND alliance_id IN (
             SELECT alliance_id FROM alliance_members WHERE pilot_id = ? AND role = 'lider'
           )`,
        )
        .bind(role, targetPilotId, pilotId)
        .run();
      if (updated.meta?.changes !== 1)
        return json({ error: "Solo el líder puede cambiar roles de su alianza." }, 403);
      return json({ success: true });
    }

    if (url.pathname === "/api/alliance/dissolve" && request.method === "POST") {
      const dissolved = await db
        .prepare("DELETE FROM alliances WHERE leader_pilot_id = ?")
        .bind(pilotId)
        .run();
      if (dissolved.meta?.changes !== 1)
        return json({ error: "Solo el líder puede disolver la alianza." }, 403);
      return json({ success: true });
    }

    return json({ error: "Ruta de alianza no encontrada." }, 404);
  }
  if ((isRedeem && request.method !== "POST") || (!isRedeem && request.method !== "GET")) {
    return json({ error: "Método de invitaciones no permitido." }, 405);
  }
  if (isRedeem && !isSameOriginPost(request, url)) {
    return json({ error: "Solicitud no autorizada." }, 403);
  }
  if (isLeaderboard && request.method === "GET" && !env?.DB) {
    return json({ entries: [] }, 200);
  }
  if (!env?.DB) return json({ error: "La base de datos no está disponible en este Worker." }, 503);

  const db = env.DB;
  try {
    await ensureAuthSchema(db);
    await ensureMarketSchema(db);
  } catch (error) {
    console.error("No se pudo preparar el sistema de invitaciones:", error);
    return json({ error: "No se pudo preparar el sistema de invitaciones." }, 503);
  }

  const account = await getAuthenticatedAccount(db, await requestSessionHash(request));
  if (!account) return json({ error: "Inicia sesión con Google para usar las invitaciones." }, 401);

  try {
    if (isMyCode) {
      const pilot = await db
        .prepare("SELECT referral_code, referred_by FROM pilots WHERE pilot_id = ?")
        .bind(account.pilot_id)
        .first<{ referral_code: string; referred_by: string | null }>();
      if (!pilot) return json({ error: "No se encontró el piloto." }, 404);
      return json({ referral_code: pilot.referral_code, has_redeemed: pilot.referred_by !== null });
    }

    if (isMine) {
      const { results = [] } = await db
        .prepare(
          `SELECT COALESCE(NULLIF(profile.display_name, ''), referred.callsign, 'PILOTO') AS callsign,
            referred.boss_obsidian, referred.created_at
          FROM referrals referral
          JOIN pilots referred ON referred.pilot_id = referral.referred_pilot_id
          LEFT JOIN player_profiles profile ON profile.pilot_id = referred.pilot_id
          WHERE referral.referrer_pilot_id = ?
          ORDER BY referred.created_at DESC, referred.pilot_id`,
        )
        .bind(account.pilot_id)
        .all<{ callsign: string; boss_obsidian: number; created_at: number }>();
      return json({ referrals: results });
    }

    if (isLeaderboard) {
      const { results = [] } = await db
        .prepare(
          `SELECT COALESCE(NULLIF(profile.display_name, ''), referrer.callsign, 'PILOTO') AS callsign,
            COUNT(*) AS total_referrals
          FROM referrals referral
          JOIN pilots referrer ON referrer.pilot_id = referral.referrer_pilot_id
          LEFT JOIN player_profiles profile ON profile.pilot_id = referrer.pilot_id
          GROUP BY referral.referrer_pilot_id
          HAVING COUNT(*) > 0
          ORDER BY total_referrals DESC, callsign ASC, referral.referrer_pilot_id ASC
          LIMIT 100`,
        )
        .all<{ callsign: string; total_referrals: number }>();
      return json({ entries: results });
    }

    if (!isSameOriginPost(request, url)) return json({ error: "Solicitud no autorizada." }, 403);
    const body = await readJson(request, 1024);
    const submittedCode = body?.["referral_code"];
    if (typeof submittedCode !== "string" || submittedCode.trim().length > 32) {
      return json({ error: "Ingresa un código de invitación válido." }, 400);
    }
    const referralCode = submittedCode.trim().toUpperCase();
    if (!/^SG-[A-Z0-9]{6}$/.test(referralCode)) {
      return json({ error: "El código debe tener el formato SG-XXXXXX." }, 400);
    }

    const invitee = await db
      .prepare("SELECT referred_by FROM pilots WHERE pilot_id = ?")
      .bind(account.pilot_id)
      .first<{ referred_by: string | null }>();
    if (!invitee) return json({ error: "No se encontró el piloto." }, 404);
    if (invitee.referred_by !== null) {
      return json({ error: "Ya canjeaste un código de invitación." }, 409);
    }
    const referrer = await db
      .prepare("SELECT pilot_id FROM pilots WHERE referral_code = ?")
      .bind(referralCode)
      .first<{ pilot_id: string }>();
    if (!referrer) return json({ error: "El código de invitación no existe." }, 404);
    if (referrer.pilot_id === account.pilot_id) {
      return json({ error: "No puedes canjear tu propio código de invitación." }, 400);
    }

    const now = Date.now();
    const referralId = randomHex(16);
    const results = await db.batch([
      db
        .prepare(
          `UPDATE pilots SET referred_by = ?, updated_at = ?
          WHERE pilot_id = ? AND referred_by IS NULL`,
        )
        .bind(referrer.pilot_id, now, account.pilot_id),
      db
        .prepare(
          `INSERT INTO referrals (referral_id, referrer_pilot_id, referred_pilot_id, redeemed_at)
          SELECT ?, ?, ?, ?
          WHERE EXISTS (
            SELECT 1 FROM pilots WHERE pilot_id = ? AND referred_by = ?
          ) AND NOT EXISTS (
            SELECT 1 FROM referrals WHERE referred_pilot_id = ?
          )`,
        )
        .bind(
          referralId,
          referrer.pilot_id,
          account.pilot_id,
          now,
          account.pilot_id,
          referrer.pilot_id,
          account.pilot_id,
        ),
      db
        .prepare(
          `UPDATE pilots SET obsidian = obsidian + ?, updated_at = ?
          WHERE pilot_id = ? AND EXISTS (
            SELECT 1 FROM referrals WHERE referral_id = ?
          )`,
        )
        .bind(INVITEE_OBS_REWARD, now, account.pilot_id, referralId),
      db
        .prepare(
          `UPDATE pilots SET obsidian = obsidian + ?, updated_at = ?
          WHERE pilot_id = ? AND EXISTS (
            SELECT 1 FROM referrals WHERE referral_id = ?
          )`,
        )
        .bind(REFERRER_OBS_REWARD, now, referrer.pilot_id, referralId),
      db
        .prepare(
          `INSERT INTO player_progress (pilot_id, progress_json, updated_at)
          SELECT ?, json_set(?, '$.credits', ?), ?
          WHERE EXISTS (SELECT 1 FROM referrals WHERE referral_id = ?)
          ON CONFLICT(pilot_id) DO UPDATE SET
            progress_json = json_set(
              CASE WHEN json_valid(player_progress.progress_json)
                THEN player_progress.progress_json ELSE ? END,
              '$.credits',
              COALESCE(CAST(json_extract(
                CASE WHEN json_valid(player_progress.progress_json)
                  THEN player_progress.progress_json ELSE ? END,
                '$.credits'
              ) AS INTEGER), 0) + ?
            ),
            updated_at = excluded.updated_at`,
        )
        .bind(
          account.pilot_id,
          DEFAULT_REFERRAL_PROGRESS,
          INVITEE_CR_REWARD,
          now,
          referralId,
          DEFAULT_REFERRAL_PROGRESS,
          DEFAULT_REFERRAL_PROGRESS,
          INVITEE_CR_REWARD,
        ),
      db
        .prepare(
          `INSERT INTO pilot_inventory
            (id, pilot_id, item_id, item_name, item_type, quantity, is_locked,
              grant_source, created_at, updated_at)
          SELECT ?, ?, ?, 'IMÁN', 'objeto', ?, 0, 'starter', ?, ?
          WHERE EXISTS (SELECT 1 FROM referrals WHERE referral_id = ?)
          ON CONFLICT(pilot_id, item_id) DO UPDATE SET
            quantity = pilot_inventory.quantity + excluded.quantity,
            grant_source = 'starter', updated_at = excluded.updated_at`,
        )
        .bind(
          `inv_${referralId}_${INVITEE_ITEM}`,
          account.pilot_id,
          INVITEE_ITEM,
          INVITEE_ITEM_QTY,
          now,
          now,
          referralId,
        ),
    ]);

    if (results[1]?.meta?.changes !== 1) {
      return json({ error: "Ya canjeaste un código de invitación." }, 409);
    }
    return json({
      success: true,
      rewards: {
        invitee_obs: INVITEE_OBS_REWARD,
        invitee_cr: INVITEE_CR_REWARD,
        invitee_item: INVITEE_ITEM,
        referrer_obs: REFERRER_OBS_REWARD,
      },
    });
  } catch (error) {
    console.error("No se pudo procesar la invitación:", error);
    return json({ error: "No se pudo completar el canje. Inténtalo de nuevo." }, 503);
  }
}

type LeaderboardEntry = {
  pilot_id: string;
  callsign: string;
  boss_obsidian: number;
  score: number;
};

async function handleLeaderboardRequest(
  request: Request,
  env: WorkerEnv | undefined,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== "/api/leaderboard" && url.pathname !== "/api/leaderboard/update") {
    return null;
  }
  if (url.pathname === "/api/leaderboard" && request.method === "GET") {
    if (!env?.LEADERBOARD) return json({ entries: [] }, 200);
    try {
      const entries = await readLeaderboard(env.LEADERBOARD);
      return json({ entries });
    } catch (error) {
      console.error("No se pudo leer la clasificación:", error);
      return json({ entries: [] }, 200);
    }
  }
  if (!env?.LEADERBOARD) {
    return json({ error: "La clasificación no está disponible en este Worker." }, 503);
  }
  if (url.pathname !== "/api/leaderboard/update" || request.method !== "POST") {
    return json({ error: "Método de clasificación no permitido." }, 405);
  }
  if (!isSameOriginPost(request, url)) return json({ error: "Solicitud no autorizada." }, 403);
  if (!env.DB) return json({ error: "La base de datos no está disponible en este Worker." }, 503);

  const db = env.DB;
  try {
    await ensureAuthSchema(db);
    await ensureMarketSchema(db);
  } catch (error) {
    console.error("No se pudo preparar la base de datos de la clasificación:", error);
    return json({ error: "No se pudo preparar la clasificación." }, 503);
  }

  const account = await getAuthenticatedAccount(db, await requestSessionHash(request));
  if (!account) {
    return json({ error: "Inicia sesión con Google para actualizar la clasificación." }, 401);
  }

  const body = await readJson(request, 4096);
  if (
    !body ||
    body["pilot_id"] !== account.pilot_id ||
    typeof body["callsign"] !== "string" ||
    body["callsign"].trim().length < 1 ||
    body["callsign"].length > 32 ||
    typeof body["score"] !== "number" ||
    !Number.isSafeInteger(body["score"]) ||
    body["score"] < 0
  ) {
    return json({ error: "Los datos de la clasificación no son válidos." }, 400);
  }

  try {
    const [pilot, profile, progress] = await Promise.all([
      db
        .prepare("SELECT boss_obsidian, callsign FROM pilots WHERE pilot_id = ?")
        .bind(account.pilot_id)
        .first<{ boss_obsidian: number; callsign: string }>(),
      db
        .prepare("SELECT display_name FROM player_profiles WHERE pilot_id = ?")
        .bind(account.pilot_id)
        .first<{ display_name: string }>(),
      db
        .prepare("SELECT progress_json FROM player_progress WHERE pilot_id = ?")
        .bind(account.pilot_id)
        .first<{ progress_json: string }>(),
    ]);

    let score: number;
    try {
      score = scoreFromProgress(progress?.progress_json);
    } catch {
      return json({ error: "El progreso guardado no contiene una puntuación válida." }, 409);
    }
    if (body["score"] !== score) {
      return json({ error: "La puntuación debe coincidir con el progreso guardado." }, 409);
    }

    const callsign = profile?.display_name.trim() || pilot?.callsign.trim() || "PILOTO";
    const bossObsidian = pilot?.boss_obsidian;
    await upsertLeaderboardEntry(env.LEADERBOARD, {
      pilot_id: account.pilot_id,
      callsign,
      boss_obsidian:
        typeof bossObsidian === "number" && Number.isSafeInteger(bossObsidian) && bossObsidian >= 0
          ? bossObsidian
          : 0,
      score,
    });
    return json({ success: true });
  } catch (error) {
    console.error("No se pudo actualizar la clasificación:", error);
    return json({ error: "No se pudo actualizar la clasificación." }, 503);
  }
}

function scoreFromProgress(progressJson?: string): number {
  if (!progressJson) return 0;
  const savedProgress: unknown = JSON.parse(progressJson);
  if (
    !savedProgress ||
    typeof savedProgress !== "object" ||
    !("stats" in savedProgress) ||
    !savedProgress.stats ||
    typeof savedProgress.stats !== "object" ||
    !("kills" in savedProgress.stats) ||
    typeof savedProgress.stats.kills !== "number" ||
    !Number.isSafeInteger(savedProgress.stats.kills) ||
    savedProgress.stats.kills < 0
  ) {
    throw new Error("El progreso guardado no contiene una puntuación válida.");
  }
  return savedProgress.stats.kills;
}

async function readLeaderboard(kv: KVNamespace): Promise<LeaderboardEntry[]> {
  const stored = await kv.get(LEADERBOARD_KEY);
  if (stored === null) return [];
  const parsed: unknown = JSON.parse(stored);
  if (!Array.isArray(parsed)) {
    throw new Error("El formato guardado de la clasificación no es válido.");
  }
  return parsed
    .filter(
      (entry): entry is LeaderboardEntry =>
        Boolean(entry) &&
        typeof entry === "object" &&
        typeof entry.pilot_id === "string" &&
        typeof entry.callsign === "string" &&
        typeof entry.boss_obsidian === "number" &&
        Number.isSafeInteger(entry.boss_obsidian) &&
        entry.boss_obsidian > 0 &&
        typeof entry.score === "number" &&
        Number.isSafeInteger(entry.score) &&
        entry.score >= 0,
    )
    .sort(
      (a, b) =>
        b.boss_obsidian - a.boss_obsidian ||
        a.callsign.localeCompare(b.callsign) ||
        a.pilot_id.localeCompare(b.pilot_id),
    )
    .slice(0, 100);
}

async function upsertLeaderboardEntry(kv: KVNamespace, entry: LeaderboardEntry): Promise<void> {
  const entries = await readLeaderboard(kv);
  const updated = [...entries.filter((candidate) => candidate.pilot_id !== entry.pilot_id), entry]
    .sort(
      (a, b) =>
        b.boss_obsidian - a.boss_obsidian ||
        a.callsign.localeCompare(b.callsign) ||
        a.pilot_id.localeCompare(b.pilot_id),
    )
    .filter((candidate) => candidate.boss_obsidian > 0)
    .slice(0, 100);
  await kv.put(LEADERBOARD_KEY, JSON.stringify(updated));
}

async function verifyTurnstileToken(
  token: string,
  secretKey: string,
  expectedHostname: string,
): Promise<boolean> {
  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ secret: secretKey, response: token }),
  });
  if (!response.ok) {
    throw new Error(`Turnstile respondió HTTP ${response.status}.`);
  }
  const result = (await response.json()) as {
    success?: boolean;
    hostname?: string;
    action?: string;
  };
  return (
    result.success === true && result.hostname === expectedHostname && result.action === "login"
  );
}

async function handleAuthRequest(
  request: Request,
  env: WorkerEnv | undefined,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/auth/")) return null;
  if (url.pathname === "/api/auth/session" && request.method === "GET" && !env?.DB) {
    return json({ authenticated: false }, 200);
  }
  if (!env?.DB) return json({ error: "La base de datos no está disponible en este Worker." }, 503);

  const db = env.DB;
  try {
    await ensureAuthSchema(db);
  } catch (error) {
    console.error("No se pudo preparar el esquema de autenticación:", error);
    return json({ error: "No se pudo preparar la autenticación. Inténtalo de nuevo." }, 503);
  }

  if (
    (url.pathname === "/api/auth/google/start" || url.pathname === "/api/auth/verify-turnstile") &&
    request.method === "POST"
  ) {
    if (!isSameOriginPost(request, url)) return json({ error: "Solicitud no autorizada." }, 403);
    if (!env.TURNSTILE_SECRET_KEY) {
      return json({ error: "Falta configurar Turnstile en el Worker." }, 503);
    }
    const body = await readJson(request, 2048);
    const token = body?.["token"];
    if (typeof token !== "string" || token.length < 1 || token.length > 2048) {
      return json({ error: "Completa la verificación de seguridad." }, 400);
    }
    try {
      if (!(await verifyTurnstileToken(token, env.TURNSTILE_SECRET_KEY, url.hostname))) {
        return json({ error: "La verificación de seguridad falló. Inténtalo de nuevo." }, 403);
      }
    } catch (error) {
      console.error("No se pudo verificar el token de Turnstile:", error);
      return json({ error: "No se pudo verificar la seguridad. Inténtalo de nuevo." }, 503);
    }
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.GOOGLE_REDIRECT_URI) {
      return json({ error: "Faltan las credenciales de Google en el Worker." }, 503);
    }
    const now = Date.now();
    const state = randomHex(32);
    const nonce = randomHex(32);
    const codeVerifier = randomHex(32);
    const challengeDigest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(codeVerifier),
    );
    const codeChallenge = btoa(
      Array.from(new Uint8Array(challengeDigest), (byte) => String.fromCharCode(byte)).join(""),
    )
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");
    await db
      .prepare(
        `INSERT INTO google_oauth_states
      (state_hash, nonce, code_verifier, expires_at, consumed_at)
      VALUES (?, ?, ?, ?, NULL)`,
      )
      .bind(await sha256Hex(state), nonce, codeVerifier, now + GOOGLE_STATE_TTL_MS)
      .run();
    const authorizationUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authorizationUrl.search = new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      redirect_uri: env.GOOGLE_REDIRECT_URI,
      response_type: "code",
      scope: "openid email profile",
      state,
      nonce,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
    }).toString();
    return json({ authorizationUrl: authorizationUrl.toString() }, 200, {
      "set-cookie": googleStateCookie(state, Math.floor(GOOGLE_STATE_TTL_MS / 1000)),
    });
  }

  if (url.pathname === "/api/auth/google/callback" && request.method === "GET") {
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.GOOGLE_REDIRECT_URI) {
      return json({ error: "Falta configurar las credenciales de Google en el Worker." }, 503);
    }
    const oauthError = url.searchParams.get("error");
    if (oauthError) return googleRedirect(`${url.origin}/?google_error=cancelled`);
    const state = url.searchParams.get("state");
    const code = url.searchParams.get("code");
    if (!state || state.length > 128 || !code || code.length > 4096) {
      return googleRedirect(`${url.origin}/?google_error=invalid_response`);
    }
    if (readCookie(request, OAUTH_STATE_COOKIE) !== state) {
      return googleRedirect(`${url.origin}/?google_error=invalid_response`);
    }
    const oauthState = await db
      .prepare(
        `SELECT nonce, code_verifier, expires_at
      FROM google_oauth_states WHERE state_hash = ? AND consumed_at IS NULL`,
      )
      .bind(await sha256Hex(state))
      .first<{ nonce: string; code_verifier: string; expires_at: number }>();
    const now = Date.now();
    if (!oauthState || oauthState.expires_at <= now) {
      return googleRedirect(`${url.origin}/?google_error=expired`);
    }
    const consumed = await db
      .prepare(
        `UPDATE google_oauth_states SET consumed_at = ?
      WHERE state_hash = ? AND consumed_at IS NULL AND expires_at > ?`,
      )
      .bind(now, await sha256Hex(state), now)
      .run();
    if ((consumed.meta?.changes ?? 0) !== 1) {
      return googleRedirect(`${url.origin}/?google_error=expired`);
    }

    let tokenPayload: { id_token?: string };
    try {
      const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: env.GOOGLE_CLIENT_ID,
          client_secret: env.GOOGLE_CLIENT_SECRET,
          redirect_uri: env.GOOGLE_REDIRECT_URI,
          grant_type: "authorization_code",
          code_verifier: oauthState.code_verifier,
        }),
      });
      if (!tokenResponse.ok) {
        console.error("Google rechazó el intercambio OAuth:", tokenResponse.status);
        return googleRedirect(`${url.origin}/?google_error=verification_failed`);
      }
      tokenPayload = (await tokenResponse.json()) as { id_token?: string };
    } catch (error) {
      console.error("No se pudo completar el intercambio OAuth con Google:", error);
      return googleRedirect(`${url.origin}/?google_error=verification_failed`);
    }
    if (typeof tokenPayload.id_token !== "string") {
      return googleRedirect(`${url.origin}/?google_error=verification_failed`);
    }
    const identity = await verifyGoogleIdToken(
      tokenPayload.id_token,
      env.GOOGLE_CLIENT_ID,
      oauthState.nonce,
    );
    if (!identity) {
      return googleRedirect(`${url.origin}/?google_error=verification_failed`);
    }
    const email = identity.email.trim().toLowerCase();
    let account = await db
      .prepare(`SELECT google_sub, email, pilot_id FROM player_accounts WHERE google_sub = ?`)
      .bind(identity.sub)
      .first<PlayerAccount>();
    if (!account) {
      const existingEmail = await db
        .prepare(`SELECT google_sub, email, pilot_id FROM player_accounts WHERE email = ?`)
        .bind(email)
        .first<PlayerAccount>();
      if (existingEmail) {
        return googleRedirect(`${url.origin}/?google_error=account_conflict`);
      }
      try {
        await ensureMarketSchema(db);
        let pilotId = readCookie(request, PILOT_COOKIE);
        if (!validPilotId(pilotId)) pilotId = `plt_${randomHex(12)}`;
        const claimedPilot = await db
          .prepare(`SELECT google_sub FROM player_accounts WHERE pilot_id = ?`)
          .bind(pilotId)
          .first<{ google_sub: string }>();
        if (claimedPilot) pilotId = `plt_${randomHex(12)}`;
        const createdAt = Date.now();
        const results = await db.batch([
          db
            .prepare(
              `INSERT OR IGNORE INTO pilots
            (pilot_id, callsign, obsidian, welcome_claimed, created_at, updated_at)
            VALUES (?, 'PILOTO', 5, 1, ?, ?)`,
            )
            .bind(pilotId, createdAt, createdAt),
          db
            .prepare(
              `INSERT INTO player_accounts
            (google_sub, email, pilot_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
            )
            .bind(identity.sub, email, pilotId, createdAt, createdAt),
        ]);
        if (results[1]?.meta?.changes !== 1) {
          throw new Error("No se pudo crear una cuenta de jugador única.");
        }
        account = {
          google_sub: identity.sub,
          email,
          pilot_id: pilotId,
        };
      } catch (error) {
        console.error("No se pudo crear la cuenta de jugador de Google:", error);
        account = await db
          .prepare(`SELECT google_sub, email, pilot_id FROM player_accounts WHERE google_sub = ?`)
          .bind(identity.sub)
          .first<PlayerAccount>();
        if (!account) {
          return googleRedirect(`${url.origin}/?google_error=account_conflict`);
        }
      }
    } else if (account.email !== email) {
      try {
        await db
          .prepare(`UPDATE player_accounts SET email = ?, updated_at = ? WHERE google_sub = ?`)
          .bind(email, Date.now(), identity.sub)
          .run();
        account.email = email;
      } catch (error) {
        console.error("No se pudo actualizar el correo de la cuenta de Google:", error);
        return googleRedirect(`${url.origin}/?google_error=account_conflict`);
      }
    }

    try {
      await ensureMarketSchema(db);
      await ensurePilotReferralCode(db, account.pilot_id);
    } catch (error) {
      console.error("No se pudo asignar el código de invitación del piloto:", error);
      return googleRedirect(`${url.origin}/?google_error=account_conflict`);
    }

    const token = randomHex(32);
    const tokenHash = await sha256Hex(token);
    const expiresAt = Date.now() + SESSION_TTL_MS;
    await db
      .prepare(
        `INSERT INTO auth_sessions
      (token_hash, wallet_address, created_at, expires_at) VALUES (?, ?, ?, ?)`,
      )
      .bind(tokenHash, `google:${identity.sub}`, Date.now(), expiresAt)
      .run();
    const headers = new Headers({
      location: url.origin,
      "cache-control": "no-store",
      "referrer-policy": "no-referrer",
    });
    headers.append("set-cookie", sessionCookie(token, Math.floor(SESSION_TTL_MS / 1000)));
    headers.append("set-cookie", googleStateCookie("", 0));
    headers.append(
      "set-cookie",
      `${PILOT_COOKIE}=${account.pilot_id}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
    );
    return new Response(null, { status: 302, headers });
  }

  if (url.pathname === "/api/auth/session" && request.method === "GET") {
    const token = readCookie(request, SESSION_COOKIE);
    if (!token) return json({ authenticated: false }, 200);
    const tokenHash = await sha256Hex(token);
    const account = await getAuthenticatedAccount(db, tokenHash);
    if (!account) {
      return json({ authenticated: false }, 200, {
        "set-cookie": sessionCookie("", 0),
      });
    }
    const savedProgress = await db
      .prepare(`SELECT progress_json FROM player_progress WHERE pilot_id = ?`)
      .bind(account.pilot_id)
      .first<{ progress_json: string }>();
    const savedProfile = await db
      .prepare(`SELECT display_name FROM player_profiles WHERE pilot_id = ?`)
      .bind(account.pilot_id)
      .first<{ display_name: string }>();
    await ensureMarketSchema(db);
    await ensurePilot(db, account.pilot_id);
    const progress = await canonicalizeProgress(db, account.pilot_id, savedProgress?.progress_json);
    const ownedShips = await getOwnedShips(db, account.pilot_id);
    return json({
      authenticated: true,
      email: account.email,
      playerId: account.pilot_id,
      displayName: savedProfile?.display_name ?? "",
      isAdmin: account.email === ADMIN_EMAIL,
      progress,
      ownedShips,
    });
  }

  if (url.pathname === "/api/auth/profile" && request.method === "GET") {
    const account = await getAuthenticatedAccount(db, await requestSessionHash(request));
    if (!account) return json({ error: "Inicia sesión con Google para consultar tu perfil." }, 401);
    const profile = await db
      .prepare(`SELECT display_name FROM player_profiles WHERE pilot_id = ?`)
      .bind(account.pilot_id)
      .first<{ display_name: string }>();
    return json({ displayName: profile?.display_name ?? "" });
  }

  if (url.pathname === "/api/auth/profile" && request.method === "POST") {
    if (!isSameOriginPost(request, url)) return json({ error: "Solicitud no autorizada." }, 403);
    const account = await getAuthenticatedAccount(db, await requestSessionHash(request));
    if (!account) return json({ error: "Inicia sesión con Google para guardar tu perfil." }, 401);
    const body = await readJson(request, 2048);
    const displayName = typeof body?.["displayName"] === "string" ? body["displayName"].trim() : "";
    if (!/^[\p{L}\p{N}_-]{3,20}$/u.test(displayName)) {
      return json(
        {
          error:
            "El nombre debe tener entre 3 y 20 caracteres: letras, números, guion o guion bajo.",
        },
        400,
      );
    }
    const duplicate = await db
      .prepare(
        `SELECT pilot_id FROM player_profiles WHERE lower(display_name) = lower(?) AND pilot_id <> ?`,
      )
      .bind(displayName, account.pilot_id)
      .first<{ pilot_id: string }>();
    if (duplicate) return json({ error: "Ese nombre de usuario ya está en uso." }, 409);
    await db
      .prepare(
        `INSERT INTO player_profiles (pilot_id, display_name, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(pilot_id) DO UPDATE SET
          display_name = excluded.display_name, updated_at = excluded.updated_at`,
      )
      .bind(account.pilot_id, displayName, Date.now())
      .run();
    return json({ success: true, displayName });
  }

  if (url.pathname === "/api/auth/progress" && request.method === "GET") {
    const account = await getAuthenticatedAccount(db, await requestSessionHash(request));
    if (!account)
      return json({ error: "Inicia sesión con Google para recuperar el progreso." }, 401);
    await ensureMarketSchema(db);
    await ensurePilot(db, account.pilot_id);
    const savedProgress = await db
      .prepare(`SELECT progress_json FROM player_progress WHERE pilot_id = ?`)
      .bind(account.pilot_id)
      .first<{ progress_json: string }>();
    return json({
      progress: await canonicalizeProgress(db, account.pilot_id, savedProgress?.progress_json),
    });
  }

  if (url.pathname === "/api/auth/progress" && request.method === "POST") {
    if (!isSameOriginPost(request, url)) return json({ error: "Solicitud no autorizada." }, 403);
    const account = await getAuthenticatedAccount(db, await requestSessionHash(request));
    if (!account) return json({ error: "Inicia sesión con Google para guardar el progreso." }, 401);
    const body = await readJson(request, 65536);
    if (
      !body ||
      !body["progress"] ||
      typeof body["progress"] !== "object" ||
      Array.isArray(body["progress"])
    ) {
      return json({ error: "Los datos del progreso no son válidos." }, 400);
    }
    await ensureMarketSchema(db);
    await ensurePilot(db, account.pilot_id);
    const progress = await canonicalizeProgress(db, account.pilot_id, body["progress"]);
    if (!progress) return json({ error: "Los datos del progreso no son válidos." }, 400);
    const selectedShip = progress["selectedShip"];
    const selection = await db
      .prepare(
        `UPDATE pilots SET selected_ship_id = ?, updated_at = ?
        WHERE pilot_id = ? AND EXISTS (
          SELECT 1 FROM pilot_inventory
          WHERE pilot_id = ? AND item_id = ? AND item_type = 'nave'
            AND quantity > 0 AND is_locked = 0
        )`,
      )
      .bind(selectedShip, Date.now(), account.pilot_id, account.pilot_id, selectedShip)
      .run();
    if (selection.meta?.changes !== 1) {
      return json({ error: "No puedes seleccionar una nave que no posees." }, 409);
    }
    await db
      .prepare(
        `INSERT INTO player_progress (pilot_id, progress_json, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(pilot_id) DO UPDATE SET
        progress_json = excluded.progress_json, updated_at = excluded.updated_at`,
      )
      .bind(account.pilot_id, JSON.stringify(progress), Date.now())
      .run();
    return json({ success: true, progress });
  }

  if (url.pathname === "/api/auth/logout" && request.method === "POST") {
    if (!isSameOriginPost(request, url)) return json({ error: "Solicitud no autorizada." }, 403);
    const token = readCookie(request, SESSION_COOKIE);
    if (token) {
      await db
        .prepare("DELETE FROM auth_sessions WHERE token_hash = ?")
        .bind(await sha256Hex(token))
        .run();
    }
    const headers = new Headers();
    headers.append("set-cookie", sessionCookie("", 0));
    headers.append(
      "set-cookie",
      `${PILOT_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`,
    );
    return json({ authenticated: false }, 200, headers);
  }

  return json({ error: "Ruta de autenticación no encontrada." }, 404);
}

type PlayerAccount = { google_sub: string; email: string; pilot_id: string };

async function requestSessionHash(request: Request): Promise<string> {
  const token = readCookie(request, SESSION_COOKIE);
  return token ? sha256Hex(token) : "";
}

async function getAuthenticatedAccount(
  db: D1Database,
  tokenHash: string,
): Promise<PlayerAccount | null> {
  if (!tokenHash) return null;
  const session = await db
    .prepare(
      `SELECT wallet_address, expires_at FROM auth_sessions
    WHERE token_hash = ? AND expires_at > ?`,
    )
    .bind(tokenHash, Date.now())
    .first<{ wallet_address: string; expires_at: number }>();
  if (!session || !session.wallet_address.startsWith("google:")) return null;
  return db
    .prepare(`SELECT google_sub, email, pilot_id FROM player_accounts WHERE google_sub = ?`)
    .bind(session.wallet_address.slice("google:".length))
    .first<PlayerAccount>();
}

async function hasValidAdminSession(
  db: D1Database,
  request: Request,
  googleSub: string,
): Promise<boolean> {
  const token = readCookie(request, ADMIN_SESSION_COOKIE);
  if (!token) return false;
  const session = await db.prepare(
    "SELECT token_hash FROM admin_sessions WHERE token_hash = ? AND google_sub = ? AND expires_at > ?",
  ).bind(await sha256Hex(token), googleSub, Date.now()).first<{ token_hash: string }>();
  return Boolean(session);
}

function adminSessionCookie(token: string, maxAge: number): string {
  return ADMIN_SESSION_COOKIE + "=" + token + "; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=" + maxAge;
}

async function handleAdminAuthRequest(request: Request, env: WorkerEnv | undefined): Promise<Response | null> {
  const url = new URL(request.url);
  if (!["/api/admin/auth/login", "/api/admin/auth/status", "/api/admin/auth/logout"].includes(url.pathname)) return null;
  if (!env?.DB) return json({ error: "La base de datos no está disponible." }, 503);
  const db = env.DB;
  try { await ensureAuthSchema(db); }
  catch (error) { console.error("No se pudo preparar la autenticación administrativa:", error); return json({ error: "No se pudo preparar el acceso administrativo." }, 503); }
  const account = await getAuthenticatedAccount(db, await requestSessionHash(request));
  if (!account || account.email.toLowerCase() !== ADMIN_EMAIL) return json({ error: "Acceso administrativo no autorizado." }, 403);
  if (url.pathname === "/api/admin/auth/status") {
    if (request.method !== "GET") return json({ error: "Método no permitido." }, 405);
    return json({ authenticated: await hasValidAdminSession(db, request, account.google_sub) });
  }
  if (request.method !== "POST") return json({ error: "Método no permitido." }, 405);
  if (!isSameOriginPost(request, url)) return json({ error: "Solicitud no autorizada." }, 403);
  if (url.pathname === "/api/admin/auth/logout") {
    const token = readCookie(request, ADMIN_SESSION_COOKIE);
    if (token) await db.prepare("DELETE FROM admin_sessions WHERE token_hash = ?").bind(await sha256Hex(token)).run();
    return json({ authenticated: false }, 200, { "set-cookie": ADMIN_SESSION_COOKIE + "=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0" });
  }
  if (!env.ADMIN_PANEL_PASSWORD || env.ADMIN_PANEL_PASSWORD.length < 16) return json({ error: "El acceso administrativo aún no está configurado." }, 503);
  const ipHash = await sha256Hex(request.headers.get("cf-connecting-ip") ?? "unknown");
  const now = Date.now();
  const attempts = await db.prepare("SELECT attempts, window_started_at, blocked_until FROM admin_login_attempts WHERE ip_hash = ?")
    .bind(ipHash).first<{ attempts: number; window_started_at: number; blocked_until: number }>();
  if (attempts?.blocked_until && attempts.blocked_until > now) return json({ error: "Demasiados intentos. Inténtalo más tarde." }, 429);
  const body = await readJson(request, 2048);
  const suppliedPassword = typeof body?.password === "string" ? body.password : "";
  const expectedHash = await sha256Hex(env.ADMIN_PANEL_PASSWORD);
  const suppliedHash = await sha256Hex(suppliedPassword);
  let difference = 0;
  for (let i = 0; i < expectedHash.length; i += 1) difference |= expectedHash.charCodeAt(i) ^ suppliedHash.charCodeAt(i);
  if (!suppliedPassword || difference !== 0) {
    const inWindow = Boolean(attempts && attempts.window_started_at > now - ADMIN_LOGIN_WINDOW_MS);
    const nextAttempts = inWindow ? attempts!.attempts + 1 : 1;
    const windowStartedAt = inWindow ? attempts!.window_started_at : now;
    const blockedUntil = nextAttempts >= ADMIN_LOGIN_MAX_ATTEMPTS ? now + ADMIN_LOGIN_WINDOW_MS : 0;
    await db.prepare("INSERT INTO admin_login_attempts (ip_hash, attempts, window_started_at, blocked_until) VALUES (?, ?, ?, ?) ON CONFLICT(ip_hash) DO UPDATE SET attempts=excluded.attempts, window_started_at=excluded.window_started_at, blocked_until=excluded.blocked_until")
      .bind(ipHash, nextAttempts, windowStartedAt, blockedUntil).run();
    return json({ error: blockedUntil ? "Demasiados intentos. Acceso bloqueado durante 15 minutos." : "Contraseña incorrecta." }, blockedUntil ? 429 : 401);
  }
  await db.prepare("DELETE FROM admin_login_attempts WHERE ip_hash = ?").bind(ipHash).run();
  const token = randomHex(32);
  const expiresAt = now + ADMIN_SESSION_TTL_MS;
  await db.prepare("INSERT INTO admin_sessions (token_hash, google_sub, created_at, expires_at) VALUES (?, ?, ?, ?)")
    .bind(await sha256Hex(token), account.google_sub, now, expiresAt).run();
  return json({ authenticated: true, expiresAt }, 200, { "set-cookie": adminSessionCookie(token, Math.floor(ADMIN_SESSION_TTL_MS / 1000)) });
}
type MarketInventoryRow = {
  id: string;
  item_id: string;
  item_name: string;
  item_type: "nave" | "objeto";
  quantity: number;
  is_locked: number;
  grant_source: "starter" | "boss" | "market" | "legacy";
};

type MarketAdRow = {
  id: string;
  seller_pilot_id: string;
  inventory_id: string;
  item_id: string;
  item_name: string;
  item_type: "nave" | "objeto";
  price: number;
  currency: "COP" | "USD";
  price_minor: number | null;
  currency_code: P2PCurrency | null;
  country_code: P2PCountry;
  payment_methods: string;
  payment_details: string;
  payment_data_json: string | null;
  status: "ACTIVO" | "PAUSADO" | "CANCELADO" | "VENDIDO";
  fee_paid: number;
  created_at: number;
  updated_at: number;
};

const VALID_PILOT_ID = /^plt_[0-9a-f]{24}$/;
const LEGACY_PAYMENT_METHODS = new Set(["NEQUI", "DAVIPLATA", "TRANSFERENCIA", "PAYPAL"]);
const VALID_PAYMENT_METHODS = new Set([
  "PSE",
  "NEQUI",
  "DAVIPLATA",
  "BANCOLOMBIA_TRANSFER",
  "PAGO_MOVIL",
  "BANK_TRANSFER",
  "YAPE",
  "PIX",
  "BINANCE_PAY",
  "USDT",
]);
const VALID_SHIP_IDS = new Set(SHIPS.map((ship) => ship.id));

async function ensureMarketSchema(db: D1Database): Promise<void> {
  if (!marketSchemaPromise) {
    marketSchemaPromise = (async () => {
      const schema = [
        `CREATE TABLE IF NOT EXISTS pilots (
          pilot_id TEXT PRIMARY KEY,
          callsign TEXT NOT NULL DEFAULT 'PILOTO',
          obsidian INTEGER NOT NULL DEFAULT 5 CHECK (obsidian >= 0),
          boss_obsidian INTEGER NOT NULL DEFAULT 0 CHECK (boss_obsidian >= 0),
          referral_code TEXT,
          referred_by TEXT REFERENCES pilots(pilot_id),
          welcome_claimed INTEGER NOT NULL DEFAULT 1,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          selected_ship_id TEXT NOT NULL DEFAULT 'falcon'
        )`,
        `CREATE TABLE IF NOT EXISTS referrals (
          referral_id TEXT PRIMARY KEY,
          referrer_pilot_id TEXT NOT NULL REFERENCES pilots(pilot_id),
          referred_pilot_id TEXT NOT NULL REFERENCES pilots(pilot_id),
          redeemed_at INTEGER NOT NULL,
          UNIQUE(referred_pilot_id)
        )`,
        `CREATE TABLE IF NOT EXISTS pilot_inventory (
          id TEXT PRIMARY KEY,
          pilot_id TEXT NOT NULL REFERENCES pilots(pilot_id),
          item_id TEXT NOT NULL,
          item_name TEXT NOT NULL,
          item_type TEXT NOT NULL CHECK (item_type IN ('nave', 'objeto')),
          quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity >= 0),
          is_locked INTEGER NOT NULL DEFAULT 0 CHECK (is_locked IN (0, 1)),
          grant_source TEXT NOT NULL DEFAULT 'legacy'
            CHECK (grant_source IN ('starter', 'boss', 'market', 'legacy')),
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        )`,
        `CREATE TABLE IF NOT EXISTS p2p_ads (
          id TEXT PRIMARY KEY,
          seller_pilot_id TEXT NOT NULL REFERENCES pilots(pilot_id),
          inventory_id TEXT NOT NULL REFERENCES pilot_inventory(id),
          item_id TEXT NOT NULL,
          item_name TEXT NOT NULL,
          item_type TEXT NOT NULL CHECK (item_type IN ('nave', 'objeto')),
          price INTEGER NOT NULL CHECK (price > 0),
          price_minor INTEGER,
          currency TEXT NOT NULL CHECK (currency IN ('COP', 'USD')),
          currency_code TEXT,
          country_code TEXT NOT NULL DEFAULT 'CO',
          payment_methods TEXT NOT NULL,
          payment_details TEXT NOT NULL,
          payment_data_json TEXT,
          status TEXT NOT NULL CHECK (status IN ('ACTIVO', 'PAUSADO', 'CANCELADO', 'VENDIDO')),
          fee_paid INTEGER NOT NULL DEFAULT 1,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        )`,
        `CREATE TABLE IF NOT EXISTS admin_obsidian_logs (
          id TEXT PRIMARY KEY,
          pilot_id TEXT NOT NULL REFERENCES pilots(pilot_id),
          amount INTEGER NOT NULL,
          reason TEXT NOT NULL,
          created_at INTEGER NOT NULL
        )`,
        `CREATE TABLE IF NOT EXISTS boss_cooldowns (
          pilot_id TEXT NOT NULL REFERENCES pilots(pilot_id),
          boss_id TEXT NOT NULL,
          last_defeated_at INTEGER NOT NULL,
          last_reward_id TEXT NOT NULL,
          PRIMARY KEY (pilot_id, boss_id)
        )`,
        `CREATE TABLE IF NOT EXISTS boss_attempts (
          token_hash TEXT PRIMARY KEY,
          pilot_id TEXT NOT NULL REFERENCES pilots(pilot_id),
          boss_id TEXT NOT NULL,
          issued_at INTEGER NOT NULL,
          expires_at INTEGER NOT NULL,
          claimed_at INTEGER,
          claim_id TEXT,
          challenge_seed TEXT NOT NULL DEFAULT '',
          boss_hp INTEGER NOT NULL DEFAULT 0,
          boss_damage REAL NOT NULL DEFAULT 0,
          min_combat_ms INTEGER NOT NULL DEFAULT 0,
          max_hit_damage REAL NOT NULL DEFAULT 0
        )`,
        `CREATE TABLE IF NOT EXISTS p2p_orders (
          id TEXT PRIMARY KEY,
          ad_id TEXT NOT NULL REFERENCES p2p_ads(id),
          buyer_pilot_id TEXT NOT NULL REFERENCES pilots(pilot_id),
          status TEXT NOT NULL DEFAULT 'ABIERTA',
          payment_method TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        )`,
        `CREATE TABLE IF NOT EXISTS market_publish_attempts (
          id TEXT PRIMARY KEY,
          pilot_id TEXT NOT NULL,
          inventory_id TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          obsidian_updated INTEGER NOT NULL DEFAULT 0,
          inventory_updated INTEGER NOT NULL DEFAULT 0
        )`,
        `CREATE UNIQUE INDEX IF NOT EXISTS idx_pilot_inventory_unique_item
          ON pilot_inventory(pilot_id, item_id)`,
        `CREATE INDEX IF NOT EXISTS idx_pilot_inventory_available
          ON pilot_inventory(pilot_id, is_locked, quantity)`,
        `CREATE INDEX IF NOT EXISTS idx_p2p_ads_seller_status
          ON p2p_ads(seller_pilot_id, status, created_at)`,
        `CREATE UNIQUE INDEX IF NOT EXISTS idx_p2p_ads_one_open_per_inventory
          ON p2p_ads(inventory_id) WHERE status IN ('ACTIVO', 'PAUSADO')`,
        `CREATE INDEX IF NOT EXISTS idx_p2p_orders_ad_status
          ON p2p_orders(ad_id, status)`,
        `CREATE UNIQUE INDEX IF NOT EXISTS idx_p2p_orders_one_pending_per_ad
          ON p2p_orders(ad_id) WHERE status = 'PENDIENTE'`,
        `CREATE UNIQUE INDEX IF NOT EXISTS idx_boss_attempts_active
          ON boss_attempts(pilot_id, boss_id) WHERE claimed_at IS NULL`,
        `CREATE TRIGGER IF NOT EXISTS market_publish_pilot_guard
          AFTER UPDATE OF obsidian ON pilots
          WHEN NEW.obsidian = OLD.obsidian - 1
          BEGIN
            UPDATE market_publish_attempts SET obsidian_updated = 1
            WHERE pilot_id = NEW.pilot_id AND created_at = NEW.updated_at;
          END`,
        `CREATE TRIGGER IF NOT EXISTS market_publish_inventory_guard
          AFTER UPDATE OF is_locked ON pilot_inventory
          WHEN OLD.is_locked = 0 AND NEW.is_locked = 1
          BEGIN
            UPDATE market_publish_attempts SET inventory_updated = 1
            WHERE pilot_id = NEW.pilot_id AND inventory_id = NEW.id
              AND created_at = NEW.updated_at;
          END`,
        `CREATE TRIGGER IF NOT EXISTS market_publish_require_guards
          BEFORE INSERT ON p2p_ads
          WHEN NOT EXISTS (
            SELECT 1 FROM market_publish_attempts
            WHERE pilot_id = NEW.seller_pilot_id
              AND inventory_id = NEW.inventory_id
              AND obsidian_updated = 1 AND inventory_updated = 1
          )
          BEGIN
            SELECT RAISE(ABORT, 'market publication checks failed');
          END`,
        `CREATE TRIGGER IF NOT EXISTS market_cancel_require_inventory
          BEFORE UPDATE OF status ON p2p_ads
          WHEN NEW.status = 'CANCELADO' AND OLD.status != 'CANCELADO'
          BEGIN
            SELECT CASE WHEN OLD.status NOT IN ('ACTIVO', 'PAUSADO')
              OR NOT EXISTS (
                SELECT 1 FROM pilot_inventory
                WHERE id = OLD.inventory_id AND pilot_id = OLD.seller_pilot_id
                  AND is_locked = 1
              )
              OR EXISTS (
                SELECT 1 FROM p2p_orders
                WHERE ad_id = OLD.id AND status IN ('ABIERTA', 'PENDIENTE', 'OPEN')
              )
              THEN RAISE(ABORT, 'market ad cannot be cancelled') END;
          END`,
        `DROP TRIGGER IF EXISTS market_buy_order_guard`,
        `CREATE TRIGGER IF NOT EXISTS market_buy_order_guard
          BEFORE INSERT ON p2p_orders
          WHEN NEW.status = 'PENDIENTE'
          BEGIN
            SELECT CASE WHEN NOT EXISTS (
              SELECT 1
              FROM p2p_ads ad
              JOIN pilot_inventory item ON item.id = ad.inventory_id
              JOIN pilots buyer ON buyer.pilot_id = NEW.buyer_pilot_id
              WHERE ad.id = NEW.ad_id AND ad.status = 'ACTIVO'
                AND ad.seller_pilot_id != NEW.buyer_pilot_id
                AND item.pilot_id = ad.seller_pilot_id
                AND item.quantity > 0
                AND item.item_id NOT IN ('obsidian', 'falcon')
                AND NOT (item.item_type = 'nave' AND item.item_id = (
                  SELECT selected_ship_id FROM pilots WHERE pilot_id = ad.seller_pilot_id
                ))
                AND buyer.obsidian >= 1
            ) THEN RAISE(ABORT, 'market purchase is not eligible') END;
          END`,
        `CREATE TRIGGER IF NOT EXISTS market_buy_order_apply
          AFTER INSERT ON p2p_orders
          WHEN NEW.status = 'PENDIENTE'
          BEGIN
            UPDATE pilots SET obsidian = obsidian - 1, updated_at = NEW.created_at
            WHERE pilot_id = NEW.buyer_pilot_id AND obsidian >= 1;
            UPDATE pilot_inventory SET is_locked = 1, updated_at = NEW.created_at
            WHERE id = (SELECT inventory_id FROM p2p_ads WHERE id = NEW.ad_id)
              AND pilot_id = (
                SELECT seller_pilot_id FROM p2p_ads WHERE id = NEW.ad_id
              )
              AND quantity > 0;
          END`,
        `CREATE TRIGGER IF NOT EXISTS market_order_confirm_guard
          BEFORE UPDATE OF status ON p2p_orders
          WHEN NEW.status = 'COMPLETADA' AND OLD.status != 'COMPLETADA'
          BEGIN
            SELECT CASE WHEN OLD.status != 'PENDIENTE'
              OR NOT EXISTS (
                SELECT 1 FROM p2p_ads ad
                JOIN pilot_inventory item ON item.id = ad.inventory_id
                WHERE ad.id = OLD.ad_id AND ad.status = 'ACTIVO'
                  AND item.pilot_id = ad.seller_pilot_id
                  AND item.is_locked = 1 AND item.quantity > 0
              )
              THEN RAISE(ABORT, 'market order cannot be completed') END;
          END`,
        `CREATE TRIGGER IF NOT EXISTS market_order_confirm_apply
          AFTER UPDATE OF status ON p2p_orders
          WHEN NEW.status = 'COMPLETADA' AND OLD.status = 'PENDIENTE'
          BEGIN
            UPDATE pilot_inventory
            SET quantity = quantity + (
              SELECT seller_item.quantity FROM p2p_ads ad
              JOIN pilot_inventory seller_item ON seller_item.id = ad.inventory_id
              WHERE ad.id = NEW.ad_id
            ), grant_source = 'market', updated_at = NEW.updated_at
            WHERE pilot_id = NEW.buyer_pilot_id
              AND item_id = (SELECT item_id FROM p2p_ads WHERE id = NEW.ad_id)
              AND id != (SELECT inventory_id FROM p2p_ads WHERE id = NEW.ad_id);
            UPDATE pilot_inventory
            SET pilot_id = NEW.buyer_pilot_id, grant_source = 'market',
              is_locked = 0, updated_at = NEW.updated_at
            WHERE id = (SELECT inventory_id FROM p2p_ads WHERE id = NEW.ad_id)
              AND NOT EXISTS (
                SELECT 1 FROM pilot_inventory buyer_item
                JOIN p2p_ads ad ON ad.id = NEW.ad_id
                WHERE buyer_item.pilot_id = NEW.buyer_pilot_id
                  AND buyer_item.item_id = ad.item_id
                  AND buyer_item.id != ad.inventory_id
              );
            UPDATE pilot_inventory
            SET quantity = 0, is_locked = 0, updated_at = NEW.updated_at
            WHERE id = (SELECT inventory_id FROM p2p_ads WHERE id = NEW.ad_id)
              AND EXISTS (
                SELECT 1 FROM pilot_inventory buyer_item
                JOIN p2p_ads ad ON ad.id = NEW.ad_id
                WHERE buyer_item.pilot_id = NEW.buyer_pilot_id
                  AND buyer_item.item_id = ad.item_id
                  AND buyer_item.id != ad.inventory_id
              );
            UPDATE p2p_ads SET status = 'VENDIDO', updated_at = NEW.updated_at
            WHERE id = NEW.ad_id AND status = 'ACTIVO';
          END`,
        `CREATE TRIGGER IF NOT EXISTS market_order_cancel_guard
          BEFORE UPDATE OF status ON p2p_orders
          WHEN NEW.status = 'CANCELADA' AND OLD.status != 'CANCELADA'
          BEGIN
            SELECT CASE WHEN OLD.status != 'PENDIENTE'
              OR NOT EXISTS (
                SELECT 1 FROM p2p_ads ad
                JOIN pilot_inventory item ON item.id = ad.inventory_id
                WHERE ad.id = OLD.ad_id AND ad.status = 'ACTIVO'
                  AND item.pilot_id = ad.seller_pilot_id AND item.is_locked = 1
              )
              THEN RAISE(ABORT, 'market order cannot be cancelled') END;
          END`,
        `CREATE TRIGGER IF NOT EXISTS market_order_cancel_apply
          AFTER UPDATE OF status ON p2p_orders
          WHEN NEW.status = 'CANCELADA' AND OLD.status = 'PENDIENTE'
          BEGIN
            UPDATE pilot_inventory SET is_locked = 0, updated_at = NEW.updated_at
            WHERE id = (SELECT inventory_id FROM p2p_ads WHERE id = NEW.ad_id)
              AND pilot_id = (
                SELECT seller_pilot_id FROM p2p_ads WHERE id = NEW.ad_id
              );
            UPDATE p2p_ads SET status = 'ACTIVO', updated_at = NEW.updated_at
            WHERE id = NEW.ad_id AND status = 'ACTIVO';
          END`,
      ];
      for (const statement of schema) await db.prepare(statement).run();
      const pilotColumns = new Set(
        (await db.prepare("PRAGMA table_info(pilots)").all<{ name: string }>()).results?.map(
          (column) => column.name,
        ) ?? [],
      );
      if (!pilotColumns.has("referral_code")) {
        await db.prepare("ALTER TABLE pilots ADD COLUMN referral_code TEXT").run();
      }
      if (!pilotColumns.has("referred_by")) {
        await db
          .prepare("ALTER TABLE pilots ADD COLUMN referred_by TEXT REFERENCES pilots(pilot_id)")
          .run();
      }
      await db
        .prepare(
          "CREATE UNIQUE INDEX IF NOT EXISTS idx_pilots_referral_code ON pilots(referral_code)",
        )
        .run();
      const pilotsWithoutCodes = await db
        .prepare("SELECT pilot_id FROM pilots WHERE referral_code IS NULL")
        .all<{ pilot_id: string }>();
      for (const pilot of pilotsWithoutCodes.results ?? []) {
        await ensurePilotReferralCode(db, pilot.pilot_id);
      }
      const adColumns = new Set(
        (await db.prepare("PRAGMA table_info(p2p_ads)").all<{ name: string }>()).results?.map(
          (column) => column.name,
        ) ?? [],
      );
      for (const [name, definition] of [
        ["price_minor", "INTEGER"],
        ["currency_code", "TEXT"],
        ["country_code", "TEXT NOT NULL DEFAULT 'CO'"],
        ["payment_data_json", "TEXT"],
      ] as const) {
        if (!adColumns.has(name)) {
          await db.prepare(`ALTER TABLE p2p_ads ADD COLUMN ${name} ${definition}`).run();
        }
      }
      const orderColumns = await db
        .prepare("PRAGMA table_info(p2p_orders)")
        .all<{ name: string }>();
      if (!(orderColumns.results ?? []).some((column) => column.name === "payment_method")) {
        await db.prepare("ALTER TABLE p2p_orders ADD COLUMN payment_method TEXT").run();
      }
      await db
        .prepare(
          `UPDATE p2p_ads
          SET price_minor = CAST(ROUND(price * 100) AS INTEGER),
            currency_code = currency,
            country_code = CASE WHEN currency = 'USD' THEN 'OTHER' ELSE 'CO' END
          WHERE price_minor IS NULL OR currency_code IS NULL`,
        )
        .run();
      await db
        .prepare(
          `CREATE INDEX IF NOT EXISTS idx_p2p_ads_country_status_price
          ON p2p_ads(country_code, status, price_minor)`,
        )
        .run();
      const legacyPaymentAds = await db
        .prepare(
          `SELECT id, payment_methods, payment_details FROM p2p_ads
          WHERE payment_data_json IS NULL`,
        )
        .all<{ id: string; payment_methods: string; payment_details: string }>();
      for (const ad of legacyPaymentAds.results ?? []) {
        const details = Object.fromEntries(
          decodeMethods(ad.payment_methods).map((method) => [method, ad.payment_details]),
        );
        await db
          .prepare("UPDATE p2p_ads SET payment_data_json = ? WHERE id = ?")
          .bind(JSON.stringify(details), ad.id)
          .run();
      }
      const inventoryColumns = await db
        .prepare("PRAGMA table_info(pilot_inventory)")
        .all<{ name: string }>();
      if (!(inventoryColumns.results ?? []).some((column) => column.name === "grant_source")) {
        await db
          .prepare(
            `ALTER TABLE pilot_inventory ADD COLUMN grant_source TEXT NOT NULL DEFAULT 'legacy'
            CHECK (grant_source IN ('starter', 'boss', 'market', 'legacy'))`,
          )
          .run();
      }
      const attemptColumns = await db
        .prepare("PRAGMA table_info(boss_attempts)")
        .all<{ name: string }>();
      if (!(attemptColumns.results ?? []).some((column) => column.name === "claim_id")) {
        await db.prepare("ALTER TABLE boss_attempts ADD COLUMN claim_id TEXT").run();
      }
      const currentAttemptColumns = new Set(
        (await db.prepare("PRAGMA table_info(boss_attempts)").all<{ name: string }>()).results?.map(
          (column) => column.name,
        ) ?? [],
      );
      for (const [name, definition] of [
        ["challenge_seed", "TEXT NOT NULL DEFAULT ''"],
        ["boss_hp", "INTEGER NOT NULL DEFAULT 0"],
        ["boss_damage", "REAL NOT NULL DEFAULT 0"],
        ["min_combat_ms", "INTEGER NOT NULL DEFAULT 0"],
        ["max_hit_damage", "REAL NOT NULL DEFAULT 0"],
      ] as const) {
        if (!currentAttemptColumns.has(name)) {
          await db.prepare(`ALTER TABLE boss_attempts ADD COLUMN ${name} ${definition}`).run();
        }
      }
      await db
        .prepare(
          `UPDATE pilot_inventory SET grant_source = 'starter'
          WHERE item_id = 'falcon' AND item_type = 'nave' AND grant_source = 'legacy'`,
        )
        .run();
      await db
        .prepare(
          `UPDATE pilot_inventory SET is_locked = 0
          WHERE grant_source = 'legacy' AND is_locked = 1
            AND NOT EXISTS (
              SELECT 1 FROM p2p_ads
              WHERE p2p_ads.inventory_id = pilot_inventory.id
                AND p2p_ads.status IN ('ACTIVO', 'PAUSADO')
            )
            AND NOT EXISTS (
              SELECT 1 FROM p2p_orders
              JOIN p2p_ads ON p2p_ads.id = p2p_orders.ad_id
              WHERE p2p_ads.inventory_id = pilot_inventory.id
                AND p2p_orders.status IN ('ABIERTA', 'PENDIENTE', 'OPEN')
            )`,
        )
        .run();
    })().catch((error) => {
      marketSchemaPromise = undefined;
      throw error;
    });
  }
  await marketSchemaPromise;
}

function validPilotId(value: unknown): value is string {
  return typeof value === "string" && VALID_PILOT_ID.test(value);
}

function resolvePilotId(request: Request, authenticatedPilotId?: string): string {
  if (authenticatedPilotId) return authenticatedPilotId;
  const cookieId = readCookie(request, PILOT_COOKIE);
  if (validPilotId(cookieId)) return cookieId;
  const headerId = request.headers.get("x-pilot-id");
  if (validPilotId(headerId)) return headerId;
  return `plt_${randomHex(12)}`;
}

function pilotJson(request: Request, pilotId: string, data: unknown, status = 200): Response {
  const headers =
    readCookie(request, PILOT_COOKIE) === pilotId
      ? undefined
      : {
          "set-cookie": `${PILOT_COOKIE}=${pilotId}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
        };
  return json(data, status, headers);
}

async function ensurePilot(db: D1Database, pilotId: string): Promise<void> {
  const now = Date.now();
  await db
    .prepare(
      `INSERT OR IGNORE INTO pilots
    (pilot_id, callsign, obsidian, welcome_claimed, created_at, updated_at)
    VALUES (?, 'PILOTO', 5, 1, ?, ?)`,
    )
    .bind(pilotId, now, now)
    .run();
  await db
    .prepare(
      `INSERT OR IGNORE INTO pilot_inventory
        (id, pilot_id, item_id, item_name, item_type, quantity, is_locked, grant_source, created_at, updated_at)
      VALUES (?, ?, 'falcon', ?, 'nave', 1, 0, 'starter', ?, ?)`,
    )
    .bind(`inv_${pilotId}_falcon`, pilotId, SHIPS[0]!.name, now, now)
    .run();
}

async function getOwnedShips(db: D1Database, pilotId: string): Promise<string[]> {
  const { results = [] } = await db
    .prepare(
      `SELECT item_id FROM pilot_inventory
      WHERE pilot_id = ? AND item_type = 'nave' AND quantity > 0 AND is_locked = 0`,
    )
    .bind(pilotId)
    .all<{ item_id: string }>();
  return Array.from(
    new Set([
      "falcon",
      ...results.map((item) => item.item_id).filter((id) => VALID_SHIP_IDS.has(id)),
    ]),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

type CanonicalProgress = Record<string, unknown> & { ships: string[]; selectedShip: string };

async function canonicalizeProgress(
  db: D1Database,
  pilotId: string,
  savedProgress: unknown,
): Promise<CanonicalProgress | null> {
  let parsed: unknown = savedProgress;
  if (typeof savedProgress === "string") {
    try {
      parsed = JSON.parse(savedProgress);
    } catch (error) {
      console.error("El progreso guardado no es JSON válido:", error);
      return null;
    }
  }
  if (!isRecord(parsed)) return null;
  const ships = await getOwnedShips(db, pilotId);
  const selectedShip =
    typeof parsed["selectedShip"] === "string" && ships.includes(parsed["selectedShip"])
      ? parsed["selectedShip"]
      : "falcon";
  return { ...parsed, ships, selectedShip };
}

function decodeMethods(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

function sanitizePaymentDetails(value: string): string {
  return Array.from(value.replace(/<[^>]*>/g, ""))
    .filter((character) => {
      const code = character.charCodeAt(0);
      return !((code < 32 && code !== 9 && code !== 10 && code !== 13) || code === 127);
    })
    .join("")
    .trim();
}

function paymentDataForAd(
  row: Pick<MarketAdRow, "payment_data_json" | "payment_methods" | "payment_details">,
): Record<string, string> {
  if (row.payment_data_json) {
    try {
      const parsed: unknown = JSON.parse(row.payment_data_json);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return Object.fromEntries(
          Object.entries(parsed).filter(
            (entry): entry is [string, string] => typeof entry[1] === "string",
          ),
        );
      }
    } catch (error) {
      console.error("Los datos de pago almacenados no son JSON válido:", error);
    }
  }
  return Object.fromEntries(
    decodeMethods(row.payment_methods).map((method) => [method, row.payment_details]),
  );
}

function publicPaymentMethodFromKey(key: string): P2PPublicPaymentMethod | null {
  if (key.startsWith("USDT:")) {
    const network = key.slice("USDT:".length);
    if (!P2P_USDT_NETWORKS.includes(network as P2PUsdtNetwork)) return null;
    return {
      method: "USDT",
      network: network as P2PUsdtNetwork,
      label: paymentMethodLabel("USDT", network as P2PUsdtNetwork),
    };
  }
  if (key === "PAYPAL") {
    return { method: "PAYPAL", label: paymentMethodLabel("PAYPAL") };
  }
  if (key === "TRANSFERENCIA") {
    return { method: "TRANSFERENCIA", label: "Transferencia bancaria (anuncio anterior)" };
  }
  const method = key;
  if (!VALID_PAYMENT_METHODS.has(method)) return null;
  return {
    method: method as P2PPayMethod,
    label: paymentMethodLabel(method as P2PPayMethod),
  };
}

function publicPaymentMethodKey(method: P2PPublicPaymentMethod): string {
  if (method.method === "PAYPAL" || method.method === "TRANSFERENCIA") return method.method;
  return paymentMethodKey(method.method, method.network);
}

function publicPaymentMethods(
  row: Pick<MarketAdRow, "payment_data_json" | "payment_methods" | "payment_details">,
): P2PPublicPaymentMethod[] {
  const data = paymentDataForAd(row);
  const keys = Object.keys(data);
  const legacyKeys = keys.length ? keys : decodeMethods(row.payment_methods);
  return legacyKeys
    .map(publicPaymentMethodFromKey)
    .filter((method): method is P2PPublicPaymentMethod => method !== null);
}

function paymentChoiceKey(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const choice = value as Record<string, unknown>;
  const method = choice["method"];
  const network = choice["network"];
  if (typeof method !== "string" || !VALID_PAYMENT_METHODS.has(method)) return null;
  if (method === "USDT") {
    if (typeof network !== "string" || !P2P_USDT_NETWORKS.includes(network as P2PUsdtNetwork)) {
      return null;
    }
    return paymentMethodKey("USDT", network as P2PUsdtNetwork);
  }
  if (network !== undefined) return null;
  return paymentMethodKey(method as P2PPayMethod);
}

function validatePaymentChoices(
  country: P2PCountry,
  values: unknown,
): { methods: P2PPaymentMethodChoice[]; paymentData: Record<string, string> } | null {
  if (!Array.isArray(values) || values.length === 0 || values.length > 10) return null;
  const countryMethods = new Set(P2P_COUNTRIES[country].methods.map((method) => method.id));
  const methods: P2PPaymentMethodChoice[] = [];
  const paymentData: Record<string, string> = {};
  for (const value of values) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const choice = value as Record<string, unknown>;
    const key = paymentChoiceKey(choice);
    const method = choice["method"];
    const network = choice["network"];
    const details = choice["details"];
    if (
      !key ||
      typeof method !== "string" ||
      !countryMethods.has(method as P2PPayMethod) ||
      typeof details !== "string" ||
      details.length > 500
    ) {
      return null;
    }
    const sanitizedDetails = sanitizePaymentDetails(details);
    if (!sanitizedDetails || sanitizedDetails.length > 500 || key in paymentData) return null;
    paymentData[key] = sanitizedDetails;
    methods.push({
      method: method as P2PPayMethod,
      ...(typeof network === "string" ? { network: network as P2PUsdtNetwork } : {}),
      details: sanitizedDetails,
    });
  }
  return { methods, paymentData };
}

function readPaymentChoice(
  country: P2PCountry,
  methodValue: unknown,
  networkValue: unknown,
): { key: string; method: P2PPublicPaymentMethod } | null {
  if (typeof methodValue !== "string") return null;
  const choice = {
    method: methodValue,
    ...(networkValue === undefined ? {} : { network: networkValue }),
  };
  const key = paymentChoiceKey(choice);
  const countryMethods = P2P_COUNTRIES[country].methods.map((method) => method.id);
  if (key && countryMethods.includes(methodValue as P2PPayMethod)) {
    return {
      key,
      method: {
        method: methodValue as P2PPayMethod,
        ...(typeof networkValue === "string" ? { network: networkValue as P2PUsdtNetwork } : {}),
        label: paymentMethodLabel(
          methodValue as P2PPayMethod,
          typeof networkValue === "string" ? (networkValue as P2PUsdtNetwork) : undefined,
        ),
      },
    };
  }
  if (
    (methodValue === "PAYPAL" || methodValue === "TRANSFERENCIA") &&
    networkValue === undefined &&
    LEGACY_PAYMENT_METHODS.has(methodValue) &&
    publicPaymentMethodFromKey(methodValue)
  ) {
    return { key: methodValue, method: publicPaymentMethodFromKey(methodValue)! };
  }
  return null;
}

function serializeAd(row: MarketAdRow) {
  const country = (P2P_COUNTRIES[row.country_code] ? row.country_code : "CO") as P2PCountry;
  const paymentData = paymentDataForAd(row);
  return {
    id: row.id,
    sellerPilotId: row.seller_pilot_id,
    inventoryId: row.inventory_id,
    itemId: row.item_id,
    itemName: row.item_name,
    itemType: row.item_type,
    country,
    priceMinor: row.price_minor ?? Math.round(row.price * 100),
    currency: row.currency_code ?? row.currency,
    paymentMethods: publicPaymentMethods(row),
    paymentDetails: sanitizePaymentDetails(row.payment_details),
    paymentData: Object.fromEntries(
      Object.entries(paymentData).map(([key, details]) => [key, sanitizePaymentDetails(details)]),
    ),
    status: row.status,
    feePaid: row.fee_paid,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function hasOpenOrder(db: D1Database, adId: string): Promise<boolean> {
  const order = await db
    .prepare(
      `SELECT id FROM p2p_orders
    WHERE ad_id = ? AND status IN ('ABIERTA', 'PENDIENTE', 'OPEN') LIMIT 1`,
    )
    .bind(adId)
    .first<{ id: string }>();
  return order !== null;
}

async function handleBossRequest(
  request: Request,
  env: WorkerEnv | undefined,
): Promise<Response | null> {
  const url = new URL(request.url);
  const isStatus = url.pathname === "/api/bosses/status";
  const isStart =
    url.pathname === "/api/boss/start" ||
    url.pathname === "/api/bosses/start" ||
    url.pathname === "/api/bosses/attempt";
  const isClaim = url.pathname === "/api/boss/claim" || url.pathname === "/api/bosses/claim";
  const isHelpRequest = url.pathname === "/api/boss/help-request";
  const isHelpJoin = url.pathname === "/api/boss/help-join";
  const isHelpLeave = url.pathname === "/api/boss/help-leave";
  const isHelpSocket = url.pathname === "/api/boss/help/ws";
  if (
    !isStatus &&
    !isStart &&
    !isClaim &&
    !isHelpRequest &&
    !isHelpJoin &&
    !isHelpLeave &&
    !isHelpSocket
  ) {
    return null;
  }
  if (!env?.DB) return json({ error: "La base de datos no está disponible en este Worker." }, 503);
  if (
    (isStatus && request.method !== "GET") ||
    (isHelpSocket && request.method !== "GET") ||
    (!isStatus && !isHelpSocket && request.method !== "POST")
  ) {
    return json({ error: "Método no permitido." }, 405);
  }
  if (
    (!isStatus && !isHelpSocket && !isSameOriginPost(request, url)) ||
    (isHelpSocket &&
      (request.headers.get("Upgrade")?.toLowerCase() !== "websocket" ||
        request.headers.get("origin") !== url.origin))
  ) {
    return json({ error: "Solicitud no autorizada." }, 403);
  }

  const db = env.DB;
  try {
    await ensureAuthSchema(db);
    await ensureMarketSchema(db);
  } catch (error) {
    console.error("No se pudo preparar el sistema de recompensas de bosses:", error);
    return json({ error: "No se pudo preparar el sistema de bosses." }, 503);
  }
  const account = await getAuthenticatedAccount(db, await requestSessionHash(request));
  if (!account) return json({ error: "Inicia sesión con Google para luchar contra bosses." }, 401);
  const now = Date.now();

  if (isStatus) {
    try {
      const { results = [] } = await db
        .prepare("SELECT boss_id, last_defeated_at FROM boss_cooldowns WHERE pilot_id = ?")
        .bind(account.pilot_id)
        .all<{ boss_id: string; last_defeated_at: number }>();
      const cooldowns = Object.fromEntries(
        results.map((row) => [row.boss_id, row.last_defeated_at + BOSS_COOLDOWN_MS]),
      );
      return json({ cooldowns });
    } catch (error) {
      console.error("No se pudo consultar el cooldown de bosses:", error);
      return json({ error: "No se pudo consultar el cooldown de bosses." }, 503);
    }
  }

  if (isHelpSocket) {
    if (!env.BOSS_HELP)
      return json({ error: "La sala de ayuda del boss no está disponible." }, 503);
    const allianceId = url.searchParams.get("alliance_id");
    const membership = await db
      .prepare("SELECT alliance_id FROM alliance_members WHERE pilot_id = ?")
      .bind(account.pilot_id)
      .first<{ alliance_id: string }>();
    if (!membership || membership.alliance_id !== allianceId) {
      return json({ error: "Debes pertenecer a la alianza para recibir ayuda de boss." }, 403);
    }
    const sessionId = url.searchParams.get("session_id");
    let role: "member" | "host" | "helper" = "member";
    if (sessionId) {
      const session = await db
        .prepare(
          `SELECT host_pilot_id, helper_pilot_id, status FROM boss_help_sessions
           WHERE session_id = ? AND status IN ('WAITING', 'ACTIVE')`,
        )
        .bind(sessionId)
        .first<{
          host_pilot_id: string;
          helper_pilot_id: string | null;
          status: string;
        }>();
      if (!session) return json({ error: "La sesión de ayuda ya no está disponible." }, 404);
      if (session.host_pilot_id === account.pilot_id) role = "host";
      else if (session.helper_pilot_id === account.pilot_id && session.status === "ACTIVE") {
        role = "helper";
      } else {
        return json({ error: "No participas en esta sesión de ayuda." }, 403);
      }
    }
    const profile = await db
      .prepare("SELECT display_name FROM player_profiles WHERE pilot_id = ?")
      .bind(account.pilot_id)
      .first<{ display_name: string }>();
    const savedProgress = await db
      .prepare("SELECT progress_json FROM player_progress WHERE pilot_id = ?")
      .bind(account.pilot_id)
      .first<{ progress_json: string }>();
    let shipId = "falcon";
    if (savedProgress?.progress_json) {
      try {
        const progress: unknown = JSON.parse(savedProgress.progress_json);
        if (
          isRecord(progress) &&
          typeof progress["selectedShip"] === "string" &&
          (await getOwnedShips(db, account.pilot_id)).includes(progress["selectedShip"])
        ) {
          shipId = progress["selectedShip"];
        }
      } catch (error) {
        console.error("No se pudo recuperar la nave elegida para ayudar al boss:", error);
      }
    }
    const room = env.BOSS_HELP.get(env.BOSS_HELP.idFromName(membership.alliance_id));
    const socketUrl = new URL(request.url);
    socketUrl.pathname = "/websocket";
    socketUrl.search = new URLSearchParams({
      pilotId: account.pilot_id,
      allianceId: membership.alliance_id,
      callsign: profile?.display_name || "PILOTO",
      role,
      shipId,
      ...(sessionId ? { sessionId } : {}),
    }).toString();
    return room.fetch(new Request(socketUrl, request));
  }

  if (isHelpRequest || isHelpJoin || isHelpLeave) {
    if (!env.BOSS_HELP) {
      return json({ error: "La sala de ayuda del boss no está disponible en este Worker." }, 503);
    }
    const body = await readJson(request, 2048);
    if (!body) return json({ error: "El cuerpo de la solicitud no es válido." }, 400);
    const membership = await db
      .prepare(
        `SELECT alliance.alliance_id, alliance.name
         FROM alliance_members member
         JOIN alliances alliance ON alliance.alliance_id = member.alliance_id
         WHERE member.pilot_id = ?`,
      )
      .bind(account.pilot_id)
      .first<{ alliance_id: string; name: string }>();
    if (!membership)
      return json({ error: "Debes pertenecer a una alianza para pedir ayuda." }, 403);
    const room = env.BOSS_HELP.get(env.BOSS_HELP.idFromName(membership.alliance_id));

    if (isHelpRequest) {
      const bossId = body["boss_id"];
      const world = body["world"];
      const reward = BOSS_REWARDS.find((candidate) => candidate.bossId === bossId);
      if (
        typeof bossId !== "string" ||
        !reward ||
        typeof world !== "number" ||
        !Number.isSafeInteger(world) ||
        world !== reward.world
      ) {
        return json({ error: "Boss o mundo no válidos." }, 400);
      }
      const cooldown = await db
        .prepare("SELECT last_defeated_at FROM boss_cooldowns WHERE pilot_id = ? AND boss_id = ?")
        .bind(account.pilot_id, bossId)
        .first<{ last_defeated_at: number }>();
      if (cooldown && cooldown.last_defeated_at + BOSS_COOLDOWN_MS > now) {
        return json({ error: "No puedes pedir ayuda mientras el boss esté en cooldown." }, 409);
      }
      const attempt = await db
        .prepare(
          `SELECT token_hash FROM boss_attempts
           WHERE pilot_id = ? AND boss_id = ? AND claimed_at IS NULL AND expires_at > ?`,
        )
        .bind(account.pilot_id, bossId, now)
        .first<{ token_hash: string }>();
      if (!attempt)
        return json({ error: "Debes iniciar el combate autorizado antes de pedir ayuda." }, 409);
      const sessionId = `help_${randomHex(12)}`;
      const created = await db
        .prepare(
          `INSERT INTO boss_help_sessions (session_id, host_pilot_id, boss_id, created_at)
           SELECT ?, ?, ?, ?
           WHERE EXISTS (SELECT 1 FROM alliance_members WHERE pilot_id = ? AND alliance_id = ?)
             AND EXISTS (
               SELECT 1 FROM boss_attempts
               WHERE token_hash = ? AND pilot_id = ? AND claimed_at IS NULL AND expires_at > ?
             )
           ON CONFLICT DO NOTHING
           RETURNING session_id`,
        )
        .bind(
          sessionId,
          account.pilot_id,
          bossId,
          now,
          account.pilot_id,
          membership.alliance_id,
          attempt.token_hash,
          account.pilot_id,
          now,
        )
        .first<{ session_id: string }>();
      if (!created) return json({ error: "Ya tienes una solicitud de ayuda activa." }, 409);
      const profile = await db
        .prepare("SELECT display_name FROM player_profiles WHERE pilot_id = ?")
        .bind(account.pilot_id)
        .first<{ display_name: string }>();
      const notification = await room.fetch(
        new Request("https://boss-help/notify", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            sessionId,
            bossId,
            bossName: bossById(bossId)?.name ?? bossId,
            world,
            hostPilotId: account.pilot_id,
            hostName: profile?.display_name || "PILOTO",
            expiresAt: now + 60_000,
          }),
        }),
      );
      if (!notification.ok) {
        await db
          .prepare(
            "UPDATE boss_help_sessions SET status = 'EXPIRED', ended_at = ? WHERE session_id = ?",
          )
          .bind(now, sessionId)
          .run();
        console.error("El Durable Object rechazó la solicitud de ayuda:", notification.status);
        return json({ error: "No se pudo notificar a los miembros de la alianza." }, 502);
      }
      return json({ success: true, session_id: sessionId, expires_at: now + 60_000 });
    }

    const sessionId = body["session_id"];
    if (typeof sessionId !== "string" || !/^help_[0-9a-f]{24}$/.test(sessionId)) {
      return json({ error: "La sesión de ayuda no es válida." }, 400);
    }
    const session = await db
      .prepare(
        `SELECT session_id, host_pilot_id, helper_pilot_id, boss_id, status, created_at
         FROM boss_help_sessions WHERE session_id = ?`,
      )
      .bind(sessionId)
      .first<{
        session_id: string;
        host_pilot_id: string;
        helper_pilot_id: string | null;
        boss_id: string;
        status: "WAITING" | "ACTIVE" | "COMPLETED" | "EXPIRED" | "LEFT";
        created_at: number;
      }>();
    if (!session) return json({ error: "No se encontró la solicitud de ayuda." }, 404);

    if (isHelpJoin) {
      if (session.host_pilot_id === account.pilot_id) {
        return json({ error: "No puedes unirte a tu propio combate." }, 409);
      }
      if (session.status !== "WAITING" || session.created_at + 60_000 <= now) {
        if (session.status === "WAITING") {
          await db
            .prepare(
              "UPDATE boss_help_sessions SET status = 'EXPIRED', ended_at = ? WHERE session_id = ? AND status = 'WAITING'",
            )
            .bind(now, sessionId)
            .run();
          await room.fetch(
            new Request("https://boss-help/ended", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ sessionId, status: "expired" }),
            }),
          );
        }
        return json({ error: "La solicitud expiró o ya tiene un ayudante." }, 409);
      }
      const helperProfile = await db
        .prepare("SELECT display_name FROM player_profiles WHERE pilot_id = ?")
        .bind(account.pilot_id)
        .first<{ display_name: string }>();
      const savedProgress = await db
        .prepare("SELECT progress_json FROM player_progress WHERE pilot_id = ?")
        .bind(account.pilot_id)
        .first<{ progress_json: string }>();
      let shipId = "falcon";
      try {
        const progress: unknown = savedProgress?.progress_json
          ? JSON.parse(savedProgress.progress_json)
          : null;
        if (
          isRecord(progress) &&
          typeof progress["selectedShip"] === "string" &&
          (await getOwnedShips(db, account.pilot_id)).includes(progress["selectedShip"])
        ) {
          shipId = progress["selectedShip"];
        }
      } catch (error) {
        console.error("No se pudo recuperar la nave del ayudante:", error);
      }
      const joined = await db
        .prepare(
          `UPDATE boss_help_sessions SET helper_pilot_id = ?, status = 'ACTIVE', started_at = ?
           WHERE session_id = ? AND status = 'WAITING' AND created_at + 60000 > ?
             AND EXISTS (SELECT 1 FROM alliance_members host
               WHERE host.pilot_id = boss_help_sessions.host_pilot_id
                 AND host.alliance_id = ?)
             AND EXISTS (SELECT 1 FROM alliance_members helper
               WHERE helper.pilot_id = ? AND helper.alliance_id = ?)
           RETURNING session_id`,
        )
        .bind(
          account.pilot_id,
          now,
          sessionId,
          now,
          membership.alliance_id,
          account.pilot_id,
          membership.alliance_id,
        )
        .first<{ session_id: string }>();
      if (!joined) return json({ error: "Otro miembro ya se unió o la solicitud expiró." }, 409);
      const notification = await room.fetch(
        new Request("https://boss-help/joined", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            sessionId,
            hostPilotId: session.host_pilot_id,
            helperPilotId: account.pilot_id,
            helperName: helperProfile?.display_name || "PILOTO",
            shipId,
          }),
        }),
      );
      if (!notification.ok) {
        console.error("El Durable Object rechazó la unión al combate:", notification.status);
        return json({ error: "No se pudo notificar la incorporación al combate." }, 502);
      }
      return json({
        success: true,
        session_id: sessionId,
        boss_id: session.boss_id,
        ship_id: shipId,
      });
    }

    const actorIsHost = session.host_pilot_id === account.pilot_id;
    const actorIsHelper = session.helper_pilot_id === account.pilot_id;
    if (!actorIsHost && !actorIsHelper)
      return json({ error: "No participas en esta sesión." }, 403);
    if (!["WAITING", "ACTIVE"].includes(session.status)) {
      return json({ success: true, status: session.status });
    }
    const status = actorIsHost && session.status === "WAITING" ? "EXPIRED" : "LEFT";
    const ended = await db
      .prepare(
        `UPDATE boss_help_sessions SET status = ?, ended_at = ?
         WHERE session_id = ? AND status IN ('WAITING', 'ACTIVE')`,
      )
      .bind(status, now, sessionId)
      .run();
    if (ended.meta?.changes) {
      await room.fetch(
        new Request("https://boss-help/ended", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            sessionId,
            status: status === "EXPIRED" ? "expired" : "left",
            pilotId: account.pilot_id,
          }),
        }),
      );
    }
    return json({ success: true, status });
  }

  const body = await readJson(request, isStart ? 1024 : 262_144);
  if (!body) return json({ error: "El cuerpo de la solicitud no es válido." }, 400);
  const bossId = body["boss_id"] ?? body["bossId"];
  const reward = BOSS_REWARDS.find((candidate) => candidate.bossId === bossId);
  const params = reward ? BOSS_COMBAT_PARAMS[reward.bossId] : undefined;

  try {
    await ensurePilot(db, account.pilot_id);
    if (isStart) {
      if (!reward) return json({ error: "El boss indicado no es válido." }, 400);
      if (!params) return json({ error: "No hay parámetros para el boss indicado." }, 400);
      const previous = await db
        .prepare("SELECT last_defeated_at FROM boss_cooldowns WHERE pilot_id = ? AND boss_id = ?")
        .bind(account.pilot_id, reward.bossId)
        .first<{ last_defeated_at: number }>();
      const retryAt = (previous?.last_defeated_at ?? 0) + BOSS_COOLDOWN_MS;
      if (retryAt > now) {
        return json(
          {
            error: `Boss en cooldown. Disponible en ${Math.max(1, Math.ceil((retryAt - now) / 60_000))} min.`,
            retryAt,
          },
          409,
        );
      }
      await db
        .prepare(
          "DELETE FROM boss_attempts WHERE pilot_id = ? AND boss_id = ? AND claimed_at IS NULL AND expires_at <= ?",
        )
        .bind(account.pilot_id, reward.bossId, now)
        .run();
      const ticket = randomHex(32);
      const seed = randomHex(32);
      const attempt = await db
        .prepare(
          `INSERT INTO boss_attempts
            (token_hash, pilot_id, boss_id, issued_at, expires_at, claimed_at, claim_id,
              challenge_seed, boss_hp, boss_damage, min_combat_ms, max_hit_damage)
          VALUES (?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?, ?)`,
        )
        .bind(
          await sha256Hex(ticket),
          account.pilot_id,
          reward.bossId,
          now,
          now + BOSS_ATTEMPT_TTL_MS,
          seed,
          params.hp,
          params.damage,
          params.minCombatMs,
          params.maxHitDamage,
        )
        .run();
      if (attempt.meta?.changes !== 1) {
        return json({ error: "Ya hay un combate activo contra este boss." }, 409);
      }
      return json({
        token: ticket,
        seed,
        issued_at: now,
        expires_at: now + BOSS_ATTEMPT_TTL_MS,
        boss: {
          hp: params.hp,
          damage: params.damage,
          min_combat_ms: params.minCombatMs,
          max_hit_damage: params.maxHitDamage,
        },
      });
    }

    const token = body["token"] ?? body["ticket"];
    if (typeof token !== "string" || !/^[0-9a-f]{64}$/.test(token)) {
      return json({ error: "Falta un token de combate válido." }, 403);
    }
    const tokenHash = await sha256Hex(token);
    const attempt = await db
      .prepare(
        `SELECT issued_at, expires_at, claimed_at, challenge_seed, boss_hp, boss_damage,
          min_combat_ms, max_hit_damage, boss_id FROM boss_attempts
        WHERE token_hash = ? AND pilot_id = ?`,
      )
      .bind(tokenHash, account.pilot_id)
      .first<{
        issued_at: number;
        expires_at: number;
        claimed_at: number | null;
        challenge_seed: string;
        boss_hp: number;
        boss_damage: number;
        min_combat_ms: number;
        max_hit_damage: number;
        boss_id: string;
      }>();
    if (!attempt) return json({ error: "El token no pertenece a un combate autorizado." }, 403);
    if (attempt.claimed_at !== null) {
      return json({ error: "Este token de combate ya fue utilizado." }, 409);
    }
    const helpSessionId = body["help_session_id"];
    let helpSession: { session_id: string; helper_pilot_id: string } | null = null;
    if (helpSessionId !== undefined) {
      if (typeof helpSessionId !== "string") {
        return json({ error: "La sesión de ayuda indicada no es válida." }, 400);
      }
      helpSession = await db
        .prepare(
          `SELECT session_id, helper_pilot_id FROM boss_help_sessions
           WHERE session_id = ? AND host_pilot_id = ? AND boss_id = ? AND status = 'ACTIVE'`,
        )
        .bind(helpSessionId, account.pilot_id, attempt.boss_id)
        .first<{ session_id: string; helper_pilot_id: string }>();
      if (!helpSession?.helper_pilot_id) {
        return json({ error: "La sesión de ayuda activa no pertenece a este combate." }, 409);
      }
    } else {
      const activeHelp = await db
        .prepare(
          `SELECT session_id FROM boss_help_sessions
           WHERE host_pilot_id = ? AND boss_id = ? AND status = 'ACTIVE'`,
        )
        .bind(account.pilot_id, attempt.boss_id)
        .first<{ session_id: string }>();
      if (activeHelp) return json({ error: "Falta validar la recompensa de tu ayudante." }, 409);
    }
    const claimId = randomHex(32);
    const consumed = await db
      .prepare(
        `UPDATE boss_attempts SET claimed_at = ?, claim_id = ?
        WHERE token_hash = ? AND pilot_id = ? AND claimed_at IS NULL`,
      )
      .bind(now, claimId, tokenHash, account.pilot_id)
      .run();
    if (consumed.meta?.changes !== 1) {
      return json({ error: "Este token de combate ya fue utilizado." }, 409);
    }

    if (attempt.expires_at <= now) return json({ error: "El token de combate expiró." }, 410);
    if (!reward || !params || attempt.boss_id !== bossId) {
      return json({ error: "El boss no coincide con el combate autorizado." }, 400);
    }
    const result = body["result"];
    if (result !== "victory" && result !== "defeat") {
      return json({ error: "El resultado del combate no es válido." }, 400);
    }

    const evidence = parseBossEvidence(body);
    if (!evidence) return json({ error: "Los datos del combate no son válidos." }, 400);
    const durationMs = evidence.ended_at - evidence.started_at;
    const serverDurationMs = now - attempt.issued_at;
    if (
      evidence.started_at !== attempt.issued_at ||
      durationMs < attempt.min_combat_ms ||
      durationMs > BOSS_ATTEMPT_TTL_MS ||
      serverDurationMs < attempt.min_combat_ms ||
      serverDurationMs > BOSS_ATTEMPT_TTL_MS ||
      evidence.ended_at > now + 10_000 ||
      evidence.ended_at < now - 30_000 ||
      Math.abs(durationMs - serverDurationMs) > 30_000
    ) {
      return json({ error: "La duración del combate no cumple los límites permitidos." }, 400);
    }
    if (attempt.challenge_seed.length !== 64 || attempt.boss_hp <= 0) {
      return json({ error: "El intento no contiene parámetros de combate válidos." }, 409);
    }
    const transcriptError = validateBossEvidence(evidence, attempt);
    if (transcriptError) return json({ error: transcriptError }, 400);
    if (typeof body["proof"] !== "string" || !/^[0-9a-f]{64}$/.test(body["proof"])) {
      return json({ error: "Falta la prueba criptográfica del combate." }, 400);
    }
    const expectedProof = await createBossCombatProof(attempt.challenge_seed, evidence);
    if (body["proof"] !== expectedProof) {
      return json({ error: "La prueba criptográfica no corresponde al combate." }, 400);
    }
    if (result === "victory" && evidence.damage_dealt < attempt.boss_hp) {
      return json({ error: "El daño registrado no alcanza la vida del boss." }, 400);
    }
    if (result === "victory" && evidence.events.some((event) => event.type === "player_death")) {
      return json({ error: "Una derrota del jugador no puede declararse como victoria." }, 400);
    }
    if (result === "defeat") {
      if (helpSession) {
        await db
          .prepare(
            `UPDATE boss_help_sessions SET status = 'COMPLETED', ended_at = ?
             WHERE session_id = ? AND status = 'ACTIVE'`,
          )
          .bind(now, helpSession.session_id)
          .run();
        await notifyBossHelpEnded(env, db, helpSession.session_id, account.pilot_id, "completed");
      }
      return json({ success: true, result, bossId: reward.bossId, rewards: [] });
    }

    const cooldown = await db
      .prepare("SELECT last_defeated_at FROM boss_cooldowns WHERE pilot_id = ? AND boss_id = ?")
      .bind(account.pilot_id, reward.bossId)
      .first<{ last_defeated_at: number }>();
    if (cooldown && cooldown.last_defeated_at + BOSS_COOLDOWN_MS > now) {
      return json({ error: "El boss está en cooldown." }, 409);
    }

    const rewardId = claimId;
    const drops: { itemId: string; itemName: string; itemType: "nave" | "objeto" }[] = [];
    if (rollChance(reward.shipChance)) {
      drops.push({
        itemId: `boss_ship_${reward.bossId}_${reward.rank.toLowerCase()}`,
        itemName: `Nave de combate · Rango ${reward.rank}`,
        itemType: "nave",
      });
    }
    if (rollChance(reward.itemChance)) {
      drops.push({
        itemId: `boss_item_${reward.bossId}_${reward.rank.toLowerCase()}`,
        itemName: `Objeto especial · Rango ${reward.rank}`,
        itemType: "objeto",
      });
    }

    const statements = [
      db
        .prepare(
          `INSERT INTO boss_cooldowns (pilot_id, boss_id, last_defeated_at, last_reward_id)
          SELECT ?, ?, ?, ? WHERE EXISTS (
            SELECT 1 FROM boss_attempts
            WHERE token_hash = ? AND pilot_id = ? AND boss_id = ?
              AND claimed_at = ? AND claim_id = ? AND expires_at > ?
          ) AND NOT EXISTS (
            SELECT 1 FROM boss_cooldowns
            WHERE pilot_id = ? AND boss_id = ? AND last_defeated_at > ?
          )
          ON CONFLICT(pilot_id, boss_id) DO UPDATE SET
            last_defeated_at = excluded.last_defeated_at,
            last_reward_id = excluded.last_reward_id
          WHERE boss_cooldowns.last_defeated_at <= ?`,
        )
        .bind(
          account.pilot_id,
          reward.bossId,
          now,
          rewardId,
          tokenHash,
          account.pilot_id,
          reward.bossId,
          now,
          claimId,
          now,
          account.pilot_id,
          reward.bossId,
          now - BOSS_COOLDOWN_MS,
          now - BOSS_COOLDOWN_MS,
        ),
      db
        .prepare(
          `UPDATE pilots SET boss_obsidian = boss_obsidian + ?, updated_at = ?
          WHERE pilot_id = ? AND EXISTS (
            SELECT 1 FROM boss_cooldowns
            WHERE pilot_id = ? AND boss_id = ? AND last_reward_id = ?
          )`,
        )
        .bind(reward.obsidian, now, account.pilot_id, account.pilot_id, reward.bossId, rewardId),
      ...drops.map((drop) =>
        db
          .prepare(
            `INSERT INTO pilot_inventory
              (id, pilot_id, item_id, item_name, item_type, quantity, is_locked, grant_source, created_at, updated_at)
            SELECT ?, ?, ?, ?, ?, 1, 0, ?, ?
            WHERE EXISTS (
              SELECT 1 FROM boss_cooldowns
              WHERE pilot_id = ? AND boss_id = ? AND last_reward_id = ?
            )
            ON CONFLICT(pilot_id, item_id) DO UPDATE SET
              quantity = pilot_inventory.quantity + excluded.quantity,
              updated_at = excluded.updated_at`,
          )
          .bind(
            `inv_${randomHex(8)}`,
            account.pilot_id,
            drop.itemId,
            drop.itemName,
            drop.itemType,
            "boss",
            now,
            now,
            account.pilot_id,
            reward.bossId,
            rewardId,
          ),
      ),
    ];
    if (helpSession) {
      statements.push(
        db
          .prepare(
            `UPDATE pilots SET obsidian = obsidian + 1, updated_at = ?
             WHERE pilot_id = ? AND EXISTS (
               SELECT 1 FROM boss_help_sessions
               WHERE session_id = ? AND host_pilot_id = ? AND helper_pilot_id = ?
                 AND status = 'ACTIVE'
             )`,
          )
          .bind(
            now,
            helpSession.helper_pilot_id,
            helpSession.session_id,
            account.pilot_id,
            helpSession.helper_pilot_id,
          ),
        db
          .prepare(
            `INSERT INTO player_progress (pilot_id, progress_json, updated_at)
             SELECT ?, json_set(?, '$.credits', ?), ?
             WHERE EXISTS (
               SELECT 1 FROM boss_help_sessions
               WHERE session_id = ? AND host_pilot_id = ? AND helper_pilot_id = ?
                 AND status = 'ACTIVE'
             )
             ON CONFLICT(pilot_id) DO UPDATE SET
               progress_json = json_set(
                 CASE WHEN json_valid(player_progress.progress_json)
                   THEN player_progress.progress_json ELSE ? END,
                 '$.credits',
                 COALESCE(CAST(json_extract(
                   CASE WHEN json_valid(player_progress.progress_json)
                     THEN player_progress.progress_json ELSE ? END,
                   '$.credits'
                 ) AS INTEGER), 0) + 50
               ),
               updated_at = excluded.updated_at`,
          )
          .bind(
            helpSession.helper_pilot_id,
            DEFAULT_REFERRAL_PROGRESS,
            50,
            now,
            helpSession.session_id,
            account.pilot_id,
            helpSession.helper_pilot_id,
            DEFAULT_REFERRAL_PROGRESS,
            DEFAULT_REFERRAL_PROGRESS,
          ),
        db
          .prepare(
            `UPDATE boss_help_sessions SET status = 'COMPLETED', ended_at = ?
             WHERE session_id = ? AND host_pilot_id = ? AND helper_pilot_id = ? AND status = 'ACTIVE'`,
          )
          .bind(now, helpSession.session_id, account.pilot_id, helpSession.helper_pilot_id),
      );
    }
    const results = await db.batch(statements);
    if (results[0]?.meta?.changes !== 1) {
      const previous = await db
        .prepare("SELECT last_defeated_at FROM boss_cooldowns WHERE pilot_id = ? AND boss_id = ?")
        .bind(account.pilot_id, reward.bossId)
        .first<{ last_defeated_at: number }>();
      const retryAt = (previous?.last_defeated_at ?? now) + BOSS_COOLDOWN_MS;
      const minutes = Math.max(1, Math.ceil((retryAt - now) / 60_000));
      return json({ error: `Boss en cooldown. Disponible en ${minutes} min.`, retryAt }, 409);
    }
    if (
      results[1]?.meta?.changes !== 1 ||
      results.slice(2).some((result) => result.meta?.changes !== 1)
    ) {
      throw new Error("La recompensa del boss no se pudo aplicar completamente.");
    }
    if (helpSession) {
      await notifyBossHelpEnded(env, db, helpSession.session_id, account.pilot_id, "completed");
    }
    return json({
      success: true,
      bossId: reward.bossId,
      obsidian: reward.obsidian,
      cooldownUntil: now + BOSS_COOLDOWN_MS,
      helperReward: helpSession ? { credits: 50, obsidian: 1 } : null,
      rewards: drops.map(({ itemName, itemType }) => ({ itemName, itemType })),
    });
  } catch (error) {
    console.error("No se pudo aplicar la recompensa del boss:", error);
    return json({ error: "No se pudo guardar la recompensa del boss." }, 503);
  }
}

async function notifyBossHelpEnded(
  env: WorkerEnv | undefined,
  db: D1Database,
  sessionId: string,
  hostPilotId: string,
  status: "completed" | "left" | "expired",
): Promise<void> {
  if (!env?.BOSS_HELP) return;
  const membership = await db
    .prepare("SELECT alliance_id FROM alliance_members WHERE pilot_id = ?")
    .bind(hostPilotId)
    .first<{ alliance_id: string }>();
  if (!membership) return;
  const room = env.BOSS_HELP.get(env.BOSS_HELP.idFromName(membership.alliance_id));
  const response = await room.fetch(
    new Request("https://boss-help/ended", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId, status }),
    }),
  );
  if (!response.ok) {
    console.error("El Durable Object rechazó el fin del combate:", response.status);
  }
}

function parseBossEvidence(body: Record<string, unknown>): BossCombatEvidence | null {
  const startedAt = body["started_at"];
  const endedAt = body["ended_at"];
  const damageDealt = body["damage_dealt"];
  const damageReceived = body["damage_received"];
  const hits = body["hits"];
  const rawEvents = body["events"];
  if (
    !Number.isSafeInteger(startedAt) ||
    !Number.isSafeInteger(endedAt) ||
    typeof damageDealt !== "number" ||
    !Number.isFinite(damageDealt) ||
    typeof damageReceived !== "number" ||
    !Number.isFinite(damageReceived) ||
    !Number.isSafeInteger(hits) ||
    !Array.isArray(rawEvents) ||
    rawEvents.length > 512
  ) {
    return null;
  }
  const events: BossCombatEvent[] = [];
  for (const rawEvent of rawEvents) {
    if (!rawEvent || typeof rawEvent !== "object" || Array.isArray(rawEvent)) return null;
    const event = rawEvent as Record<string, unknown>;
    const type = event["type"];
    const at = event["at"];
    const damage = event["damage"];
    const count = event["count"];
    if (
      (type !== "boss_hit" &&
        type !== "minion_kill" &&
        type !== "player_hit" &&
        type !== "player_death") ||
      !Number.isSafeInteger(at) ||
      typeof damage !== "number" ||
      !Number.isFinite(damage) ||
      !Number.isSafeInteger(count) ||
      (count as number) < 1
    ) {
      return null;
    }
    events.push({ type, at: at as number, damage, count: count as number });
  }
  return {
    started_at: startedAt as number,
    ended_at: endedAt as number,
    damage_dealt: damageDealt,
    damage_received: damageReceived,
    hits: hits as number,
    events,
  };
}

function validateBossEvidence(
  evidence: BossCombatEvidence,
  attempt: {
    boss_hp: number;
    boss_damage: number;
    max_hit_damage: number;
  },
): string | null {
  if (
    evidence.damage_dealt <= 0 ||
    evidence.damage_received <= 0 ||
    evidence.hits < 1 ||
    evidence.hits > 512
  ) {
    return "El combate debe registrar daño, hits y daño recibido.";
  }
  const durationMs = evidence.ended_at - evidence.started_at;
  let previousAt = -1;
  let bossHitCount = 0;
  let bossDamage = 0;
  let receivedDamage = 0;
  for (const event of evidence.events) {
    if (event.at < previousAt || event.at < 0 || event.at > durationMs || event.damage < 0) {
      return "La secuencia de eventos del combate no es válida.";
    }
    previousAt = event.at;
    if (event.type === "boss_hit") {
      if (event.damage <= 0 || event.damage > event.count * attempt.max_hit_damage) {
        return "Un hit excede el daño máximo permitido para el boss.";
      }
      bossHitCount += event.count;
      bossDamage += event.damage;
    } else if (event.type === "player_hit") {
      if (event.damage <= 0) return "El daño recibido registrado no es válido.";
      if (event.count > 1 && event.damage / event.count <= 0) {
        return "Los hits recibidos no son válidos.";
      }
      receivedDamage += event.damage;
    } else if (event.damage !== 0) {
      return "El evento no puede registrar daño.";
    }
  }
  const tolerance = Math.max(0.01, evidence.damage_dealt * 0.001);
  const receivedTolerance = Math.max(0.01, evidence.damage_received * 0.001);
  if (
    bossHitCount !== evidence.hits ||
    Math.abs(bossDamage - evidence.damage_dealt) > tolerance ||
    Math.abs(receivedDamage - evidence.damage_received) > receivedTolerance
  ) {
    return "Los totales de daño no coinciden con la secuencia de hits.";
  }
  if (evidence.damage_dealt > evidence.hits * attempt.max_hit_damage) {
    return "Los hits registrados no pueden producir el daño declarado.";
  }
  if (evidence.damage_received > Math.max(100_000, attempt.boss_damage * 10_000)) {
    return "El daño recibido excede los límites razonables del combate.";
  }
  return null;
}

function rollChance(probability: number): boolean {
  const value = crypto.getRandomValues(new Uint32Array(1))[0]!;
  return value / 0x1_0000_0000 < probability;
}

async function handleMarketRequest(
  request: Request,
  env: WorkerEnv | undefined,
): Promise<Response | null> {
  const url = new URL(request.url);
  const isMarketPath =
    url.pathname.startsWith("/api/market/") || url.pathname.startsWith("/api/inventory/");
  const isAdminPath = url.pathname === "/api/admin/credit-obsidian";
  if (!isMarketPath && !isAdminPath) return null;
  if (!env?.DB) return json({ error: "La base de datos no está disponible en este Worker." }, 503);

  const db = env.DB;
  try {
    await ensureMarketSchema(db);
    await ensureAuthSchema(db);
  } catch (error) {
    console.error("No se pudo preparar el esquema del mercado:", error);
    return json({ error: "No se pudo preparar el mercado. Inténtalo de nuevo." }, 503);
  }

  const account = await getAuthenticatedAccount(db, await requestSessionHash(request));

  if (isAdminPath && request.method === "POST") {
    if (!isSameOriginPost(request, url)) return json({ error: "Solicitud no autorizada." }, 403);
    if (!account) return json({ error: "Inicia sesión con la cuenta administradora." }, 401);
    if (account.email.toLowerCase() !== ADMIN_EMAIL || !(await hasValidAdminSession(db, request, account.google_sub))) {
      return json({ error: "Acceso administrativo requerido." }, 403);
    }
    const body = await readJson(request);
    if (
      typeof body?.["pilotId"] !== "string" ||
      !validPilotId(body?.["pilotId"] ?? null) ||
      typeof body?.["packagesCount"] !== "number" ||
      !Number.isInteger(body["packagesCount"]) ||
      body["packagesCount"] < 1 ||
      body["packagesCount"] > 1000
    ) {
      return json({ error: "Solicitud administrativa no válida." }, 403);
    }
    const pilotId = body["pilotId"];
    const amount = body["packagesCount"] * 10;
    const now = Date.now();
    try {
      const results = await db.batch([
        db
          .prepare(
            `UPDATE pilots SET obsidian = obsidian + ?, updated_at = ?
          WHERE pilot_id = ?`,
          )
          .bind(amount, now, pilotId),
        db
          .prepare(
            `INSERT INTO admin_obsidian_logs
          (id, pilot_id, amount, reason, created_at) VALUES (?, ?, ?, ?, ?)`,
          )
          .bind(`obs_${randomHex(8)}`, pilotId, amount, "PAQUETE_ADMINISTRATIVO", now),
      ]);
      if (results[0]?.meta?.changes !== 1 || results[1]?.meta?.changes !== 1) {
        return json({ error: "No se pudo acreditar el paquete al piloto." }, 400);
      }
      const pilot = await db
        .prepare(
          "SELECT pilot_id, obsidian, boss_obsidian, callsign FROM pilots WHERE pilot_id = ?",
        )
        .bind(pilotId)
        .first<{ pilot_id: string; obsidian: number; boss_obsidian: number; callsign: string }>();
      let leaderboardUpdated = false;
      if (env.LEADERBOARD && pilot) {
        try {
          const [profile, progress] = await Promise.all([
            db
              .prepare("SELECT display_name FROM player_profiles WHERE pilot_id = ?")
              .bind(pilotId)
              .first<{ display_name: string }>(),
            db
              .prepare("SELECT progress_json FROM player_progress WHERE pilot_id = ?")
              .bind(pilotId)
              .first<{ progress_json: string }>(),
          ]);
          await upsertLeaderboardEntry(env.LEADERBOARD, {
            pilot_id: pilot.pilot_id,
            callsign: profile?.display_name.trim() || pilot.callsign.trim() || "PILOTO",
            boss_obsidian: pilot.boss_obsidian,
            score: scoreFromProgress(progress?.progress_json),
          });
          leaderboardUpdated = true;
        } catch (error) {
          console.error("No se pudo actualizar la clasificación tras acreditar obsidiana:", error);
        }
      }
      return json({
        success: true,
        credited: amount,
        obsidian: pilot?.obsidian ?? null,
        leaderboardUpdated,
      });
    } catch (error) {
      console.error("No se pudo acreditar obsidiana administrativa:", error);
      return json({ error: "No se pudo acreditar el paquete al piloto." }, 400);
    }
  }
  if (isAdminPath) return json({ error: "Método no permitido." }, 405);

  if (!account) {
    return json(
      { error: "Inicia sesión con Google para consultar tu piloto y usar el mercado." },
      401,
    );
  }

  if (!isSameOriginPost(request, url) && request.method !== "GET") {
    return json({ error: "Solicitud no autorizada." }, 403);
  }

  const pilotId = resolvePilotId(request, account.pilot_id);
  try {
    await ensurePilot(db, pilotId);
  } catch (error) {
    console.error("No se pudo inicializar el piloto del mercado:", error);
    return pilotJson(request, pilotId, { error: "No se pudo inicializar el piloto." }, 503);
  }

  if (url.pathname === "/api/inventory/state" && request.method === "GET") {
    const inventory = await db
      .prepare(
        "SELECT id, item_id, item_name, item_type, quantity, is_locked FROM pilot_inventory WHERE pilot_id = ? AND quantity > 0 ORDER BY item_type ASC, created_at ASC",
      )
      .bind(pilotId)
      .all<{
        id: string;
        item_id: string;
        item_name: string;
        item_type: "nave" | "objeto";
        quantity: number;
        is_locked: number;
      }>();
    return pilotJson(request, pilotId, {
      inventory: (inventory.results ?? []).map((item) => ({
        id: item.id,
        itemId: item.item_id,
        itemName: item.item_name,
        itemType: item.item_type,
        quantity: item.quantity,
        isLocked: item.is_locked === 1,
      })),
    });
  }

  if (url.pathname === "/api/inventory/collect" && request.method === "POST") {
    const body = await readJson(request, 1024);
    const kind = body?.["kind"];
    const definitions = {
      repair: { itemId: "repair", itemName: "REPARACIÓN" },
      magnet: { itemId: "iman", itemName: "IMÁN" },
      emp: { itemId: "emp", itemName: "EMP" },
    } as const;
    if (typeof kind !== "string" || !Object.hasOwn(definitions, kind))
      return pilotJson(request, pilotId, { error: "Objeto de combate no válido." }, 400);
    const item = definitions[kind as keyof typeof definitions];
    const now = Date.now();
    const saved = await db
      .prepare(
        "INSERT INTO pilot_inventory (id, pilot_id, item_id, item_name, item_type, quantity, is_locked, grant_source, created_at, updated_at) VALUES (?, ?, ?, ?, 'objeto', 1, 0, 'legacy', ?, ?) ON CONFLICT(pilot_id, item_id) DO UPDATE SET quantity = pilot_inventory.quantity + 1, updated_at = excluded.updated_at WHERE pilot_inventory.is_locked = 0",
      )
      .bind(`inv_${pilotId}_${item.itemId}`, pilotId, item.itemId, item.itemName, now, now)
      .run();
    if (saved.meta?.changes !== 1)
      return pilotJson(
        request,
        pilotId,
        { error: "Este objeto está reservado en el mercado y no se pudo guardar." },
        409,
      );
    const row = await db
      .prepare(
        "SELECT quantity FROM pilot_inventory WHERE pilot_id = ? AND item_id = ? AND is_locked = 0",
      )
      .bind(pilotId, item.itemId)
      .first<{ quantity: number }>();
    return pilotJson(request, pilotId, {
      success: true,
      itemId: item.itemId,
      quantity: row?.quantity ?? 0,
    });
  }

  if (url.pathname === "/api/inventory/use" && request.method === "POST") {
    const body = await readJson(request, 1024);
    const kind = body?.["kind"];
    const itemIds: Record<string, string> = { repair: "repair", magnet: "iman", emp: "emp" };
    if (typeof kind !== "string" || !Object.hasOwn(itemIds, kind))
      return pilotJson(request, pilotId, { error: "Objeto de combate no válido." }, 400);
    const used = await db
      .prepare(
        "UPDATE pilot_inventory SET quantity = quantity - 1, updated_at = ? WHERE pilot_id = ? AND item_id = ? AND item_type = 'objeto' AND is_locked = 0 AND quantity > 0",
      )
      .bind(Date.now(), pilotId, itemIds[kind]!)
      .run();
    if (used.meta?.changes !== 1)
      return pilotJson(
        request,
        pilotId,
        { error: "No tienes unidades disponibles de ese objeto." },
        409,
      );
    const row = await db
      .prepare("SELECT quantity FROM pilot_inventory WHERE pilot_id = ? AND item_id = ?")
      .bind(pilotId, itemIds[kind]!)
      .first<{ quantity: number }>();
    return pilotJson(request, pilotId, { success: true, quantity: row?.quantity ?? 0 });
  }
  if (url.pathname === "/api/market/listings" && request.method === "GET") {
    const rawPage = Number(url.searchParams.get("page") ?? "1");
    const page = Number.isSafeInteger(rawPage) && rawPage > 0 ? Math.min(rawPage, 100_000) : 1;
    const typeParam = url.searchParams.get("item_type");
    if (typeParam && typeParam !== "nave" && typeParam !== "objeto") {
      return pilotJson(request, pilotId, { error: "El filtro de artículo no es válido." }, 400);
    }
    const countryParam = url.searchParams.get("country");
    if (countryParam && !Object.hasOwn(P2P_COUNTRIES, countryParam)) {
      return pilotJson(request, pilotId, { error: "El filtro de país no es válido." }, 400);
    }
    const sort = url.searchParams.get("sort") ?? "newest";
    if (sort !== "newest" && sort !== "price_asc" && sort !== "price_desc") {
      return pilotJson(request, pilotId, { error: "El orden solicitado no es válido." }, 400);
    }
    const whereType = typeParam ? "AND ad.item_type = ?" : "";
    const whereCountry = countryParam ? "AND ad.country_code = ?" : "";
    const bindings = [...(typeParam ? [typeParam] : []), ...(countryParam ? [countryParam] : [])];
    const orderBy =
      sort === "price_asc"
        ? "ad.price_minor ASC, ad.created_at DESC"
        : sort === "price_desc"
          ? "ad.price_minor DESC, ad.created_at DESC"
          : "ad.created_at DESC";
    const [listings, total] = await Promise.all([
      db
        .prepare(
          `SELECT ad.*, ad.id AS listing_id, ad.item_id, ad.item_name, ad.item_type,
            ad.price_minor, ad.currency_code AS price_currency, ad.country_code AS country,
            COALESCE(NULLIF(profile.display_name, ''), pilot.callsign, 'PILOTO') AS seller_callsign,
            ad.created_at
          FROM p2p_ads ad
          JOIN pilots pilot ON pilot.pilot_id = ad.seller_pilot_id
          LEFT JOIN player_profiles profile ON profile.pilot_id = pilot.pilot_id
          JOIN pilot_inventory item ON item.id = ad.inventory_id
          WHERE ad.status = 'ACTIVO'
            AND item.item_id NOT IN ('obsidian', 'falcon')
                AND NOT (item.item_type = 'nave' AND item.item_id = (
                  SELECT selected_ship_id FROM pilots WHERE pilot_id = ad.seller_pilot_id
                ))
            AND NOT EXISTS (
              SELECT 1 FROM p2p_orders pending
              WHERE pending.ad_id = ad.id AND pending.status = 'PENDIENTE'
            )
            ${whereType}
            ${whereCountry}
          ORDER BY ${orderBy}
          LIMIT 20 OFFSET ?`,
        )
        .bind(...bindings, (page - 1) * 20)
        .all<
          MarketAdRow & {
            listing_id: string;
            price_currency: P2PCurrency;
            country: P2PCountry;
            seller_callsign: string;
          }
        >(),
      db
        .prepare(
          `SELECT COUNT(*) AS count FROM p2p_ads ad
          JOIN pilot_inventory item ON item.id = ad.inventory_id
          WHERE ad.status = 'ACTIVO'
            AND item.item_id NOT IN ('obsidian', 'falcon')
                AND NOT (item.item_type = 'nave' AND item.item_id = (
                  SELECT selected_ship_id FROM pilots WHERE pilot_id = ad.seller_pilot_id
                ))
            AND NOT EXISTS (
              SELECT 1 FROM p2p_orders pending
              WHERE pending.ad_id = ad.id AND pending.status = 'PENDIENTE'
            )
            ${whereType}
            ${whereCountry}`,
        )
        .bind(...bindings)
        .first<{ count: number }>(),
    ]);
    return pilotJson(request, pilotId, {
      listings: (listings.results ?? []).map((listing) => ({
        listing_id: listing.listing_id,
        item_id: listing.item_id,
        item_name: listing.item_name,
        item_type: listing.item_type,
        country: listing.country,
        price_minor: listing.price_minor ?? Math.round(listing.price * 100),
        price_currency: listing.price_currency,
        payment_methods: publicPaymentMethods(listing),
        seller_callsign: listing.seller_callsign,
        created_at: listing.created_at,
      })),
      page,
      pageSize: 20,
      total: total?.count ?? 0,
      pages: Math.ceil((total?.count ?? 0) / 20),
    });
  }

  if (url.pathname === "/api/market/buy" && request.method === "POST") {
    const body = await readJson(request, 2048);
    const listingId = body?.["listing_id"];
    if (typeof listingId !== "string" || listingId.length < 1 || listingId.length > 64) {
      return pilotJson(request, pilotId, { error: "El anuncio indicado no es válido." }, 400);
    }
    const ad = await db
      .prepare(
        `SELECT ad.id, ad.seller_pilot_id, ad.inventory_id, ad.payment_methods,
          ad.payment_details, ad.payment_data_json, ad.country_code
        FROM p2p_ads ad WHERE ad.id = ? AND ad.status = 'ACTIVO'`,
      )
      .bind(listingId)
      .first<{
        id: string;
        seller_pilot_id: string;
        inventory_id: string;
        payment_methods: string;
        payment_details: string;
        payment_data_json: string | null;
        country_code: P2PCountry;
      }>();
    if (!ad) {
      return pilotJson(request, pilotId, { error: "El anuncio ya no está disponible." }, 409);
    }
    if (ad.seller_pilot_id === pilotId) {
      return pilotJson(request, pilotId, { error: "No puedes comprar tu propio anuncio." }, 400);
    }
    const country = (P2P_COUNTRIES[ad.country_code] ? ad.country_code : "CO") as P2PCountry;
    const selectedMethod = readPaymentChoice(country, body?.["payment_method"], body?.["network"]);
    if (!selectedMethod) {
      return pilotJson(
        request,
        pilotId,
        { error: "El método de pago seleccionado no es válido." },
        400,
      );
    }
    const paymentData = paymentDataForAd(ad);
    const offeredMethods = publicPaymentMethods(ad);
    if (
      !offeredMethods.some((method) => publicPaymentMethodKey(method) === selectedMethod.key) ||
      typeof paymentData[selectedMethod.key] !== "string"
    ) {
      return pilotJson(
        request,
        pilotId,
        { error: "El vendedor no acepta ese método de pago para este anuncio." },
        400,
      );
    }
    const buyer = await db
      .prepare("SELECT obsidian FROM pilots WHERE pilot_id = ?")
      .bind(pilotId)
      .first<{ obsidian: number }>();
    if (!buyer || buyer.obsidian < 1) {
      return pilotJson(
        request,
        pilotId,
        { error: "Saldo insuficiente: se requiere 1 OBS de comisión de compra." },
        400,
      );
    }

    const now = Date.now();
    const orderId = `ord_${randomHex(12)}`;
    try {
      const order = await db
        .prepare(
          `INSERT INTO p2p_orders
          (id, ad_id, buyer_pilot_id, status, payment_method, created_at, updated_at)
        VALUES (?, ?, ?, 'PENDIENTE', ?, ?, ?)
        RETURNING id`,
        )
        .bind(orderId, listingId, pilotId, selectedMethod.key, now, now)
        .first<{ id: string }>();
      if (!order) {
        return pilotJson(
          request,
          pilotId,
          { error: "El anuncio dejó de estar disponible o ya tiene una compra pendiente." },
          409,
        );
      }
    } catch (error) {
      console.error("No se pudo crear la orden de compra:", error);
      return pilotJson(
        request,
        pilotId,
        { error: "El anuncio dejó de estar disponible o ya tiene una compra pendiente." },
        409,
      );
    }

    const orderDetails = await db
      .prepare(
        `SELECT ad.price_minor, ad.currency_code
        FROM p2p_orders order_row
        JOIN p2p_ads ad ON ad.id = order_row.ad_id
        WHERE order_row.id = ? AND order_row.buyer_pilot_id = ?
          AND order_row.status = 'PENDIENTE'`,
      )
      .bind(orderId, pilotId)
      .first<{
        price_minor: number;
        currency_code: P2PCurrency;
      }>();
    if (!orderDetails) {
      throw new Error("La orden recién creada no contiene los datos de pago.");
    }
    return pilotJson(request, pilotId, {
      order_id: orderId,
      payment_method: selectedMethod.method,
      payment_details: sanitizePaymentDetails(paymentData[selectedMethod.key]!),
      price_minor: orderDetails.price_minor,
      price_currency: orderDetails.currency_code,
      commission_obsidian: 1,
    });
  }

  if (url.pathname === "/api/market/confirm" && request.method === "POST") {
    const body = await readJson(request, 2048);
    const orderId = body?.["order_id"];
    if (typeof orderId !== "string" || orderId.length > 64) {
      return pilotJson(request, pilotId, { error: "La orden indicada no es válida." }, 400);
    }
    try {
      const result = await db
        .prepare(
          `UPDATE p2p_orders SET status = 'COMPLETADA', updated_at = ?
          WHERE id = ? AND buyer_pilot_id = ? AND status = 'PENDIENTE'
          RETURNING id`,
        )
        .bind(Date.now(), orderId, pilotId)
        .first<{ id: string }>();
      if (!result) {
        return pilotJson(
          request,
          pilotId,
          { error: "La orden no existe, no te pertenece o ya fue procesada." },
          409,
        );
      }
      return pilotJson(request, pilotId, {
        success: true,
        order_id: result.id,
        status: "COMPLETADA",
      });
    } catch (error) {
      console.error("No se pudo completar la compra del mercado:", error);
      return pilotJson(
        request,
        pilotId,
        { error: "No se pudo completar la compra; la operación fue revertida." },
        409,
      );
    }
  }

  if (url.pathname === "/api/market/cancel" && request.method === "POST") {
    const body = await readJson(request, 2048);
    const orderId = body?.["order_id"];
    if (typeof orderId !== "string" || orderId.length > 64) {
      return pilotJson(request, pilotId, { error: "La orden indicada no es válida." }, 400);
    }
    try {
      const result = await db
        .prepare(
          `UPDATE p2p_orders SET status = 'CANCELADA', updated_at = ?
          WHERE id = ? AND status = 'PENDIENTE'
            AND (
              buyer_pilot_id = ?
              OR EXISTS (
                SELECT 1 FROM p2p_ads ad
                WHERE ad.id = p2p_orders.ad_id AND ad.seller_pilot_id = ?
              )
            )
          RETURNING id`,
        )
        .bind(Date.now(), orderId, pilotId, pilotId)
        .first<{ id: string }>();
      if (!result) {
        return pilotJson(
          request,
          pilotId,
          { error: "La orden no existe, no puedes cancelarla o ya fue procesada." },
          409,
        );
      }
      return pilotJson(request, pilotId, {
        success: true,
        order_id: result.id,
        status: "CANCELADA",
      });
    } catch (error) {
      console.error("No se pudo cancelar la orden del mercado:", error);
      return pilotJson(request, pilotId, { error: "No se pudo cancelar la orden." }, 409);
    }
  }

  if (url.pathname === "/api/market/history" && request.method === "GET") {
    const orders = await db
      .prepare(
        `SELECT order_row.id AS order_id, ad.item_id, ad.item_name, ad.item_type,
          ad.price, ad.price_minor, ad.currency, ad.currency_code AS price_currency,
          ad.country_code AS country, ad.payment_methods, ad.payment_details,
          ad.payment_data_json, order_row.payment_method, order_row.status,
          order_row.created_at, order_row.updated_at,
          CASE WHEN order_row.buyer_pilot_id = ? THEN 'COMPRADOR' ELSE 'VENDEDOR' END AS role,
          CASE WHEN order_row.buyer_pilot_id = ?
            THEN COALESCE(NULLIF(seller_profile.display_name, ''), seller.callsign, 'PILOTO')
            ELSE COALESCE(NULLIF(buyer_profile.display_name, ''), buyer.callsign, 'PILOTO')
          END AS counterpart
        FROM p2p_orders order_row
        JOIN p2p_ads ad ON ad.id = order_row.ad_id
        JOIN pilots seller ON seller.pilot_id = ad.seller_pilot_id
        JOIN pilots buyer ON buyer.pilot_id = order_row.buyer_pilot_id
        LEFT JOIN player_profiles seller_profile ON seller_profile.pilot_id = seller.pilot_id
        LEFT JOIN player_profiles buyer_profile ON buyer_profile.pilot_id = buyer.pilot_id
        WHERE order_row.buyer_pilot_id = ? OR ad.seller_pilot_id = ?
        ORDER BY order_row.created_at DESC
        LIMIT 100`,
      )
      .bind(pilotId, pilotId, pilotId, pilotId)
      .all<{
        order_id: string;
        item_id: string;
        item_name: string;
        item_type: "nave" | "objeto";
        price: number;
        price_minor: number | null;
        currency: "COP" | "USD";
        price_currency: P2PCurrency | null;
        country: P2PCountry;
        payment_methods: string;
        payment_details: string;
        payment_data_json: string | null;
        payment_method: string | null;
        status: string;
        created_at: number;
        updated_at: number;
        role: "COMPRADOR" | "VENDEDOR";
        counterpart: string;
      }>();
    return pilotJson(request, pilotId, {
      orders: (orders.results ?? []).map((order) => {
        const country = (P2P_COUNTRIES[order.country] ? order.country : "CO") as P2PCountry;
        const showPayment = order.role === "COMPRADOR" && order.status === "PENDIENTE";
        const details = paymentDataForAd(order);
        const selectedKey =
          order.payment_method ?? (showPayment ? decodeMethods(order.payment_methods)[0] : null);
        return {
          order_id: order.order_id,
          item_id: order.item_id,
          item_name: order.item_name,
          item_type: order.item_type,
          country,
          price_minor: order.price_minor ?? Math.round(order.price * 100),
          price_currency: order.price_currency ?? order.currency,
          status: order.status,
          created_at: order.created_at,
          updated_at: order.updated_at,
          role: order.role,
          counterpart: order.counterpart,
          payment_method:
            showPayment && selectedKey ? publicPaymentMethodFromKey(selectedKey) : null,
          payment_details:
            showPayment && selectedKey
              ? sanitizePaymentDetails(
                  order.payment_method
                    ? (details[selectedKey] ?? "")
                    : (details[selectedKey] ?? order.payment_details),
                )
              : null,
        };
      }),
    });
  }

  if (url.pathname === "/api/market/pilot-state" && request.method === "GET") {
    const pilot = await db
      .prepare(
        `SELECT pilot_id, obsidian, callsign FROM pilots
      WHERE pilot_id = ?`,
      )
      .bind(pilotId)
      .first<{ pilot_id: string; obsidian: number; callsign: string }>();
    const inventory = await db
      .prepare(
        `SELECT id, item_id, item_name, item_type, quantity, is_locked, grant_source
      FROM pilot_inventory WHERE pilot_id = ? AND quantity > 0
        AND item_id != 'obsidian'
      ORDER BY created_at ASC`,
      )
      .bind(pilotId)
      .all<MarketInventoryRow>();
    return pilotJson(request, pilotId, {
      pilotId: pilot?.pilot_id ?? pilotId,
      obsidian: pilot?.obsidian ?? 0,
      callsign: pilot?.callsign ?? "PILOTO",
      inventory: (inventory.results ?? []).map((item) => ({
        id: item.id,
        itemId: item.item_id,
        itemName: item.item_name,
        itemType: item.item_type,
        quantity: item.quantity,
        isLocked: item.is_locked === 1,
      })),
    });
  }

  if (url.pathname === "/api/market/sync-inventory" && request.method === "POST") {
    return pilotJson(
      request,
      pilotId,
      { error: "La sincronización de inventario desde el cliente está deshabilitada." },
      410,
    );
  }

  if (url.pathname === "/api/market/my-ads" && request.method === "GET") {
    const ads = await db
      .prepare(
        `SELECT p2p_ads.* FROM p2p_ads
      JOIN pilot_inventory ON pilot_inventory.id = p2p_ads.inventory_id
      WHERE seller_pilot_id = ? AND status != 'CANCELADO'
        AND pilot_inventory.item_id != 'obsidian'
        AND NOT (pilot_inventory.item_type = 'nave' AND pilot_inventory.item_id = 'falcon')
      ORDER BY created_at DESC`,
      )
      .bind(pilotId)
      .all<MarketAdRow>();
    return pilotJson(request, pilotId, { ads: (ads.results ?? []).map(serializeAd) });
  }

  if (url.pathname === "/api/market/publish" && request.method === "POST") {
    const body = await readJson(request);
    const inventoryId = body?.["inventoryId"];
    const countryValue = body?.["country"];
    const priceMinor = body?.["priceMinor"];
    const country =
      typeof countryValue === "string" && Object.hasOwn(P2P_COUNTRIES, countryValue)
        ? (countryValue as P2PCountry)
        : null;
    const currency = country ? P2P_COUNTRIES[country].currency : null;
    const paymentChoices = country
      ? validatePaymentChoices(country, body?.["paymentMethods"])
      : null;
    const limits = currency ? P2P_PRICE_LIMITS[currency] : null;
    if (
      typeof inventoryId !== "string" ||
      inventoryId.length > 64 ||
      !country ||
      typeof priceMinor !== "number" ||
      !Number.isSafeInteger(priceMinor) ||
      !limits ||
      priceMinor < limits.min ||
      priceMinor > limits.max ||
      !paymentChoices
    ) {
      return pilotJson(request, pilotId, { error: "Los datos del anuncio no son válidos." }, 400);
    }

    const [pilot, item] = await Promise.all([
      db
        .prepare(`SELECT obsidian, selected_ship_id FROM pilots WHERE pilot_id = ?`)
        .bind(pilotId)
        .first<{ obsidian: number; selected_ship_id: string }>(),
      db
        .prepare(
          `SELECT id, item_id, item_name, item_type, quantity, is_locked, grant_source
        FROM pilot_inventory WHERE id = ? AND pilot_id = ?
          AND item_id != 'obsidian'`,
        )
        .bind(inventoryId, pilotId)
        .first<MarketInventoryRow>(),
    ]);
    if (!pilot || pilot.obsidian < 1) {
      return pilotJson(request, pilotId, { error: "Saldo insuficiente: se requiere 1 OBS." }, 400);
    }
    if (!item || item.is_locked !== 0 || item.quantity < 1 || item.item_id === "obsidian") {
      return pilotJson(
        request,
        pilotId,
        { error: "El artículo no está disponible para publicar." },
        400,
      );
    }
    if (item.item_type === "nave") {
      if (item.item_id === "falcon" || item.item_id === pilot.selected_ship_id) {
        return pilotJson(
          request,
          pilotId,
          { error: "No puedes publicar la nave básica o la nave activa." },
          400,
        );
      }
      const ships = await db
        .prepare(
          `SELECT COUNT(*) AS count FROM pilot_inventory
        WHERE pilot_id = ? AND item_type = 'nave' AND item_id != 'falcon'
            AND is_locked = 0 AND quantity > 0`,
        )
        .bind(pilotId)
        .first<{ count: number }>();
      const unlockedSecondaryShipsAfterListing = Math.max(0, (ships?.count ?? 0) - 1);
      const usableShipsAfterListing = 1 + unlockedSecondaryShipsAfterListing;
      if (usableShipsAfterListing < 1) {
        return pilotJson(
          request,
          pilotId,
          { error: "Debes conservar una nave disponible para jugar." },
          400,
        );
      }
    }

    const now = Date.now();
    const adId = `ad_${randomHex(8)}`;
    try {
      const results = await db.batch([
        db
          .prepare(
            `INSERT INTO market_publish_attempts
          (id, pilot_id, inventory_id, created_at) VALUES (?, ?, ?, ?)`,
          )
          .bind(`pub_${randomHex(8)}`, pilotId, inventoryId, now),
        db
          .prepare(
            `UPDATE pilots SET obsidian = obsidian - 1, updated_at = ?
          WHERE pilot_id = ? AND obsidian >= 1`,
          )
          .bind(now, pilotId),
        db
          .prepare(
            `UPDATE pilot_inventory SET is_locked = 1, updated_at = ?
          WHERE id = ? AND pilot_id = ? AND is_locked = 0 AND quantity > 0
            AND item_id != 'obsidian'
            AND (item_type != 'nave' OR (item_id != 'falcon'
              AND item_id != (SELECT selected_ship_id FROM pilots WHERE pilot_id = ?)))`,
          )
          .bind(now, inventoryId, pilotId, pilotId),
        db
          .prepare(
            `INSERT INTO p2p_ads
          (id, seller_pilot_id, inventory_id, item_id, item_name, item_type,
            price, price_minor, currency, currency_code, country_code,
            payment_methods, payment_details, payment_data_json,
            status, fee_paid, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVO', 1, ?, ?)`,
          )
          .bind(
            adId,
            pilotId,
            inventoryId,
            item.item_id,
            item.item_name,
            item.item_type,
            priceMinor,
            priceMinor,
            currency === "COP" || currency === "USD" ? currency : "COP",
            currency,
            country,
            JSON.stringify(
              paymentChoices.methods.map((choice) =>
                paymentMethodKey(choice.method, choice.network),
              ),
            ),
            paymentChoices.methods[0]!.details,
            JSON.stringify(paymentChoices.paymentData),
            now,
            now,
          ),
        db
          .prepare(
            "DELETE FROM market_publish_attempts WHERE pilot_id = ? AND inventory_id = ? AND created_at = ?",
          )
          .bind(pilotId, inventoryId, now),
      ]);
      if (results.some((result) => result.meta?.changes !== 1)) {
        throw new Error("Una operación de publicación no afectó exactamente una fila.");
      }
    } catch (error) {
      console.error("Transacción de publicación rechazada:", error);
      return pilotJson(
        request,
        pilotId,
        { error: "Transacción rechazada: saldo insuficiente o artículo bloqueado." },
        400,
      );
    }
    const remaining = await db
      .prepare("SELECT obsidian FROM pilots WHERE pilot_id = ?")
      .bind(pilotId)
      .first<{ obsidian: number }>();
    return pilotJson(request, pilotId, {
      success: true,
      adId,
      remainingObsidian: remaining?.obsidian ?? 0,
    });
  }

  if (url.pathname === "/api/market/toggle-ad" && request.method === "POST") {
    const body = await readJson(request);
    const adId = body?.["adId"];
    if (typeof adId !== "string") {
      return pilotJson(request, pilotId, { error: "El anuncio indicado no es válido." }, 400);
    }
    const ad = await db
      .prepare(
        `SELECT id, status FROM p2p_ads
      WHERE id = ? AND seller_pilot_id = ?`,
      )
      .bind(adId, pilotId)
      .first<{ id: string; status: MarketAdRow["status"] }>();
    if (!ad || !["ACTIVO", "PAUSADO"].includes(ad.status)) {
      return pilotJson(
        request,
        pilotId,
        { error: "El anuncio no está disponible para cambiar." },
        404,
      );
    }
    if (await hasOpenOrder(db, adId)) {
      return pilotJson(
        request,
        pilotId,
        { error: "No puedes cambiar un anuncio con una orden abierta." },
        409,
      );
    }
    const nextStatus = ad.status === "ACTIVO" ? "PAUSADO" : "ACTIVO";
    const update = await db
      .prepare(
        `UPDATE p2p_ads SET status = ?, updated_at = ?
      WHERE id = ? AND seller_pilot_id = ? AND status = ?
        AND NOT EXISTS (SELECT 1 FROM p2p_orders
          WHERE ad_id = ? AND status IN ('ABIERTA', 'PENDIENTE', 'OPEN'))`,
      )
      .bind(nextStatus, Date.now(), adId, pilotId, ad.status, adId)
      .run();
    if (update.meta?.changes !== 1) {
      return pilotJson(
        request,
        pilotId,
        { error: "El anuncio cambió o tiene una orden abierta." },
        409,
      );
    }
    return pilotJson(request, pilotId, { success: true, status: nextStatus });
  }

  if (url.pathname === "/api/market/cancel-ad" && request.method === "POST") {
    const body = await readJson(request);
    const adId = body?.["adId"];
    if (typeof adId !== "string") {
      return pilotJson(request, pilotId, { error: "El anuncio indicado no es válido." }, 400);
    }
    const ad = await db
      .prepare(
        `SELECT id, status FROM p2p_ads
      WHERE id = ? AND seller_pilot_id = ?`,
      )
      .bind(adId, pilotId)
      .first<{ id: string; status: MarketAdRow["status"] }>();
    if (!ad || !["ACTIVO", "PAUSADO"].includes(ad.status)) {
      return pilotJson(
        request,
        pilotId,
        { error: "El anuncio no está disponible para cancelar." },
        404,
      );
    }
    if (await hasOpenOrder(db, adId)) {
      return pilotJson(
        request,
        pilotId,
        { error: "No puedes cancelar un anuncio con una orden abierta." },
        409,
      );
    }
    const now = Date.now();
    try {
      const results = await db.batch([
        db
          .prepare(
            `UPDATE p2p_ads SET status = 'CANCELADO', updated_at = ?
          WHERE id = ? AND seller_pilot_id = ? AND status IN ('ACTIVO', 'PAUSADO')
            AND NOT EXISTS (SELECT 1 FROM p2p_orders
              WHERE ad_id = ? AND status IN ('ABIERTA', 'PENDIENTE', 'OPEN'))`,
          )
          .bind(now, adId, pilotId, adId),
        db
          .prepare(
            `UPDATE pilot_inventory SET is_locked = 0, updated_at = ?
          WHERE id = (SELECT inventory_id FROM p2p_ads
            WHERE id = ? AND seller_pilot_id = ? AND status = 'CANCELADO' AND updated_at = ?)
            AND pilot_id = ? AND is_locked = 1`,
          )
          .bind(now, adId, pilotId, now, pilotId),
      ]);
      if (results.some((result) => result.meta?.changes !== 1)) {
        throw new Error("La cancelación no afectó exactamente una fila por operación.");
      }
    } catch (error) {
      console.error("Transacción de cancelación rechazada:", error);
      return pilotJson(
        request,
        pilotId,
        { error: "No se pudo cancelar el anuncio; inténtalo de nuevo." },
        409,
      );
    }
    return pilotJson(request, pilotId, { success: true, refunded: false });
  }

  return pilotJson(request, pilotId, { error: "Ruta del mercado no encontrada." }, 404);
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

export default {
  async fetch(request: Request, env?: unknown) {
    try {
      const workerEnv = getWorkerEnv(request, env);
      const chatResponse = await handleChatRequest(request, workerEnv);
      if (chatResponse) return chatResponse;
      const authResponse = await handleAuthRequest(request, workerEnv);
      if (authResponse) return authResponse;
      const adminAuthResponse = await handleAdminAuthRequest(request, workerEnv);
      if (adminAuthResponse) return adminAuthResponse;
      const socialResponse = await handleSocialRequest(request, workerEnv);
      if (socialResponse) return socialResponse;
      const leaderboardResponse = await handleLeaderboardRequest(request, workerEnv);
      if (leaderboardResponse) return leaderboardResponse;
      const bossResponse = await handleBossRequest(request, workerEnv);
      if (bossResponse) return bossResponse;
      const marketResponse = await handleMarketRequest(request, workerEnv);
      if (marketResponse) return marketResponse;
      const handler = await getServerEntry();
      const response = await handler.fetch(request);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      const pathname = new URL(request.url).pathname;
      if (
        pathname.startsWith("/api/auth/") ||
        pathname.startsWith("/api/chat/") ||
        pathname.startsWith("/api/referral/") ||
        pathname.startsWith("/api/alliance/") ||
        pathname.startsWith("/api/leaderboard") ||
        pathname.startsWith("/api/bosses/") ||
        pathname.startsWith("/api/market/") ||
        pathname.startsWith("/api/admin/")
      ) {
        const detail = error instanceof Error ? error.message : String(error);
        console.error("Fallo en endpoint de API:", detail);
        return json(
          { error: `Falló una operación del servidor: ${detail || "error desconocido"}` },
          500,
        );
      }
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};

export { ChatRoom } from "./chat/chat-room";
export { BossHelpRoom } from "./game/boss-help-room";

export { WarRoom } from "./game/war-room";

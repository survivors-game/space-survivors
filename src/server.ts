import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { SHIPS } from "./game/data/ships";
import { INVENTORY_CATALOG } from "./game/data/items";
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
  PILOT_NOTIFY?: {
    idFromName(name: string): unknown;
    get(id: unknown): { fetch(request: Request): Promise<Response> };
  };
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
const BOSS_ATTEMPT_TTL_MS = 20 * 60 * 1000;
const BOSS_COMBAT_PARAMS: Record<
  string,
  { hp: number; damage: number; minCombatMs: number; maxHitDamage: number }
> = {
  leviathan: { hp: 180_000, damage: 54, minCombatMs: 60_000, maxHitDamage: 50_000 },
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
        .run();
      await db
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
      await db
        .prepare(
          `CREATE TABLE IF NOT EXISTS admin_player_status (
        pilot_id TEXT PRIMARY KEY,
        suspended_at INTEGER,
        reason TEXT,
        updated_at INTEGER NOT NULL
      )`,
        )
        .run();
      await db
        .prepare(
          `CREATE TABLE IF NOT EXISTS admin_player_logs (
        id TEXT PRIMARY KEY,
        pilot_id TEXT NOT NULL,
        action TEXT NOT NULL,
        reason TEXT NOT NULL,
        created_at INTEGER NOT NULL
      )`,
        )
        .run();
      await db
        .prepare(
          `CREATE INDEX IF NOT EXISTS idx_admin_player_logs_pilot
        ON admin_player_logs(pilot_id, created_at DESC)`,
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
  if (
    url.pathname.startsWith("/api/alliance/") ||
    url.pathname === "/api/admin/set-vip" ||
    url.pathname === "/api/admin/vip"
  ) {
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
    const isAdminVipManagementPath = url.pathname === "/api/admin/vip";
    if (!isAlliancePath && !isAdminVipPath && !isAdminVipManagementPath) return null;
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
      if (
        account.email.toLowerCase() !== ADMIN_EMAIL ||
        !(await hasValidAdminSession(db, request, account.google_sub))
      ) {
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
      await db
        .prepare(
          "CREATE TABLE IF NOT EXISTS admin_vip_logs (id TEXT PRIMARY KEY, operation_id TEXT NOT NULL UNIQUE, pilot_id TEXT NOT NULL, action TEXT NOT NULL, days INTEGER NOT NULL, before_until INTEGER, after_until INTEGER, reason TEXT NOT NULL, admin_email TEXT NOT NULL, created_at INTEGER NOT NULL)",
        )
        .run();
      const before = await db
        .prepare("SELECT vip_until FROM pilots WHERE pilot_id=?")
        .bind(pilotId)
        .first<{ vip_until: number | null }>();
      if (!before) return json({ error: "No se encontró el piloto." }, 404);
      const timestamp = Date.now();
      const vipUntil = timestamp + days * 24 * 60 * 60 * 1000;
      await db.batch([
        db
          .prepare("UPDATE pilots SET vip_until = ?, updated_at = ? WHERE pilot_id = ?")
          .bind(vipUntil, timestamp, pilotId),
        db
          .prepare(
            "INSERT INTO admin_vip_logs (id,operation_id,pilot_id,action,days,before_until,after_until,reason,admin_email,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
          )
          .bind(
            randomHex(16),
            randomHex(16),
            pilotId,
            "grant",
            days,
            before.vip_until,
            vipUntil,
            "Asignación VIP desde la ruta administrativa anterior",
            account.email,
            timestamp,
          ),
      ]);
      return json({ success: true, pilot_id: pilotId, vip_until: vipUntil });
    }

    if (isAdminVipManagementPath) {
      if (!account) return json({ error: "Inicia sesión con la cuenta administradora." }, 401);
      if (
        account.email.toLowerCase() !== ADMIN_EMAIL ||
        !(await hasValidAdminSession(db, request, account.google_sub))
      ) {
        return json({ error: "Acceso administrativo requerido." }, 403);
      }
      await db
        .prepare(
          "CREATE TABLE IF NOT EXISTS admin_vip_logs (id TEXT PRIMARY KEY, operation_id TEXT NOT NULL UNIQUE, pilot_id TEXT NOT NULL, action TEXT NOT NULL, days INTEGER NOT NULL, before_until INTEGER, after_until INTEGER, reason TEXT NOT NULL, admin_email TEXT NOT NULL, created_at INTEGER NOT NULL)",
        )
        .run();
      await db
        .prepare(
          "CREATE INDEX IF NOT EXISTS idx_admin_vip_logs_date ON admin_vip_logs(created_at DESC)",
        )
        .run();

      if (request.method === "GET") {
        const search = (url.searchParams.get("search") ?? "").trim().slice(0, 120);
        const pattern = "%" + search.toLowerCase() + "%";
        const players = await db
          .prepare(
            "SELECT p.pilot_id,COALESCE(NULLIF(profile.display_name,''),p.callsign,'PILOTO') AS callsign,pa.email,p.vip_until FROM pilots p LEFT JOIN player_accounts pa ON pa.pilot_id=p.pilot_id LEFT JOIN player_profiles profile ON profile.pilot_id=p.pilot_id WHERE ?='' OR lower(p.pilot_id) LIKE ? OR lower(p.callsign) LIKE ? OR lower(COALESCE(profile.display_name,'')) LIKE ? OR lower(COALESCE(pa.email,'')) LIKE ? ORDER BY CASE WHEN p.vip_until > ? THEN 0 ELSE 1 END,p.vip_until DESC LIMIT 200",
          )
          .bind(search, pattern, pattern, pattern, pattern, Date.now())
          .all();
        const logs = await db
          .prepare(
            "SELECT l.id,l.pilot_id,l.action,l.days,l.before_until,l.after_until,l.reason,l.admin_email,l.created_at,COALESCE(NULLIF(profile.display_name,''),p.callsign,'PILOTO') AS callsign,pa.email FROM admin_vip_logs l JOIN pilots p ON p.pilot_id=l.pilot_id LEFT JOIN player_accounts pa ON pa.pilot_id=p.pilot_id LEFT JOIN player_profiles profile ON profile.pilot_id=p.pilot_id WHERE ?='' OR lower(l.pilot_id) LIKE ? OR lower(p.callsign) LIKE ? OR lower(COALESCE(profile.display_name,'')) LIKE ? OR lower(COALESCE(pa.email,'')) LIKE ? ORDER BY l.created_at DESC LIMIT 100",
          )
          .bind(search, pattern, pattern, pattern, pattern)
          .all();
        const now = Date.now();
        const stats = await db
          .prepare(
            "SELECT SUM(CASE WHEN vip_until > ? THEN 1 ELSE 0 END) AS active,SUM(CASE WHEN vip_until > ? AND vip_until <= ? THEN 1 ELSE 0 END) AS expiring_soon FROM pilots",
          )
          .bind(now, now, now + 7 * 86400000)
          .first<{ active: number | null; expiring_soon: number | null }>();
        return json({
          players: players.results ?? [],
          logs: logs.results ?? [],
          stats: { active: stats?.active ?? 0, expiring_soon: stats?.expiring_soon ?? 0 },
        });
      }

      const body = await readJson(request);
      const action = body?.["action"];
      const operationId = body?.["operationId"];
      const recipient = body?.["recipient"];
      const days = body?.["days"];
      const reason = body?.["reason"];
      if (
        !["grant", "renew", "revoke"].includes(String(action)) ||
        typeof operationId !== "string" ||
        !/^[a-zA-Z0-9-]{16,80}$/.test(operationId) ||
        typeof reason !== "string" ||
        reason.trim().length < 5 ||
        reason.trim().length > 240
      ) {
        return json(
          {
            error:
              "Indica una operación, un motivo de 5 a 240 caracteres y un identificador válido.",
          },
          400,
        );
      }
      if (
        action !== "revoke" &&
        (typeof days !== "number" || !Number.isSafeInteger(days) || days < 1 || days > 3650)
      ) {
        return json({ error: "La duración debe estar entre 1 y 3650 días." }, 400);
      }
      const lookup = typeof recipient === "string" ? recipient.trim().slice(0, 120) : "";
      if (!lookup) return json({ error: "Indica el ID, correo o nombre del jugador." }, 400);
      const isId = validPilotId(lookup);
      const matches = await db
        .prepare(
          "SELECT p.pilot_id,p.vip_until FROM pilots p LEFT JOIN player_accounts pa ON pa.pilot_id=p.pilot_id LEFT JOIN player_profiles profile ON profile.pilot_id=p.pilot_id WHERE (?=1 AND p.pilot_id=?) OR (?=0 AND (lower(COALESCE(pa.email,''))=lower(?) OR lower(COALESCE(profile.display_name,''))=lower(?) OR lower(p.callsign)=lower(?))) LIMIT 2",
        )
        .bind(isId ? 1 : 0, lookup, isId ? 1 : 0, lookup, lookup, lookup)
        .all<{ pilot_id: string; vip_until: number | null }>();
      const found = matches.results ?? [];
      if (!found.length) return json({ error: "No se encontró el jugador." }, 404);
      if (found.length > 1)
        return json({ error: "Hay varios jugadores con ese nombre. Usa el ID o correo." }, 409);
      const target = found[0]!;
      const now = Date.now();
      const beforeUntil = target.vip_until;
      const afterUntil =
        action === "revoke"
          ? null
          : action === "grant"
            ? now + Number(days) * 86400000
            : Math.max(now, beforeUntil ?? 0) + Number(days) * 86400000;
      const timestamp = Date.now();
      await db.batch([
        db
          .prepare("UPDATE pilots SET vip_until=?,updated_at=? WHERE pilot_id=?")
          .bind(afterUntil, timestamp, target.pilot_id),
        db
          .prepare(
            "INSERT INTO admin_vip_logs (id,operation_id,pilot_id,action,days,before_until,after_until,reason,admin_email,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
          )
          .bind(
            randomHex(16),
            operationId,
            target.pilot_id,
            String(action),
            Number(days ?? 0),
            beforeUntil,
            afterUntil,
            reason.trim(),
            account.email,
            timestamp,
          ),
      ]);
      return json({
        success: true,
        pilot_id: target.pilot_id,
        action,
        days: Number(days ?? 0),
        vip_until: afterUntil,
      });
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
    await ensureRealEconomySchema(db);
  } catch (error) {
    console.error("No se pudo preparar el sistema de invitaciones:", error);
    return json({ error: "No se pudo preparar el sistema de invitaciones." }, 503);
  }

  const account = await getAuthenticatedAccount(db, await requestSessionHash(request));
  if (!account) return json({ error: "Inicia sesión con Google para usar las invitaciones." }, 401);
  if (isRedeem) await getCurrentRankingCycle(db);

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

let realEconomySchemaPromise: Promise<void> | undefined;

async function ensureRealEconomySchema(db: D1Database): Promise<void> {
  if (!realEconomySchemaPromise) {
    realEconomySchemaPromise = (async () => {
      const statements = [
        `CREATE TABLE IF NOT EXISTS vip_payment_requests (
          id TEXT PRIMARY KEY,
          pilot_id TEXT NOT NULL REFERENCES pilots(pilot_id),
          amount_cents INTEGER NOT NULL CHECK (amount_cents = 1000),
          currency TEXT NOT NULL CHECK (currency = 'USDT'),
          network TEXT NOT NULL CHECK (network = 'POLYGON'),
          tx_hash TEXT NOT NULL UNIQUE,
          wallet_address TEXT NOT NULL,
          status TEXT NOT NULL CHECK (status IN ('PENDING','APPROVED','REJECTED')),
          created_at INTEGER NOT NULL,
          reviewed_at INTEGER,
          reviewed_by TEXT,
          rejection_reason TEXT
        )`,
        `CREATE INDEX IF NOT EXISTS idx_vip_payment_status_created
          ON vip_payment_requests(status, created_at DESC)`,
        `CREATE TABLE IF NOT EXISTS vip_purchase_effects (
          vip_payment_id TEXT PRIMARY KEY REFERENCES vip_payment_requests(id),
          pilot_id TEXT NOT NULL REFERENCES pilots(pilot_id),
          vip_applied_at INTEGER
        )`,
        `CREATE TABLE IF NOT EXISTS referral_vip_rewards (
          referred_pilot_id TEXT PRIMARY KEY REFERENCES pilots(pilot_id),
          vip_payment_id TEXT NOT NULL UNIQUE REFERENCES vip_payment_requests(id),
          referrer_pilot_id TEXT NOT NULL REFERENCES pilots(pilot_id),
          amount_cents INTEGER NOT NULL CHECK (amount_cents = 100),
          created_at INTEGER NOT NULL
        )`,
        `CREATE TABLE IF NOT EXISTS real_money_ticket_ledger (
          id TEXT PRIMARY KEY,
          pilot_id TEXT NOT NULL REFERENCES pilots(pilot_id),
          delta_cents INTEGER NOT NULL CHECK (delta_cents != 0),
          kind TEXT NOT NULL CHECK (kind IN ('REFERRAL_VIP','TICKET_PAYOUT')),
          reference_id TEXT NOT NULL UNIQUE,
          created_at INTEGER NOT NULL
        )`,
        `CREATE INDEX IF NOT EXISTS idx_real_money_tickets_pilot
          ON real_money_ticket_ledger(pilot_id, created_at DESC)`,
        `CREATE TABLE IF NOT EXISTS ticket_payout_requests (
          id TEXT PRIMARY KEY,
          pilot_id TEXT NOT NULL REFERENCES pilots(pilot_id),
          amount_cents INTEGER NOT NULL CHECK (amount_cents > 0 AND amount_cents % 100 = 0),
          wallet_address TEXT NOT NULL,
          status TEXT NOT NULL CHECK (status IN ('PENDING','PAID','REJECTED')),
          tx_hash TEXT,
          reason TEXT,
          created_at INTEGER NOT NULL,
          reviewed_at INTEGER,
          reviewed_by TEXT
        )`,
        `CREATE TABLE IF NOT EXISTS player_payout_wallets (
          pilot_id TEXT PRIMARY KEY REFERENCES pilots(pilot_id),
          wallet_address TEXT NOT NULL,
          updated_at INTEGER NOT NULL
        )`,
        `CREATE INDEX IF NOT EXISTS idx_ticket_payout_status
          ON ticket_payout_requests(status, created_at DESC)`,
        `CREATE TABLE IF NOT EXISTS ranking_cycles (
          id TEXT PRIMARY KEY,
          starts_at INTEGER NOT NULL,
          ends_at INTEGER NOT NULL,
          status TEXT NOT NULL CHECK (status IN ('OPEN','CLOSED')),
          created_at INTEGER NOT NULL,
          closed_at INTEGER
        )`,
        `CREATE UNIQUE INDEX IF NOT EXISTS idx_ranking_cycles_one_open
          ON ranking_cycles(status) WHERE status = 'OPEN'`,
        `CREATE TABLE IF NOT EXISTS ranking_cycle_boss_scores (
          cycle_id TEXT NOT NULL REFERENCES ranking_cycles(id),
          pilot_id TEXT NOT NULL REFERENCES pilots(pilot_id),
          score INTEGER NOT NULL DEFAULT 0 CHECK (score >= 0),
          last_boss_obsidian INTEGER NOT NULL DEFAULT 0 CHECK (last_boss_obsidian >= 0),
          updated_at INTEGER NOT NULL,
          PRIMARY KEY (cycle_id, pilot_id)
        )`,
        `CREATE TABLE IF NOT EXISTS ranking_pool_contributions (
          id TEXT PRIMARY KEY,
          vip_payment_id TEXT NOT NULL REFERENCES vip_payment_requests(id),
          ranking_type TEXT NOT NULL CHECK (ranking_type IN ('BOSSES','REFERRALS')),
          amount_cents INTEGER NOT NULL CHECK (amount_cents = 150),
          created_at INTEGER NOT NULL,
          UNIQUE(vip_payment_id, ranking_type)
        )`,
        `CREATE TABLE IF NOT EXISTS ranking_pool_reserves (
          ranking_type TEXT PRIMARY KEY CHECK (ranking_type IN ('BOSSES','REFERRALS')),
          amount_cents INTEGER NOT NULL DEFAULT 0 CHECK (amount_cents >= 0),
          updated_at INTEGER NOT NULL
        )`,
        `INSERT OR IGNORE INTO ranking_pool_reserves (ranking_type,amount_cents,updated_at)
          VALUES ('BOSSES',0,0),('REFERRALS',0,0)`,
        `CREATE TABLE IF NOT EXISTS ranking_prize_payouts (
          id TEXT PRIMARY KEY,
          cycle_id TEXT NOT NULL REFERENCES ranking_cycles(id),
          ranking_type TEXT NOT NULL CHECK (ranking_type IN ('BOSSES','REFERRALS')),
          position INTEGER NOT NULL CHECK (position BETWEEN 1 AND 5),
          pilot_id TEXT NOT NULL REFERENCES pilots(pilot_id),
          score INTEGER NOT NULL,
          prize_cents INTEGER NOT NULL CHECK (prize_cents > 0),
          status TEXT NOT NULL CHECK (status IN ('PENDING','PAID')),
          tx_hash TEXT,
          created_at INTEGER NOT NULL,
          paid_at INTEGER,
          paid_by TEXT,
          UNIQUE(cycle_id, ranking_type, position),
          UNIQUE(cycle_id, ranking_type, pilot_id)
        )`,
        `CREATE TABLE IF NOT EXISTS real_economy_admin_logs (
          id TEXT PRIMARY KEY,
          action TEXT NOT NULL,
          reference_id TEXT NOT NULL,
          detail TEXT NOT NULL,
          admin_email TEXT NOT NULL,
          created_at INTEGER NOT NULL
        )`,
        `CREATE TABLE IF NOT EXISTS real_economy_payout_txs (
          tx_hash TEXT PRIMARY KEY,
          payout_type TEXT NOT NULL CHECK (payout_type IN ('TICKET','RANKING')),
          payout_id TEXT NOT NULL UNIQUE,
          created_at INTEGER NOT NULL
        )`,
      ];
      for (const statement of statements) await db.prepare(statement).run();
    })().catch((error) => {
      realEconomySchemaPromise = undefined;
      throw error;
    });
  }
  return realEconomySchemaPromise;
}

type RankingCycleRow = { id: string; starts_at: number; ends_at: number };

const RANKING_PRIZE_SHARES = [40, 25, 15, 12, 8] as const;
const RANKING_CYCLE_MS = 15 * 24 * 60 * 60 * 1000;
const VIP_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

async function createRankingCycle(db: D1Database, startsAt = Date.now()): Promise<RankingCycleRow> {
  const cycle = {
    id: `rank_${randomHex(10)}`,
    starts_at: startsAt,
    ends_at: startsAt + RANKING_CYCLE_MS,
  };
  try {
    await db
      .prepare(
        "INSERT INTO ranking_cycles (id,starts_at,ends_at,status,created_at) VALUES (?,?,?,'OPEN',?)",
      )
      .bind(cycle.id, cycle.starts_at, cycle.ends_at, Date.now())
      .run();
    await db
      .prepare(
        "INSERT INTO ranking_cycle_boss_scores (cycle_id,pilot_id,score,last_boss_obsidian,updated_at) SELECT ?,pilot_id,0,boss_obsidian,? FROM pilots",
      )
      .bind(cycle.id, Date.now())
      .run();
    return cycle;
  } catch (error) {
    const existing = await db
      .prepare("SELECT id,starts_at,ends_at FROM ranking_cycles WHERE status='OPEN' LIMIT 1")
      .first<RankingCycleRow>();
    if (existing) return existing;
    throw error;
  }
}

async function rankingRowsForCycle(
  db: D1Database,
  cycle: RankingCycleRow,
  rankingType: "BOSSES" | "REFERRALS",
): Promise<{ pilot_id: string; callsign: string; score: number }[]> {
  if (rankingType === "BOSSES") {
    const { results = [] } = await db
      .prepare(
        `SELECT s.pilot_id,
          COALESCE(NULLIF(profile.display_name,''),p.callsign,'PILOTO') AS callsign,
          s.score
        FROM ranking_cycle_boss_scores s
        JOIN pilots p ON p.pilot_id=s.pilot_id
        LEFT JOIN player_profiles profile ON profile.pilot_id=p.pilot_id
        WHERE s.cycle_id=? AND s.score>0
        ORDER BY s.score DESC,callsign ASC,s.pilot_id ASC LIMIT 5`,
      )
      .bind(cycle.id)
      .all<{ pilot_id: string; callsign: string; score: number }>();
    return results;
  }
  const { results = [] } = await db
    .prepare(
      `SELECT r.referrer_pilot_id AS pilot_id,
        COALESCE(NULLIF(profile.display_name,''),p.callsign,'PILOTO') AS callsign,
        COUNT(*) AS score
      FROM referrals r
      JOIN pilots p ON p.pilot_id=r.referrer_pilot_id
      LEFT JOIN player_profiles profile ON profile.pilot_id=p.pilot_id
      WHERE r.redeemed_at>=? AND r.redeemed_at<?
      GROUP BY r.referrer_pilot_id
      ORDER BY score DESC,callsign ASC,p.pilot_id ASC LIMIT 5`,
    )
    .bind(cycle.starts_at, cycle.ends_at)
    .all<{ pilot_id: string; callsign: string; score: number }>();
  return results;
}

async function finalizeRankingCycle(db: D1Database, cycle: RankingCycleRow): Promise<void> {
  const [bosses, referrals, pools, reserves] = await Promise.all([
    rankingRowsForCycle(db, cycle, "BOSSES"),
    rankingRowsForCycle(db, cycle, "REFERRALS"),
    db
      .prepare(
        "SELECT ranking_type,SUM(amount_cents) AS total FROM ranking_pool_contributions WHERE created_at>=? AND created_at<? GROUP BY ranking_type",
      )
      .bind(cycle.starts_at, cycle.ends_at)
      .all<{ ranking_type: "BOSSES" | "REFERRALS"; total: number }>(),
    db
      .prepare("SELECT ranking_type,amount_cents FROM ranking_pool_reserves")
      .all<{ ranking_type: "BOSSES" | "REFERRALS"; amount_cents: number }>(),
  ]);
  const poolByType = new Map(
    (pools.results ?? []).map((row) => [row.ranking_type, Number(row.total)]),
  );
  for (const reserve of reserves.results ?? []) {
    poolByType.set(
      reserve.ranking_type,
      (poolByType.get(reserve.ranking_type) ?? 0) + Number(reserve.amount_cents),
    );
  }
  const statements: D1Statement[] = [];
  for (const [type, rows] of [
    ["BOSSES", bosses],
    ["REFERRALS", referrals],
  ] as const) {
    const pool = poolByType.get(type) ?? 0;
    const baseAmounts = RANKING_PRIZE_SHARES.map((share) => Math.floor((pool * share) / 100));
    const roundingRemainder = pool - baseAmounts.reduce((sum, amount) => sum + amount, 0);
    let allocated = 0;
    rows.forEach((row, index) => {
      const amount =
        baseAmounts[index]! + (rows.length === 5 && index === 4 ? roundingRemainder : 0);
      if (amount <= 0) return;
      allocated += amount;
      statements.push(
        db
          .prepare(
            "INSERT OR IGNORE INTO ranking_prize_payouts (id,cycle_id,ranking_type,position,pilot_id,score,prize_cents,status,created_at) VALUES (?,?,?,?,?,?,?,'PENDING',?)",
          )
          .bind(
            "prize_" + randomHex(10),
            cycle.id,
            type,
            index + 1,
            row.pilot_id,
            row.score,
            amount,
            Date.now(),
          ),
      );
    });
    statements.push(
      db
        .prepare(
          "INSERT INTO ranking_pool_reserves (ranking_type,amount_cents,updated_at) VALUES (?,?,?) ON CONFLICT(ranking_type) DO UPDATE SET amount_cents=excluded.amount_cents,updated_at=excluded.updated_at",
        )
        .bind(type, Math.max(0, pool - allocated), Date.now()),
    );
  }
  statements.push(
    db
      .prepare("UPDATE ranking_cycles SET status='CLOSED',closed_at=? WHERE id=? AND status='OPEN'")
      .bind(Date.now(), cycle.id),
  );
  if (statements.length) await db.batch(statements);
}
async function getCurrentRankingCycle(db: D1Database, now = Date.now()): Promise<RankingCycleRow> {
  let cycle = await db
    .prepare("SELECT id,starts_at,ends_at FROM ranking_cycles WHERE status='OPEN' LIMIT 1")
    .first<RankingCycleRow>();
  if (!cycle) cycle = await createRankingCycle(db, now);
  let safety = 0;
  while (cycle.ends_at <= now && safety < 100) {
    await finalizeRankingCycle(db, cycle);
    cycle = await createRankingCycle(db, cycle.ends_at);
    safety += 1;
  }
  return cycle;
}

async function recordRankingBossProgress(
  db: D1Database,
  pilotId: string,
  currentBossObsidian: number,
): Promise<void> {
  const cycle = await getCurrentRankingCycle(db);
  const now = Date.now();
  await db
    .prepare(
      `INSERT INTO ranking_cycle_boss_scores
        (cycle_id,pilot_id,score,last_boss_obsidian,updated_at)
      VALUES (?,?,0,?,?)
      ON CONFLICT(cycle_id,pilot_id) DO UPDATE SET
        score=ranking_cycle_boss_scores.score +
          MAX(0,excluded.last_boss_obsidian-ranking_cycle_boss_scores.last_boss_obsidian),
        last_boss_obsidian=MAX(ranking_cycle_boss_scores.last_boss_obsidian,excluded.last_boss_obsidian),
        updated_at=excluded.updated_at`,
    )
    .bind(cycle.id, pilotId, currentBossObsidian, now)
    .run();
}

async function getPublicRankingPayload(db: D1Database): Promise<Record<string, unknown>> {
  const cycle = await getCurrentRankingCycle(db);
  const [bosses, referrals, pools, reserves] = await Promise.all([
    rankingRowsForCycle(db, cycle, "BOSSES"),
    rankingRowsForCycle(db, cycle, "REFERRALS"),
    db
      .prepare(
        "SELECT ranking_type,SUM(amount_cents) AS total FROM ranking_pool_contributions WHERE created_at>=? AND created_at<? GROUP BY ranking_type",
      )
      .bind(cycle.starts_at, cycle.ends_at)
      .all<{ ranking_type: "BOSSES" | "REFERRALS"; total: number }>(),
    db
      .prepare("SELECT ranking_type,amount_cents FROM ranking_pool_reserves")
      .all<{ ranking_type: "BOSSES" | "REFERRALS"; amount_cents: number }>(),
  ]);
  const poolByType = new Map(
    (pools.results ?? []).map((row) => [row.ranking_type, Number(row.total)]),
  );
  for (const reserve of reserves.results ?? []) {
    poolByType.set(
      reserve.ranking_type,
      (poolByType.get(reserve.ranking_type) ?? 0) + Number(reserve.amount_cents),
    );
  }
  const withPrizes = (
    rows: { pilot_id: string; callsign: string; score: number }[],
    type: "BOSSES" | "REFERRALS",
  ) => {
    const pool = poolByType.get(type) ?? 0;
    const baseAmounts = RANKING_PRIZE_SHARES.map((share) => Math.floor((pool * share) / 100));
    const roundingRemainder = pool - baseAmounts.reduce((sum, amount) => sum + amount, 0);
    return rows.map((row, index) => ({
      position: index + 1,
      pilot_id: row.pilot_id,
      callsign: row.callsign,
      prize_usdt:
        (baseAmounts[index]! + (rows.length === 5 && index === 4 ? roundingRemainder : 0)) / 100,
    }));
  };
  return {
    cycle_ends_at: cycle.ends_at,
    bosses: withPrizes(bosses, "BOSSES"),
    referrals: withPrizes(referrals, "REFERRALS"),
  };
}
async function handleRealEconomyRequest(
  request: Request,
  env: WorkerEnv | undefined,
): Promise<Response | null> {
  const url = new URL(request.url);
  const isVipInfo = url.pathname === "/api/vip/payment-info";
  const isVipPurchases = url.pathname === "/api/vip/purchases";
  const isTickets = url.pathname === "/api/rewards/tickets";
  const isPayoutWallet = url.pathname === "/api/rewards/wallet";
  const isRankings = url.pathname === "/api/rewards/rankings";
  const isAdmin = url.pathname === "/api/admin/real-economy";
  if (!isVipInfo && !isVipPurchases && !isTickets && !isPayoutWallet && !isRankings && !isAdmin)
    return null;
  if (!env?.DB) return json({ error: "La base de datos no está disponible." }, 503);
  if (request.method !== "GET" && request.method !== "POST") {
    return json({ error: "Método no permitido." }, 405);
  }
  if (request.method === "POST" && !isSameOriginPost(request, url)) {
    return json({ error: "Solicitud no autorizada." }, 403);
  }
  const db = env.DB;
  try {
    await ensureAuthSchema(db);
    await ensureMarketSchema(db);
    await ensureRealEconomySchema(db);
  } catch (error) {
    console.error("No se pudo preparar la economía real:", error);
    return json({ error: "No se pudo preparar la economía real." }, 503);
  }

  if (isRankings) {
    if (request.method !== "GET") return json({ error: "Método no permitido." }, 405);
    try {
      return json(await getPublicRankingPayload(db));
    } catch (error) {
      console.error("No se pudieron cargar los premios del ranking:", error);
      return json({ error: "No se pudieron cargar los premios." }, 503);
    }
  }

  const account = await getAuthenticatedAccount(db, await requestSessionHash(request));
  if (!account) return json({ error: "Inicia sesión con Google para continuar." }, 401);

  if (isAdmin) {
    if (
      account.email.toLowerCase() !== ADMIN_EMAIL ||
      !(await hasValidAdminSession(db, request, account.google_sub))
    ) {
      return json({ error: "Acceso administrativo requerido." }, 403);
    }
    if (request.method === "GET") {
      const cycle = await getCurrentRankingCycle(db);
      const [vipPayments, ticketRequests, cycles, payouts, pools, ticketBalances, totals] =
        await Promise.all([
          db
            .prepare(
              `SELECT r.*,COALESCE(NULLIF(profile.display_name,''),p.callsign,'PILOTO') AS callsign,pa.email
          FROM vip_payment_requests r JOIN pilots p ON p.pilot_id=r.pilot_id
          LEFT JOIN player_profiles profile ON profile.pilot_id=p.pilot_id
          LEFT JOIN player_accounts pa ON pa.pilot_id=p.pilot_id
          ORDER BY CASE WHEN r.status='PENDING' THEN 0 ELSE 1 END,r.created_at DESC LIMIT 100`,
            )
            .all(),
          db
            .prepare(
              `SELECT r.*,COALESCE(NULLIF(profile.display_name,''),p.callsign,'PILOTO') AS callsign,pa.email
          FROM ticket_payout_requests r JOIN pilots p ON p.pilot_id=r.pilot_id
          LEFT JOIN player_profiles profile ON profile.pilot_id=p.pilot_id
          LEFT JOIN player_accounts pa ON pa.pilot_id=p.pilot_id
          ORDER BY CASE WHEN r.status='PENDING' THEN 0 ELSE 1 END,r.created_at DESC LIMIT 100`,
            )
            .all(),
          db.prepare("SELECT * FROM ranking_cycles ORDER BY starts_at DESC LIMIT 10").all(),
          db
            .prepare(
              `SELECT r.*,COALESCE(NULLIF(profile.display_name,''),p.callsign,'PILOTO') AS callsign,
              COALESCE(wallet.wallet_address,'') AS wallet_address
          FROM ranking_prize_payouts r JOIN pilots p ON p.pilot_id=r.pilot_id
          LEFT JOIN player_profiles profile ON profile.pilot_id=p.pilot_id
          LEFT JOIN player_payout_wallets wallet ON wallet.pilot_id=r.pilot_id
          ORDER BY r.created_at DESC LIMIT 100`,
            )
            .all(),
          db
            .prepare(
              `SELECT kinds.ranking_type,
                COALESCE(contributions.total_cents,0)+COALESCE(reserves.amount_cents,0) AS total_cents
              FROM (SELECT 'BOSSES' AS ranking_type UNION ALL SELECT 'REFERRALS') kinds
              LEFT JOIN (
                SELECT ranking_type,SUM(amount_cents) AS total_cents
                FROM ranking_pool_contributions WHERE created_at>=? AND created_at<?
                GROUP BY ranking_type
              ) contributions ON contributions.ranking_type=kinds.ranking_type
              LEFT JOIN ranking_pool_reserves reserves ON reserves.ranking_type=kinds.ranking_type
              ORDER BY kinds.ranking_type`,
            )
            .bind(cycle.starts_at, cycle.ends_at)
            .all(),
          db
            .prepare(
              `SELECT p.pilot_id,COALESCE(NULLIF(profile.display_name,''),p.callsign,'PILOTO') AS callsign,pa.email,
            SUM(l.delta_cents) AS balance_cents,
            SUM(l.delta_cents)-COALESCE((SELECT SUM(r.amount_cents) FROM ticket_payout_requests r WHERE r.pilot_id=p.pilot_id AND r.status='PENDING'),0) AS available_cents
          FROM real_money_ticket_ledger l JOIN pilots p ON p.pilot_id=l.pilot_id
          LEFT JOIN player_profiles profile ON profile.pilot_id=p.pilot_id
          LEFT JOIN player_accounts pa ON pa.pilot_id=p.pilot_id
          GROUP BY p.pilot_id HAVING SUM(l.delta_cents)>0
          ORDER BY balance_cents DESC LIMIT 200`,
            )
            .all(),
          db
            .prepare(
              `SELECT
            (SELECT COUNT(*) FROM vip_payment_requests WHERE status='APPROVED') AS approved_sales,
            (SELECT COALESCE(SUM(amount_cents),0) FROM referral_vip_rewards) AS referral_paid_cents,
            (SELECT COALESCE(SUM(amount_cents),0) FROM ranking_pool_contributions) AS ranking_funded_cents,
            (SELECT COALESCE(SUM(delta_cents),0) FROM real_money_ticket_ledger WHERE kind='REFERRAL_VIP') AS tickets_issued_cents,
            (SELECT COALESCE(SUM(delta_cents),0) FROM real_money_ticket_ledger) AS tickets_outstanding_cents`,
            )
            .first<{
              approved_sales: number;
              referral_paid_cents: number;
              ranking_funded_cents: number;
              tickets_issued_cents: number;
              tickets_outstanding_cents: number;
            }>(),
        ]);
      return json({
        distribution: {
          vip_price_usd: 10,
          admin_usd: 6,
          referral_usd: 1,
          bosses_pool_usd: 1.5,
          referrals_pool_usd: 1.5,
        },
        cycle,
        pools: pools.results ?? [],
        totals: {
          ...(totals ?? {}),
          admin_earned_cents: Number(totals?.approved_sales ?? 0) * 600,
        },
        ticket_balances: ticketBalances.results ?? [],
        vip_payments: vipPayments.results ?? [],
        ticket_requests: ticketRequests.results ?? [],
        cycles: cycles.results ?? [],
        payouts: payouts.results ?? [],
      });
    }

    const body = await readJson(request, 4096);
    const action = typeof body?.["action"] === "string" ? body["action"] : "";
    const id = typeof body?.["id"] === "string" ? body["id"].trim() : "";
    const now = Date.now();
    if (action === "approve-vip") await getCurrentRankingCycle(db, now);
    const log = (referenceId: string, detail: string) =>
      db
        .prepare(
          "INSERT INTO real_economy_admin_logs (id,action,reference_id,detail,admin_email,created_at) VALUES (?,?,?,?,?,?)",
        )
        .bind(randomHex(12), action, referenceId, detail.slice(0, 240), account.email, now);

    if (action === "approve-vip") {
      const payment = await db
        .prepare("SELECT id,pilot_id,status FROM vip_payment_requests WHERE id=?")
        .bind(id)
        .first<{ id: string; pilot_id: string; status: string }>();
      if (!payment) return json({ error: "No se encontró la compra VIP." }, 404);
      if (payment.status !== "PENDING") return json({ error: "Esta compra ya fue revisada." }, 409);
      const results = await db.batch([
        db
          .prepare(
            "UPDATE vip_payment_requests SET status='APPROVED',reviewed_at=?,reviewed_by=? WHERE id=? AND status='PENDING'",
          )
          .bind(now, account.email, id),
        db
          .prepare(
            "INSERT OR IGNORE INTO vip_purchase_effects (vip_payment_id,pilot_id,vip_applied_at) SELECT id,pilot_id,NULL FROM vip_payment_requests WHERE id=? AND status='APPROVED' AND changes()=1",
          )
          .bind(id),
        db
          .prepare(
            "UPDATE pilots SET vip_until=MAX(COALESCE(vip_until,0),?)+?,updated_at=? WHERE pilot_id=? AND EXISTS (SELECT 1 FROM vip_purchase_effects WHERE vip_payment_id=? AND vip_applied_at IS NULL)",
          )
          .bind(now, VIP_DURATION_MS, now, payment.pilot_id, id),
        db
          .prepare(
            "UPDATE vip_purchase_effects SET vip_applied_at=? WHERE vip_payment_id=? AND vip_applied_at IS NULL AND changes()=1",
          )
          .bind(now, id),
        db
          .prepare(
            `INSERT OR IGNORE INTO referral_vip_rewards (referred_pilot_id,vip_payment_id,referrer_pilot_id,amount_cents,created_at)
          SELECT p.pilot_id,?,p.referred_by,100,? FROM pilots p
          JOIN vip_purchase_effects e ON e.pilot_id=p.pilot_id
          WHERE e.vip_payment_id=? AND e.vip_applied_at=? AND p.referred_by IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM referral_vip_rewards r WHERE r.referred_pilot_id=p.pilot_id)`,
          )
          .bind(id, now, id, now),
        db
          .prepare(
            `INSERT OR IGNORE INTO real_money_ticket_ledger (id,pilot_id,delta_cents,kind,reference_id,created_at)
          SELECT ?,referrer_pilot_id,100,'REFERRAL_VIP',?,? FROM referral_vip_rewards WHERE vip_payment_id=?`,
          )
          .bind(`ticket_${randomHex(10)}`, id, now, id),
        db
          .prepare(
            `INSERT OR IGNORE INTO ranking_pool_contributions (id,vip_payment_id,ranking_type,amount_cents,created_at)
          SELECT ?,?,'BOSSES',150,? WHERE EXISTS (SELECT 1 FROM vip_purchase_effects WHERE vip_payment_id=? AND vip_applied_at=?)
          UNION ALL
          SELECT ?,?,'REFERRALS',150,? WHERE EXISTS (SELECT 1 FROM vip_purchase_effects WHERE vip_payment_id=? AND vip_applied_at=?)`,
          )
          .bind(
            `pool_${randomHex(10)}`,
            id,
            now,
            id,
            now,
            `pool_${randomHex(10)}`,
            id,
            now,
            id,
            now,
          ),
        log(id, "Compra VIP aprobada; membresía, referido y fondos de ranking procesados."),
      ]);
      if (
        results[0]?.meta?.changes !== 1 ||
        results[1]?.meta?.changes !== 1 ||
        results[2]?.meta?.changes !== 1 ||
        results[3]?.meta?.changes !== 1
      ) {
        return json({ error: "No se pudo aplicar la compra VIP de forma segura." }, 409);
      }
      return json({ success: true, status: "APPROVED" });
    }

    if (action === "reject-vip") {
      const reason =
        typeof body?.["reason"] === "string" ? body["reason"].trim().slice(0, 240) : "";
      if (reason.length < 5) return json({ error: "Escribe un motivo de rechazo." }, 400);
      const result = await db
        .prepare(
          "UPDATE vip_payment_requests SET status='REJECTED',reviewed_at=?,reviewed_by=?,rejection_reason=? WHERE id=? AND status='PENDING'",
        )
        .bind(now, account.email, reason, id)
        .run();
      if (result.meta?.changes !== 1) return json({ error: "La compra ya fue revisada." }, 409);
      await log(id, "Compra VIP rechazada: " + reason).run();
      return json({ success: true, status: "REJECTED" });
    }

    if (action === "pay-ticket") {
      const txHash =
        typeof body?.["tx_hash"] === "string" ? body["tx_hash"].trim().toLowerCase() : "";
      if (!/^0x[a-f0-9]{64}$/.test(txHash))
        return json({ error: "Introduce el TX hash del pago." }, 400);
      const result = await db.batch([
        db
          .prepare(
            "INSERT OR IGNORE INTO real_economy_payout_txs (tx_hash,payout_type,payout_id,created_at) SELECT ?,'TICKET',?,? WHERE EXISTS (SELECT 1 FROM ticket_payout_requests WHERE id=? AND status='PENDING')",
          )
          .bind(txHash, id, now, id),
        db
          .prepare(
            "UPDATE ticket_payout_requests SET status='PAID',tx_hash=?,reviewed_at=?,reviewed_by=? WHERE id=? AND status='PENDING' AND EXISTS (SELECT 1 FROM real_economy_payout_txs WHERE tx_hash=? AND payout_type='TICKET' AND payout_id=?)",
          )
          .bind(txHash, now, account.email, id, txHash, id),
        db
          .prepare(
            `INSERT INTO real_money_ticket_ledger (id,pilot_id,delta_cents,kind,reference_id,created_at)
          SELECT ?,pilot_id,-amount_cents,'TICKET_PAYOUT',?,? FROM ticket_payout_requests
          WHERE id=? AND status='PAID' AND changes()=1`,
          )
          .bind(`ticket_${randomHex(10)}`, id, now, id),
        log(id, "Solicitud de tickets pagada · TX " + txHash),
      ]);
      if (
        result[0]?.meta?.changes !== 1 ||
        result[1]?.meta?.changes !== 1 ||
        result[2]?.meta?.changes !== 1
      )
        return json(
          {
            error:
              "La solicitud ya fue procesada, el TX ya fue usado o no se pudo descontar el saldo.",
          },
          409,
        );
      return json({ success: true, status: "PAID" });
    }

    if (action === "reject-ticket") {
      const reason =
        typeof body?.["reason"] === "string" ? body["reason"].trim().slice(0, 240) : "";
      if (reason.length < 5) return json({ error: "Escribe un motivo de rechazo." }, 400);
      const result = await db
        .prepare(
          "UPDATE ticket_payout_requests SET status='REJECTED',reason=?,reviewed_at=?,reviewed_by=? WHERE id=? AND status='PENDING'",
        )
        .bind(reason, now, account.email, id)
        .run();
      if (result.meta?.changes !== 1) return json({ error: "La solicitud ya fue procesada." }, 409);
      await log(id, "Solicitud de tickets rechazada: " + reason).run();
      return json({ success: true, status: "REJECTED" });
    }

    if (action === "pay-prize") {
      const payout = await db
        .prepare(
          "SELECT r.pilot_id,COALESCE(wallet.wallet_address,'') AS wallet_address FROM ranking_prize_payouts r LEFT JOIN player_payout_wallets wallet ON wallet.pilot_id=r.pilot_id WHERE r.id=? AND r.status='PENDING'",
        )
        .bind(id)
        .first<{ pilot_id: string; wallet_address: string }>();
      if (!payout) return json({ error: "No se encontró el premio pendiente." }, 404);
      if (!/^0x[a-fA-F0-9]{40}$/.test(payout.wallet_address))
        return json({ error: "El ganador todavía no ha registrado su wallet Polygon." }, 409);
      const txHash =
        typeof body?.["tx_hash"] === "string" ? body["tx_hash"].trim().toLowerCase() : "";
      if (!/^0x[a-f0-9]{64}$/.test(txHash))
        return json({ error: "Introduce el TX hash del premio." }, 400);
      const result = await db.batch([
        db
          .prepare(
            "INSERT OR IGNORE INTO real_economy_payout_txs (tx_hash,payout_type,payout_id,created_at) SELECT ?,'RANKING',?,? WHERE EXISTS (SELECT 1 FROM ranking_prize_payouts WHERE id=? AND status='PENDING')",
          )
          .bind(txHash, id, now, id),
        db
          .prepare(
            "UPDATE ranking_prize_payouts SET status='PAID',tx_hash=?,paid_at=?,paid_by=? WHERE id=? AND status='PENDING' AND EXISTS (SELECT 1 FROM real_economy_payout_txs WHERE tx_hash=? AND payout_type='RANKING' AND payout_id=?)",
          )
          .bind(txHash, now, account.email, id, txHash, id),
        log(id, "Premio de ranking pagado · TX " + txHash),
      ]);
      if (result[0]?.meta?.changes !== 1 || result[1]?.meta?.changes !== 1)
        return json({ error: "El premio ya fue pagado, el TX ya fue usado o no existe." }, 409);
      return json({ success: true, status: "PAID" });
    }

    return json({ error: "Operación económica no válida." }, 400);
  }

  if (isVipInfo) {
    if (request.method !== "GET") return json({ error: "Método no permitido." }, 405);
    const settings = await db
      .prepare("SELECT wallet_address,qr_url FROM admin_payment_settings WHERE id=1")
      .first<{ wallet_address: string; qr_url: string | null }>();
    return json({
      price_usdt: 10,
      network: "POLYGON",
      wallet_address: settings?.wallet_address ?? "",
      qr_url: settings?.qr_url ?? null,
    });
  }

  if (isVipPurchases) {
    if (request.method === "GET") {
      const rows = await db
        .prepare(
          "SELECT id,amount_cents,currency,network,tx_hash,status,created_at,reviewed_at,rejection_reason FROM vip_payment_requests WHERE pilot_id=? ORDER BY created_at DESC LIMIT 20",
        )
        .bind(account.pilot_id)
        .all();
      return json({ purchases: rows.results ?? [] });
    }
    const body = await readJson(request, 2048);
    const txHash =
      typeof body?.["tx_hash"] === "string" ? body["tx_hash"].trim().toLowerCase() : "";
    if (!/^0x[a-f0-9]{64}$/.test(txHash))
      return json({ error: "Introduce un TX hash válido de Polygon." }, 400);
    const settings = await db
      .prepare("SELECT wallet_address FROM admin_payment_settings WHERE id=1")
      .first<{ wallet_address: string }>();
    if (!settings?.wallet_address)
      return json(
        { error: "La administración todavía no ha configurado la wallet de cobro." },
        503,
      );
    const duplicateObs = await db
      .prepare("SELECT id FROM obsidian_payment_requests WHERE lower(tx_hash)=? LIMIT 1")
      .bind(txHash)
      .first<{ id: string }>();
    if (duplicateObs) return json({ error: "Este TX ya fue utilizado en otra solicitud." }, 409);
    const id = `vip_${randomHex(10)}`;
    try {
      await db
        .prepare(
          "INSERT INTO vip_payment_requests (id,pilot_id,amount_cents,currency,network,tx_hash,wallet_address,status,created_at) VALUES (?,?,1000,'USDT','POLYGON',?,?,'PENDING',?)",
        )
        .bind(id, account.pilot_id, txHash, settings.wallet_address, Date.now())
        .run();
    } catch {
      return json({ error: "Este TX ya fue registrado o no se pudo crear la solicitud." }, 409);
    }
    return json({ success: true, id, status: "PENDING", amount_usdt: 10 });
  }

  if (isPayoutWallet) {
    if (request.method === "GET") {
      const wallet = await db
        .prepare("SELECT wallet_address,updated_at FROM player_payout_wallets WHERE pilot_id=?")
        .bind(account.pilot_id)
        .first<{ wallet_address: string; updated_at: number }>();
      return json({
        wallet_address: wallet?.wallet_address ?? "",
        updated_at: wallet?.updated_at ?? null,
      });
    }
    const body = await readJson(request, 1024);
    const walletAddress =
      typeof body?.["wallet_address"] === "string" ? body["wallet_address"].trim() : "";
    if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress))
      return json({ error: "Introduce una dirección válida de Polygon." }, 400);
    const now = Date.now();
    await db
      .prepare(
        `INSERT INTO player_payout_wallets (pilot_id,wallet_address,updated_at) VALUES (?,?,?)
      ON CONFLICT(pilot_id) DO UPDATE SET wallet_address=excluded.wallet_address,updated_at=excluded.updated_at`,
      )
      .bind(account.pilot_id, walletAddress, now)
      .run();
    return json({ success: true, wallet_address: walletAddress, updated_at: now });
  }

  if (isTickets) {
    if (request.method === "GET") {
      const [balance, requests, history] = await Promise.all([
        db
          .prepare(
            "SELECT COALESCE(SUM(delta_cents),0) AS total FROM real_money_ticket_ledger WHERE pilot_id=?",
          )
          .bind(account.pilot_id)
          .first<{ total: number }>(),
        db
          .prepare(
            "SELECT id,amount_cents,wallet_address,status,tx_hash,reason,created_at,reviewed_at FROM ticket_payout_requests WHERE pilot_id=? ORDER BY created_at DESC LIMIT 20",
          )
          .bind(account.pilot_id)
          .all(),
        db
          .prepare(
            "SELECT delta_cents,kind,created_at FROM real_money_ticket_ledger WHERE pilot_id=? ORDER BY created_at DESC LIMIT 50",
          )
          .bind(account.pilot_id)
          .all(),
      ]);
      const pending = await db
        .prepare(
          "SELECT COALESCE(SUM(amount_cents),0) AS total FROM ticket_payout_requests WHERE pilot_id=? AND status='PENDING'",
        )
        .bind(account.pilot_id)
        .first<{ total: number }>();
      const total = Number(balance?.total ?? 0);
      const reserved = Number(pending?.total ?? 0);
      return json({
        balance_cents: total,
        available_cents: Math.max(0, total - reserved),
        requests: requests.results ?? [],
        history: history.results ?? [],
      });
    }
    const body = await readJson(request, 2048);
    const amount = body?.["amount_usd"];
    const wallet =
      typeof body?.["wallet_address"] === "string" ? body["wallet_address"].trim() : "";
    if (typeof amount !== "number" || !Number.isSafeInteger(amount) || amount < 1 || amount > 10000)
      return json({ error: "Indica una cantidad entera de al menos 1 USDT." }, 400);
    if (!/^0x[a-fA-F0-9]{40}$/.test(wallet))
      return json(
        { error: "Introduce una dirección válida de Polygon para recibir el pago." },
        400,
      );
    const id = `tpay_${randomHex(10)}`;
    const cents = amount * 100;
    const result = await db
      .prepare(
        `INSERT INTO ticket_payout_requests (id,pilot_id,amount_cents,wallet_address,status,created_at)
      SELECT ?,?, ?,?,'PENDING',?
      WHERE (SELECT COALESCE(SUM(delta_cents),0) FROM real_money_ticket_ledger WHERE pilot_id=?)
        - (SELECT COALESCE(SUM(amount_cents),0) FROM ticket_payout_requests WHERE pilot_id=? AND status='PENDING') >= ?`,
      )
      .bind(
        id,
        account.pilot_id,
        cents,
        wallet,
        Date.now(),
        account.pilot_id,
        account.pilot_id,
        cents,
      )
      .run();
    if (result.meta?.changes !== 1)
      return json({ error: "No tienes suficientes tickets disponibles para esa solicitud." }, 409);
    return json({ success: true, id, status: "PENDING" });
  }

  return json({ error: "Ruta de economía real no encontrada." }, 404);
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
    await ensureRealEconomySchema(db);
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
    await recordRankingBossProgress(
      db,
      account.pilot_id,
      typeof bossObsidian === "number" && Number.isSafeInteger(bossObsidian) && bossObsidian >= 0
        ? bossObsidian
        : 0,
    );
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
      if ((await readGameSetting(db, "registration_enabled", "true")) !== "true") {
        return googleRedirect(`${url.origin}/?google_error=registration_closed`);
      }
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
  const account = await db
    .prepare(`SELECT google_sub, email, pilot_id FROM player_accounts WHERE google_sub = ?`)
    .bind(session.wallet_address.slice("google:".length))
    .first<PlayerAccount>();
  if (!account) return null;
  const playerStatus = await db
    .prepare("SELECT suspended_at FROM admin_player_status WHERE pilot_id = ?")
    .bind(account.pilot_id)
    .first<{ suspended_at: number | null }>();
  return playerStatus?.suspended_at ? null : account;
}

async function hasValidAdminSession(
  db: D1Database,
  request: Request,
  googleSub: string,
): Promise<boolean> {
  const token = readCookie(request, ADMIN_SESSION_COOKIE);
  if (!token) return false;
  const session = await db
    .prepare(
      "SELECT token_hash FROM admin_sessions WHERE token_hash = ? AND google_sub = ? AND expires_at > ?",
    )
    .bind(await sha256Hex(token), googleSub, Date.now())
    .first<{ token_hash: string }>();
  return Boolean(session);
}

function adminSessionCookie(token: string, maxAge: number): string {
  return (
    ADMIN_SESSION_COOKIE +
    "=" +
    token +
    "; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=" +
    maxAge
  );
}

async function handleAdminAuthRequest(
  request: Request,
  env: WorkerEnv | undefined,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (
    ![
      "/api/admin/auth/login",
      "/api/admin/auth/status",
      "/api/admin/auth/logout",
      "/api/admin/reset-test-progress",
    ].includes(url.pathname)
  )
    return null;
  if (!env?.DB) return json({ error: "La base de datos no está disponible." }, 503);
  const db = env.DB;
  try {
    await ensureAuthSchema(db);
  } catch (error) {
    console.error("No se pudo preparar la autenticación administrativa:", error);
    return json({ error: "No se pudo preparar el acceso administrativo." }, 503);
  }
  const account = await getAuthenticatedAccount(db, await requestSessionHash(request));
  if (!account || account.email.toLowerCase() !== ADMIN_EMAIL)
    return json({ error: "Acceso administrativo no autorizado." }, 403);
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS admin_access_logs (
    id TEXT PRIMARY KEY, event TEXT NOT NULL, result TEXT NOT NULL,
    ip_hash TEXT NOT NULL, admin_email TEXT NOT NULL, created_at INTEGER NOT NULL
  )`,
    )
    .run();
  const accessIpHash = await sha256Hex(request.headers.get("cf-connecting-ip") ?? "unknown");
  const recordAccess = async (event: string, result: string) => {
    await db
      .prepare(
        "INSERT INTO admin_access_logs (id,event,result,ip_hash,admin_email,created_at) VALUES (?,?,?,?,?,?)",
      )
      .bind(randomHex(16), event, result, accessIpHash, account.email, Date.now())
      .run();
  };
  if (url.pathname === "/api/admin/reset-test-progress") {
    if (request.method !== "POST") return json({ error: "Método no permitido." }, 405);
    if (!isSameOriginPost(request, url)) return json({ error: "Solicitud no autorizada." }, 403);
    if (!(await hasValidAdminSession(db, request, account.google_sub))) {
      return json({ error: "Acceso administrativo requerido." }, 403);
    }
    const body = await readJson(request, 1024);
    if (body?.["confirmation"] !== "REINICIAR PRUEBAS") {
      return json({ error: "Escribe REINICIAR PRUEBAS para confirmar." }, 400);
    }
    try {
      await ensureMarketSchema(db);
      await ensureRealEconomySchema(db);
      const now = Date.now();
      const results = await db.batch([
        db.prepare(
          "INSERT OR IGNORE INTO player_progress (pilot_id,progress_json,updated_at) SELECT pilot_id,?,? FROM pilots",
        ).bind(DEFAULT_REFERRAL_PROGRESS, now),
        db.prepare(
          "UPDATE player_progress SET progress_json=?,updated_at=? WHERE pilot_id IN (SELECT pilot_id FROM pilots)",
        ).bind(DEFAULT_REFERRAL_PROGRESS, now),
        db.prepare(
          "UPDATE pilots SET obsidian=0,boss_obsidian=0,selected_ship_id='falcon',updated_at=?",
        ).bind(now),
        db.prepare(
          "DELETE FROM pilot_inventory WHERE id NOT IN (SELECT inventory_id FROM p2p_ads) AND NOT (item_id='falcon' AND item_type='nave')",
        ),
        db.prepare(
          "UPDATE pilot_inventory SET quantity=0,updated_at=? WHERE item_type='objeto' AND is_locked=0",
        ).bind(now),
        db.prepare(
          "UPDATE pilot_inventory SET quantity=0,updated_at=? WHERE item_type='nave' AND item_id!='falcon' AND id NOT IN (SELECT inventory_id FROM p2p_ads WHERE status IN ('ACTIVO','PAUSADO'))",
        ).bind(now),
        db.prepare("DELETE FROM boss_cooldowns"),
        db.prepare("DELETE FROM boss_attempts"),
        db.prepare(
          "UPDATE ranking_cycle_boss_scores SET score=0,last_boss_obsidian=0,updated_at=?",
        ).bind(now),
        db.prepare(
          "DELETE FROM auth_sessions WHERE wallet_address LIKE 'google:%' AND wallet_address != ?",
        ).bind("google:" + account.google_sub),
        db.prepare(
          "INSERT INTO admin_access_logs (id,event,result,ip_hash,admin_email,created_at) VALUES (?,?,?,?,?,?)",
        ).bind(randomHex(16), "test_progress_reset", "success", accessIpHash, account.email, now),
      ]);
      if (env.LEADERBOARD) await env.LEADERBOARD.delete(LEADERBOARD_KEY);
      return json({
        success: true,
        resetAt: now,
        players: results[2]?.meta?.changes ?? 0,
        preserved: [
          "cuentas Google",
          "perfiles y nombres",
          "VIP y pagos",
          "tickets y solicitudes de cobro",
          "registros económicos y auditoría",
          "referidos y operaciones P2P",
        ],
      });
    } catch (error) {
      console.error("No se pudo reiniciar el progreso de prueba:", error);
      return json({ error: "No se pudo completar el reinicio del progreso." }, 409);
    }
  }
  if (url.pathname === "/api/admin/auth/status") {
    if (request.method !== "GET") return json({ error: "Método no permitido." }, 405);
    return json({ authenticated: await hasValidAdminSession(db, request, account.google_sub) });
  }
  if (request.method !== "POST") return json({ error: "Método no permitido." }, 405);
  if (!isSameOriginPost(request, url)) return json({ error: "Solicitud no autorizada." }, 403);
  if (url.pathname === "/api/admin/auth/logout") {
    const token = readCookie(request, ADMIN_SESSION_COOKIE);
    if (token)
      await db
        .prepare("DELETE FROM admin_sessions WHERE token_hash = ?")
        .bind(await sha256Hex(token))
        .run();
    await recordAccess("logout", "success");
    return json({ authenticated: false }, 200, {
      "set-cookie":
        ADMIN_SESSION_COOKIE + "=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0",
    });
  }
  if (!env.ADMIN_PANEL_PASSWORD || env.ADMIN_PANEL_PASSWORD.length < 16)
    return json({ error: "El acceso administrativo aún no está configurado." }, 503);
  const ipHash = await sha256Hex(request.headers.get("cf-connecting-ip") ?? "unknown");
  const now = Date.now();
  const attempts = await db
    .prepare(
      "SELECT attempts, window_started_at, blocked_until FROM admin_login_attempts WHERE ip_hash = ?",
    )
    .bind(ipHash)
    .first<{ attempts: number; window_started_at: number; blocked_until: number }>();
  if (attempts?.blocked_until && attempts.blocked_until > now) {
    await recordAccess("login", "blocked");
    return json({ error: "Demasiados intentos. Inténtalo más tarde." }, 429);
  }
  const body = await readJson(request, 2048);
  const suppliedPassword = typeof body?.["password"] === "string" ? body["password"] : "";
  const expectedHash = await sha256Hex(env.ADMIN_PANEL_PASSWORD);
  const suppliedHash = await sha256Hex(suppliedPassword);
  let difference = 0;
  for (let i = 0; i < expectedHash.length; i += 1)
    difference |= expectedHash.charCodeAt(i) ^ suppliedHash.charCodeAt(i);
  if (!suppliedPassword || difference !== 0) {
    const inWindow = Boolean(attempts && attempts.window_started_at > now - ADMIN_LOGIN_WINDOW_MS);
    const nextAttempts = inWindow ? attempts!.attempts + 1 : 1;
    const windowStartedAt = inWindow ? attempts!.window_started_at : now;
    const blockedUntil = nextAttempts >= ADMIN_LOGIN_MAX_ATTEMPTS ? now + ADMIN_LOGIN_WINDOW_MS : 0;
    await db
      .prepare(
        "INSERT INTO admin_login_attempts (ip_hash, attempts, window_started_at, blocked_until) VALUES (?, ?, ?, ?) ON CONFLICT(ip_hash) DO UPDATE SET attempts=excluded.attempts, window_started_at=excluded.window_started_at, blocked_until=excluded.blocked_until",
      )
      .bind(ipHash, nextAttempts, windowStartedAt, blockedUntil)
      .run();
    await recordAccess("login", blockedUntil ? "blocked" : "failed");
    return json(
      {
        error: blockedUntil
          ? "Demasiados intentos. Acceso bloqueado durante 15 minutos."
          : "Contraseña incorrecta.",
      },
      blockedUntil ? 429 : 401,
    );
  }
  await db.prepare("DELETE FROM admin_login_attempts WHERE ip_hash = ?").bind(ipHash).run();
  await recordAccess("login", "success");
  const token = randomHex(32);
  const expiresAt = now + ADMIN_SESSION_TTL_MS;
  await db
    .prepare(
      "INSERT INTO admin_sessions (token_hash, google_sub, created_at, expires_at) VALUES (?, ?, ?, ?)",
    )
    .bind(await sha256Hex(token), account.google_sub, now, expiresAt)
    .run();
  return json({ authenticated: true, expiresAt }, 200, {
    "set-cookie": adminSessionCookie(token, Math.floor(ADMIN_SESSION_TTL_MS / 1000)),
  });
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
        `CREATE TABLE IF NOT EXISTS admin_economy_logs (
          id TEXT PRIMARY KEY,
          pilot_id TEXT NOT NULL REFERENCES pilots(pilot_id),
          currency TEXT NOT NULL CHECK (currency IN ('CR', 'OBS')),
          delta INTEGER NOT NULL CHECK (delta != 0),
          balance_before INTEGER NOT NULL,
          balance_after INTEGER NOT NULL CHECK (balance_after >= 0),
          reason TEXT NOT NULL,
          admin_email TEXT NOT NULL,
          created_at INTEGER NOT NULL
        )`,
        `CREATE INDEX IF NOT EXISTS idx_admin_economy_logs_created
          ON admin_economy_logs(created_at DESC)`,
        `CREATE INDEX IF NOT EXISTS idx_admin_economy_logs_pilot
          ON admin_economy_logs(pilot_id, created_at DESC)`,
        `CREATE TABLE IF NOT EXISTS admin_payment_settings (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          wallet_address TEXT NOT NULL DEFAULT '',
          qr_url TEXT,
          updated_by TEXT NOT NULL,
          updated_at INTEGER NOT NULL
        )`,
        `CREATE TABLE IF NOT EXISTS obsidian_payment_requests (
          id TEXT PRIMARY KEY,
          pilot_id TEXT NOT NULL REFERENCES pilots(pilot_id),
          obsidian_amount INTEGER NOT NULL CHECK (obsidian_amount > 0),
          crypto_amount TEXT NOT NULL,
          currency TEXT NOT NULL CHECK (currency IN ('USDT', 'USDC')),
          network TEXT NOT NULL CHECK (network = 'POLYGON'),
          tx_hash TEXT NOT NULL UNIQUE,
          wallet_address TEXT NOT NULL,
          status TEXT NOT NULL CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
          created_at INTEGER NOT NULL,
          reviewed_at INTEGER,
          reviewed_by TEXT,
          rejection_reason TEXT
        )`,
        `CREATE INDEX IF NOT EXISTS idx_obsidian_payment_status_created
          ON obsidian_payment_requests(status, created_at DESC)`,
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
        `CREATE TABLE IF NOT EXISTS p2p_disputes (
          id TEXT PRIMARY KEY,
          order_id TEXT NOT NULL UNIQUE REFERENCES p2p_orders(id),
          opened_by_pilot_id TEXT NOT NULL REFERENCES pilots(pilot_id),
          reason TEXT NOT NULL,
          evidence_url TEXT,
          status TEXT NOT NULL DEFAULT 'OPEN'
            CHECK (status IN ('OPEN', 'RESOLVED_BUYER', 'RESOLVED_SELLER')),
          created_at INTEGER NOT NULL,
          resolved_at INTEGER,
          resolved_by TEXT,
          resolution_note TEXT
        )`,
        `CREATE INDEX IF NOT EXISTS idx_p2p_disputes_status_created
          ON p2p_disputes(status, created_at DESC)`,
        `CREATE TABLE IF NOT EXISTS p2p_dispute_messages (
          id TEXT PRIMARY KEY,
          dispute_id TEXT NOT NULL REFERENCES p2p_disputes(id),
          author_pilot_id TEXT NOT NULL REFERENCES pilots(pilot_id),
          message TEXT NOT NULL,
          evidence_url TEXT,
          created_at INTEGER NOT NULL
        )`,
        `CREATE INDEX IF NOT EXISTS idx_p2p_dispute_messages_dispute
          ON p2p_dispute_messages(dispute_id, created_at)`,
        `DROP INDEX IF EXISTS idx_p2p_orders_one_active_per_ad`,
        `CREATE UNIQUE INDEX IF NOT EXISTS idx_p2p_orders_one_active_per_ad
          ON p2p_orders(ad_id) WHERE status IN ('PENDIENTE', 'PAGO_REPORTADO', 'DISPUTA')`,
        `CREATE TABLE IF NOT EXISTS admin_market_logs (
          id TEXT PRIMARY KEY,
          order_id TEXT,
          ad_id TEXT,
          action TEXT NOT NULL,
          resolution_note TEXT NOT NULL,
          admin_email TEXT NOT NULL,
          created_at INTEGER NOT NULL
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
        `DROP TRIGGER IF EXISTS market_publish_pilot_guard`,
        `DROP TRIGGER IF EXISTS market_publish_inventory_guard`,
        `DROP TRIGGER IF EXISTS market_publish_require_guards`,
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
                WHERE ad_id = OLD.id AND status IN ('ABIERTA', 'PENDIENTE', 'PAGO_REPORTADO', 'DISPUTA', 'OPEN')
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
        `DROP TRIGGER IF EXISTS market_order_confirm_guard`,
        `DROP TRIGGER IF EXISTS market_order_confirm_apply`,
        `CREATE TRIGGER IF NOT EXISTS market_order_confirm_guard
          BEFORE UPDATE OF status ON p2p_orders
          WHEN NEW.status = 'COMPLETADA' AND OLD.status != 'COMPLETADA'
          BEGIN
            SELECT CASE WHEN OLD.status NOT IN ('PENDIENTE', 'PAGO_REPORTADO')
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
          WHEN NEW.status = 'COMPLETADA' AND OLD.status IN ('PENDIENTE', 'PAGO_REPORTADO')
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
      if (!(orderColumns.results ?? []).some((column) => column.name === "buyer_paid_at")) {
        await db.prepare("ALTER TABLE p2p_orders ADD COLUMN buyer_paid_at INTEGER").run();
      }
      await db
        .prepare(
          "CREATE UNIQUE INDEX IF NOT EXISTS idx_p2p_orders_one_active_per_ad ON p2p_orders(ad_id) WHERE status IN ('PENDIENTE', 'PAGO_REPORTADO', 'DISPUTA')",
        )
        .run();
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
                AND p2p_orders.status IN ('ABIERTA', 'PENDIENTE', 'PAGO_REPORTADO', 'DISPUTA', 'OPEN')
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
    WHERE ad_id = ? AND status IN ('ABIERTA', 'PENDIENTE', 'PAGO_REPORTADO', 'DISPUTA', 'OPEN') LIMIT 1`,
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

    const vipStatus = await db
      .prepare("SELECT vip_until FROM pilots WHERE pilot_id = ?")
      .bind(account.pilot_id)
      .first<{ vip_until: number | null }>();
    const vipActive = vipStatus?.vip_until !== null && (vipStatus?.vip_until ?? 0) > now;
    const shipDropChance = vipActive ? 0.15 : reward.shipChance;
    const itemDropChance = vipActive ? 0.2 : reward.itemChance;
    const rewardId = claimId;
    await ensurePilotRewardLogs(db);
    const drops: { itemId: string; itemName: string; itemType: "nave" | "objeto" }[] = [];
    if (rollChance(shipDropChance)) {
      drops.push({
        itemId: `boss_ship_${reward.bossId}_${reward.rank.toLowerCase()}`,
        itemName: `Nave de combate · Rango ${reward.rank}`,
        itemType: "nave",
      });
    }
    if (rollChance(itemDropChance)) {
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
      db
        .prepare(
          `INSERT INTO boss_reward_logs (reward_id, pilot_id, boss_id, obsidian, drops_json, created_at)
          SELECT ?, ?, ?, ?, ?, ?
          WHERE EXISTS (
            SELECT 1 FROM boss_cooldowns
            WHERE pilot_id = ? AND boss_id = ? AND last_reward_id = ?
          )`,
        )
        .bind(
          rewardId,
          account.pilot_id,
          reward.bossId,
          reward.obsidian,
          JSON.stringify(
            drops.map((drop) => ({
              type: drop.itemType === "nave" ? "nave" : "objeto",
              name: drop.itemName,
            })),
          ),
          now,
          account.pilot_id,
          reward.bossId,
          rewardId,
        ),
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
    await notifyPilotRewards(env, account.pilot_id);
    if (helpSession) {
      await notifyBossHelpEnded(env, db, helpSession.session_id, account.pilot_id, "completed");
    }
    return json({
      success: true,
      result,
      bossId: reward.bossId,
      obsidian: reward.obsidian,
      rewards: drops.map(({ itemName, itemType }) => ({ itemName, itemType })),
      helperReward: helpSession ? { credits: 50, obsidian: 1 } : null,
      cooldownUntil: now + BOSS_COOLDOWN_MS,
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

let announcementColorColumnReady = false;

async function handleAnnouncementsRequest(
  request: Request,
  env: WorkerEnv | undefined,
): Promise<Response | null> {
  const url = new URL(request.url);
  const isPublic = url.pathname === "/api/announcements";
  const isAdmin = url.pathname === "/api/admin/announcements";
  if (!isPublic && !isAdmin) return null;
  if (isPublic && request.method !== "GET") return json({ error: "Método no permitido." }, 405);
  if (isAdmin && request.method !== "GET" && request.method !== "POST")
    return json({ error: "Método no permitido." }, 405);
  if (!env?.DB) return json({ error: "La base de datos no está disponible." }, 503);
  if (isAdmin && request.method === "POST" && !isSameOriginPost(request, url))
    return json({ error: "Solicitud no autorizada." }, 403);

  const db = env.DB;
  try {
    await ensureAuthSchema(db);
    await db
      .prepare(
        "CREATE TABLE IF NOT EXISTS admin_announcements (id TEXT PRIMARY KEY, title TEXT NOT NULL, type TEXT NOT NULL, message TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'PUBLISHED', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)",
      )
      .run();
    await db
      .prepare(
        "CREATE INDEX IF NOT EXISTS idx_admin_announcements_status_updated ON admin_announcements(status, updated_at DESC)",
      )
      .run();
    await db
      .prepare(
        "CREATE TABLE IF NOT EXISTS admin_announcement_logs (id TEXT PRIMARY KEY, announcement_id TEXT NOT NULL, action TEXT NOT NULL, title TEXT NOT NULL, admin_email TEXT NOT NULL, created_at INTEGER NOT NULL)",
      )
      .run();
    await db
      .prepare(
        "CREATE INDEX IF NOT EXISTS idx_admin_announcement_logs_created ON admin_announcement_logs(created_at DESC)",
      )
      .run();
    if (!announcementColorColumnReady) {
      try {
        await db.prepare("ALTER TABLE admin_announcements ADD COLUMN color TEXT").run();
      } catch {
        // La columna ya existe.
      }
      announcementColorColumnReady = true;
    }
  } catch (error) {
    console.error("No se pudo preparar el sistema de anuncios:", error);
    return json({ error: "No se pudo preparar el sistema de anuncios." }, 503);
  }

  if (isPublic) {
    const announcements = await db
      .prepare(
        "SELECT id, title, type, message, color, created_at, updated_at FROM admin_announcements WHERE status = 'PUBLISHED' ORDER BY updated_at DESC LIMIT 10",
      )
      .all();
    return json({ announcements: announcements.results ?? [] });
  }

  const account = await getAuthenticatedAccount(db, await requestSessionHash(request));
  if (!account) return json({ error: "Inicia sesión con la cuenta administradora." }, 401);
  if (
    account.email.toLowerCase() !== ADMIN_EMAIL ||
    !(await hasValidAdminSession(db, request, account.google_sub))
  )
    return json({ error: "Acceso administrativo requerido." }, 403);

  if (request.method === "GET") {
    const [announcements, logs] = await Promise.all([
      db
        .prepare(
          "SELECT id, title, type, message, status, color, created_at, updated_at FROM admin_announcements ORDER BY updated_at DESC LIMIT 100",
        )
        .all(),
      db
        .prepare(
          "SELECT announcement_id, action, title, admin_email, created_at FROM admin_announcement_logs ORDER BY created_at DESC LIMIT 100",
        )
        .all(),
    ]);
    return json({ announcements: announcements.results ?? [], logs: logs.results ?? [] });
  }

  const body = await readJson(request, 8192);
  const action = body?.["action"];
  const id = typeof body?.["id"] === "string" ? body["id"].trim() : "";
  const title = typeof body?.["title"] === "string" ? body["title"].trim() : "";
  const message = typeof body?.["message"] === "string" ? body["message"].trim() : "";
  const type = body?.["type"];
  const status = body?.["status"];
  const rawColor = body?.["color"];
  const color =
    typeof rawColor === "string" && /^#[0-9a-f]{6}$/i.test(rawColor.trim())
      ? rawColor.trim().toLowerCase()
      : null;
  if (!["create", "update", "delete"].includes(String(action)))
    return json({ error: "Acción de anuncio no válida." }, 400);
  if (action !== "delete") {
    if (title.length < 3 || title.length > 90)
      return json({ error: "El título debe tener entre 3 y 90 caracteres." }, 400);
    if (message.length < 5 || message.length > 2000)
      return json({ error: "El mensaje debe tener entre 5 y 2000 caracteres." }, 400);
    if (!["NOTICIA", "EVENTO", "MANTENIMIENTO", "TEMPORADA"].includes(String(type)))
      return json({ error: "Selecciona un tipo de anuncio válido." }, 400);
    if (status !== "PUBLISHED" && status !== "DRAFT")
      return json({ error: "Selecciona si el anuncio estará publicado o en borrador." }, 400);
  }
  if (action !== "create" && !/^[a-f0-9-]{36}$/i.test(id))
    return json({ error: "Anuncio no válido." }, 400);

  const now = Date.now();
  let announcementId = id;
  if (action === "create") {
    announcementId = crypto.randomUUID();
    await db
      .prepare(
        "INSERT INTO admin_announcements (id, title, type, message, status, color, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .bind(announcementId, title, type, message, status, color, now, now)
      .run();
  } else if (action === "update") {
    const result = await db
      .prepare(
        "UPDATE admin_announcements SET title = ?, type = ?, message = ?, status = ?, color = ?, updated_at = ? WHERE id = ?",
      )
      .bind(title, type, message, status, color, now, id)
      .run();
    if (!result.meta?.changes) return json({ error: "El anuncio no existe." }, 404);
  } else {
    const existing = await db
      .prepare("SELECT title FROM admin_announcements WHERE id = ?")
      .bind(id)
      .first<{ title: string }>();
    if (!existing) return json({ error: "El anuncio no existe." }, 404);
    await db.prepare("DELETE FROM admin_announcements WHERE id = ?").bind(id).run();
    await db
      .prepare(
        "INSERT INTO admin_announcement_logs (id, announcement_id, action, title, admin_email, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .bind(crypto.randomUUID(), id, "delete", existing.title, account.email, now)
      .run();
    return json({ success: true });
  }

  await db
    .prepare(
      "INSERT INTO admin_announcement_logs (id, announcement_id, action, title, admin_email, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(crypto.randomUUID(), announcementId, action, title, account.email, now)
    .run();
  return json({ success: true, id: announcementId });
}

async function handleAdminSummaryRequest(
  request: Request,
  env: WorkerEnv | undefined,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== "/api/admin/summary") return null;
  if (request.method !== "GET") return json({ error: "Método no permitido." }, 405);
  if (!env?.DB) return json({ error: "La base de datos no está disponible." }, 503);

  const db = env.DB;
  try {
    await ensureAuthSchema(db);
  } catch (error) {
    console.error("No se pudo preparar la autenticación del resumen:", error);
    return json({ error: "No se pudo preparar el resumen administrativo." }, 503);
  }

  const account = await getAuthenticatedAccount(db, await requestSessionHash(request));
  if (!account) return json({ error: "Inicia sesión con la cuenta administradora." }, 401);
  if (
    account.email.toLowerCase() !== ADMIN_EMAIL ||
    !(await hasValidAdminSession(db, request, account.google_sub))
  ) {
    return json({ error: "Acceso administrativo requerido." }, 403);
  }

  try {
    await ensureMarketSchema(db);
    await db
      .prepare(
        `CREATE TABLE IF NOT EXISTS admin_server_errors (
          id TEXT PRIMARY KEY, route TEXT NOT NULL, error_message TEXT NOT NULL,
          created_at INTEGER NOT NULL
        )`,
      )
      .run();
  } catch (error) {
    console.error("No se pudo preparar el resumen administrativo:", error);
    return json({ error: "No se pudo preparar el resumen administrativo." }, 503);
  }

  const count = async (sql: string, values: unknown[] = []): Promise<number> => {
    try {
      const row = await db
        .prepare(sql)
        .bind(...values)
        .first<Record<string, unknown>>();
      return Number(row?.["count"] ?? 0);
    } catch {
      return 0;
    }
  };
  const rows = async (sql: string, values: unknown[] = []): Promise<Record<string, unknown>[]> => {
    try {
      const result = await db
        .prepare(sql)
        .bind(...values)
        .all<Record<string, unknown>>();
      return result.results ?? [];
    } catch {
      return [];
    }
  };

  const now = Date.now();
  const [
    players,
    activeSessions,
    pendingPayments,
    openDisputes,
    openSupport,
    openReports,
    recentErrors,
  ] = await Promise.all([
    count(
      "SELECT COUNT(*) AS count FROM pilots p JOIN player_accounts pa ON pa.pilot_id = p.pilot_id",
    ),
    count(
      "SELECT COUNT(*) AS count FROM auth_sessions WHERE wallet_address LIKE 'google:%' AND expires_at > ?",
      [now],
    ),
    count("SELECT COUNT(*) AS count FROM obsidian_payment_requests WHERE status = 'PENDING'"),
    count("SELECT COUNT(*) AS count FROM p2p_disputes WHERE status = 'OPEN'"),
    count("SELECT COUNT(*) AS count FROM support_tickets WHERE status IN ('OPEN','IN_PROGRESS')"),
    count("SELECT COUNT(*) AS count FROM chat_reports WHERE status = 'OPEN'"),
    count("SELECT COUNT(*) AS count FROM admin_server_errors WHERE created_at > ?", [
      now - 86400000,
    ]),
  ]);

  const [payments, disputes, support, reports, errors] = await Promise.all([
    rows(
      "SELECT id,created_at,'Pago OBS pendiente' AS type,CAST(obsidian_amount AS TEXT) || ' OBS · ' || currency AS detail,status FROM obsidian_payment_requests WHERE status='PENDING' ORDER BY created_at DESC LIMIT 10",
    ),
    rows(
      "SELECT id,created_at,'Disputa P2P' AS type,reason AS detail,status FROM p2p_disputes WHERE status='OPEN' ORDER BY created_at DESC LIMIT 10",
    ),
    rows(
      "SELECT id,created_at,'Ticket de soporte' AS type,subject AS detail,status FROM support_tickets WHERE status IN ('OPEN','IN_PROGRESS') ORDER BY created_at DESC LIMIT 10",
    ),
    rows(
      "SELECT id,created_at,'Denuncia de chat' AS type,reason AS detail,status FROM chat_reports WHERE status='OPEN' ORDER BY created_at DESC LIMIT 10",
    ),
    rows(
      "SELECT id,created_at,'Error del servidor' AS type,route || ': ' || error_message AS detail,'INCIDENCIA' AS status FROM admin_server_errors WHERE created_at > ? ORDER BY created_at DESC LIMIT 10",
      [now - 86400000],
    ),
  ]);

  const alerts = [...payments, ...disputes, ...support, ...reports, ...errors]
    .map((row) => ({
      id: String(row["id"] ?? crypto.randomUUID()),
      created_at: Number(row["created_at"] ?? 0),
      type: String(row["type"] ?? "Aviso"),
      detail: String(row["detail"] ?? "").slice(0, 240),
      status: String(row["status"] ?? "PENDIENTE"),
    }))
    .sort((a, b) => b.created_at - a.created_at)
    .slice(0, 20);

  return json({
    stats: {
      players,
      activeSessions,
      pendingPayments,
      openDisputes,
      alerts: openSupport + openReports + recentErrors + pendingPayments + openDisputes,
    },
    alerts,
  });
}

async function handleAdminConfigRequest(
  request: Request,
  env: WorkerEnv | undefined,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== "/api/admin/config") return null;
  if (request.method !== "GET" && request.method !== "POST")
    return json({ error: "Método no permitido." }, 405);
  if (request.method === "POST" && !isSameOriginPost(request, url))
    return json({ error: "Solicitud no autorizada." }, 403);
  if (!env?.DB) return json({ error: "La base de datos no está disponible." }, 503);
  const db = env.DB;
  const account = await getAuthenticatedAccount(db, await requestSessionHash(request));
  if (!account) return json({ error: "Inicia sesión con la cuenta administradora." }, 401);
  if (
    account.email.toLowerCase() !== ADMIN_EMAIL ||
    !(await hasValidAdminSession(db, request, account.google_sub))
  )
    return json({ error: "Acceso administrativo requerido." }, 403);
  try {
    await ensureAuthSchema(db);
    await db
      .prepare(
        `CREATE TABLE IF NOT EXISTS admin_game_settings (
      setting_key TEXT PRIMARY KEY, setting_value TEXT NOT NULL, updated_at INTEGER NOT NULL
    )`,
      )
      .run();
    await db
      .prepare(
        `CREATE TABLE IF NOT EXISTS admin_game_settings_logs (
      id TEXT PRIMARY KEY, setting_key TEXT NOT NULL, old_value TEXT NOT NULL,
      new_value TEXT NOT NULL, reason TEXT NOT NULL, admin_email TEXT NOT NULL, created_at INTEGER NOT NULL
    )`,
      )
      .run();
    await db
      .prepare(
        "CREATE INDEX IF NOT EXISTS idx_admin_game_settings_logs_created ON admin_game_settings_logs(created_at DESC)",
      )
      .run();
    const defaults: Record<string, string> = {
      maintenance_mode: "false",
      registration_enabled: "true",
      maintenance_message: "Estamos realizando tareas de mantenimiento. Vuelve pronto.",
      events_enabled: "true",
      rewards_enabled: "true",
    };
    for (const [key, value] of Object.entries(defaults)) {
      await db
        .prepare(
          "INSERT OR IGNORE INTO admin_game_settings (setting_key,setting_value,updated_at) VALUES (?,?,?)",
        )
        .bind(key, value, Date.now())
        .run();
    }
  } catch (error) {
    console.error("No se pudo preparar la configuración administrativa:", error);
    return json({ error: "No se pudo preparar la configuración administrativa." }, 503);
  }
  if (request.method === "GET") {
    const [settings, logs] = await Promise.all([
      db.prepare("SELECT setting_key,setting_value,updated_at FROM admin_game_settings").all(),
      db
        .prepare(
          "SELECT setting_key,old_value,new_value,reason,admin_email,created_at FROM admin_game_settings_logs ORDER BY created_at DESC LIMIT 100",
        )
        .all(),
    ]);
    const values: Record<string, string> = {};
    for (const row of settings.results ?? [])
      values[String(row["setting_key"])] = String(row["setting_value"]);
    return json({
      settings: {
        maintenanceMode: values["maintenance_mode"] === "true",
        registrationEnabled: values["registration_enabled"] !== "false",
        maintenanceMessage: values["maintenance_message"] ?? "",
        eventsEnabled: values["events_enabled"] !== "false",
        rewardsEnabled: values["rewards_enabled"] !== "false",
      },
      logs: logs.results ?? [],
    });
  }
  const body = await readJson(request, 4096);
  const settings = body?.["settings"];
  const reason = typeof body?.["reason"] === "string" ? body["reason"].trim().slice(0, 240) : "";
  if (!settings || typeof settings !== "object" || Array.isArray(settings))
    return json({ error: "No se recibieron ajustes válidos." }, 400);
  if (reason.length < 5) return json({ error: "Escribe un motivo de al menos 5 caracteres." }, 400);
  const input = settings as Record<string, unknown>;
  const allowed: Record<string, unknown> = {
    maintenance_mode: input["maintenanceMode"],
    registration_enabled: input["registrationEnabled"],
    maintenance_message: input["maintenanceMessage"],
    events_enabled: input["eventsEnabled"],
    rewards_enabled: input["rewardsEnabled"],
  };
  const updates: Array<{ key: string; value: string; oldValue: string }> = [];
  for (const [key, value] of Object.entries(allowed)) {
    if (value === undefined) continue;
    if (key === "maintenance_message") {
      if (typeof value !== "string" || value.trim().length < 5 || value.length > 500)
        return json(
          { error: "El mensaje de mantenimiento debe tener entre 5 y 500 caracteres." },
          400,
        );
    } else if (typeof value !== "boolean")
      return json({ error: "Uno de los interruptores contiene un valor no válido." }, 400);
    const old = await db
      .prepare("SELECT setting_value FROM admin_game_settings WHERE setting_key=?")
      .bind(key)
      .first<{ setting_value: string }>();
    const nextValue = typeof value === "boolean" ? String(value) : value.trim();
    if ((old?.setting_value ?? "") !== nextValue)
      updates.push({ key, value: nextValue, oldValue: old?.setting_value ?? "" });
  }
  if (!updates.length) return json({ success: true, changed: 0 });
  const now = Date.now();
  await db.batch(
    updates.flatMap((item) => [
      db
        .prepare(
          "INSERT INTO admin_game_settings (setting_key,setting_value,updated_at) VALUES (?,?,?) ON CONFLICT(setting_key) DO UPDATE SET setting_value=excluded.setting_value,updated_at=excluded.updated_at",
        )
        .bind(item.key, item.value, now),
      db
        .prepare(
          "INSERT INTO admin_game_settings_logs (id,setting_key,old_value,new_value,reason,admin_email,created_at) VALUES (?,?,?,?,?,?,?)",
        )
        .bind(crypto.randomUUID(), item.key, item.oldValue, item.value, reason, account.email, now),
    ]),
  );
  return json({ success: true, changed: updates.length });
}

async function readGameSetting(db: D1Database, key: string, fallback: string): Promise<string> {
  try {
    const row = await db
      .prepare("SELECT setting_value FROM admin_game_settings WHERE setting_key=?")
      .bind(key)
      .first<{ setting_value: string }>();
    return row?.setting_value ?? fallback;
  } catch {
    return fallback;
  }
}

async function handleMaintenanceGate(
  request: Request,
  env: WorkerEnv | undefined,
): Promise<Response | null> {
  if (!env?.DB || (await readGameSetting(env.DB, "maintenance_mode", "false")) !== "true")
    return null;
  const pathname = new URL(request.url).pathname;
  if (pathname.startsWith("/api/admin/") || pathname.startsWith("/api/auth/")) return null;
  const account = await getAuthenticatedAccount(env.DB, await requestSessionHash(request));
  if (account?.email.toLowerCase() === ADMIN_EMAIL) return null;
  const message = await readGameSetting(
    env.DB,
    "maintenance_message",
    "Estamos realizando tareas de mantenimiento. Vuelve pronto.",
  );
  if (pathname.startsWith("/api/")) return json({ error: message, maintenance: true }, 503);
  const safe = message
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
  return new Response(
    `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Mantenimiento</title><body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#070b18;color:#e8eefc;font:16px system-ui;text-align:center"><main style="max-width:560px;padding:32px"><h1>SPACE SURVIVORS</h1><p>${safe}</p></main></body></html>`,
    {
      status: 503,
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
    },
  );
}

async function handleAdminSecurityRequest(
  request: Request,
  env: WorkerEnv | undefined,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== "/api/admin/security") return null;
  if (request.method !== "GET") return json({ error: "Método no permitido." }, 405);
  if (!env?.DB) return json({ error: "La base de datos no está disponible." }, 503);
  const db = env.DB;
  const account = await getAuthenticatedAccount(db, await requestSessionHash(request));
  if (!account) return json({ error: "Inicia sesión con la cuenta administradora." }, 401);
  if (
    account.email.toLowerCase() !== ADMIN_EMAIL ||
    !(await hasValidAdminSession(db, request, account.google_sub))
  )
    return json({ error: "Acceso administrativo requerido." }, 403);

  try {
    await ensureAuthSchema(db);
    await ensureMarketSchema(db);
    await ensureRealEconomySchema(db);
    await db
      .prepare(
        `CREATE TABLE IF NOT EXISTS admin_access_logs (
      id TEXT PRIMARY KEY, event TEXT NOT NULL, result TEXT NOT NULL,
      ip_hash TEXT NOT NULL, admin_email TEXT NOT NULL, created_at INTEGER NOT NULL
    )`,
      )
      .run();
    await db
      .prepare(
        "CREATE INDEX IF NOT EXISTS idx_admin_access_logs_created ON admin_access_logs(created_at DESC)",
      )
      .run();
    await db
      .prepare(
        `CREATE TABLE IF NOT EXISTS admin_server_errors (
      id TEXT PRIMARY KEY, route TEXT NOT NULL, error_message TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )`,
      )
      .run();
    await db
      .prepare(
        "CREATE INDEX IF NOT EXISTS idx_admin_server_errors_created ON admin_server_errors(created_at DESC)",
      )
      .run();
  } catch (error) {
    console.error("No se pudo preparar seguridad y auditoría:", error);
    return json({ error: "No se pudo preparar seguridad y auditoría." }, 503);
  }

  const query = async (sql: string): Promise<Record<string, unknown>[]> => {
    try {
      const result = await db.prepare(sql).all();
      return (result.results ?? []) as Record<string, unknown>[];
    } catch {
      return [];
    }
  };
  const [
    access,
    attempts,
    errors,
    economy,
    player,
    market,
    chat,
    announcements,
    support,
    rewards,
    seasons,
    alliances,
    vip,
    payments,
    realEconomy,
  ] = await Promise.all([
    query(
      "SELECT id,event,result,ip_hash,admin_email,created_at FROM admin_access_logs ORDER BY created_at DESC LIMIT 100",
    ),
    query(
      "SELECT ip_hash,attempts,window_started_at,blocked_until FROM admin_login_attempts WHERE attempts > 0 ORDER BY blocked_until DESC,window_started_at DESC LIMIT 100",
    ),
    query(
      "SELECT id,route,error_message,created_at FROM admin_server_errors ORDER BY created_at DESC LIMIT 100",
    ),
    query(
      "SELECT id,pilot_id,'economy' AS category,currency AS action,reason,admin_email,created_at FROM admin_economy_logs ORDER BY created_at DESC LIMIT 100",
    ),
    query(
      "SELECT id,pilot_id,'players' AS category,action,reason,'Registro anterior' AS admin_email,created_at FROM admin_player_logs ORDER BY created_at DESC LIMIT 100",
    ),
    query(
      "SELECT id,COALESCE(order_id,ad_id,'') AS pilot_id,'market' AS category,action,resolution_note AS reason,admin_email,created_at FROM admin_market_logs ORDER BY created_at DESC LIMIT 100",
    ),
    query(
      "SELECT id,COALESCE(target_pilot_id,'') AS pilot_id,'chat' AS category,action,reason,admin_email,created_at FROM admin_chat_logs ORDER BY created_at DESC LIMIT 100",
    ),
    query(
      "SELECT id,announcement_id AS pilot_id,'announcements' AS category,action,title AS reason,admin_email,created_at FROM admin_announcement_logs ORDER BY created_at DESC LIMIT 100",
    ),
    query(
      "SELECT id,ticket_id AS pilot_id,'support' AS category,action,note AS reason,admin_email,created_at FROM admin_support_logs ORDER BY created_at DESC LIMIT 100",
    ),
    query(
      "SELECT id,pilot_id,'rewards' AS category,reward_type || ': ' || reward_name AS action,reason,admin_email,created_at FROM admin_reward_logs ORDER BY created_at DESC LIMIT 100",
    ),
    query(
      "SELECT id,event_id AS pilot_id,'seasons' AS category,action,event_name AS reason,admin_email,created_at FROM admin_season_event_logs ORDER BY created_at DESC LIMIT 100",
    ),
    query(
      "SELECT id,COALESCE(target_pilot_id,alliance_id,war_id,'') AS pilot_id,'alliances' AS category,action,reason,admin_email,created_at FROM admin_alliance_logs ORDER BY created_at DESC LIMIT 100",
    ),
    query(
      "SELECT id,pilot_id,'vip' AS category,action,reason,admin_email,created_at FROM admin_vip_logs ORDER BY created_at DESC LIMIT 100",
    ),
    query(
      "SELECT id,pilot_id,'payments' AS category,status AS action,COALESCE(rejection_reason,'Revisión de pago') AS reason,COALESCE(reviewed_by,'') AS admin_email,reviewed_at AS created_at FROM obsidian_payment_requests WHERE reviewed_at IS NOT NULL ORDER BY reviewed_at DESC LIMIT 100",
    ),
    query(
      "SELECT id,reference_id AS pilot_id,'real_economy' AS category,action,detail AS reason,admin_email,created_at FROM real_economy_admin_logs ORDER BY created_at DESC LIMIT 100",
    ),
  ]);
  const operations = [
    ...economy,
    ...player,
    ...market,
    ...chat,
    ...announcements,
    ...support,
    ...rewards,
    ...seasons,
    ...alliances,
    ...vip,
    ...payments,
    ...realEconomy,
  ]
    .sort(
      (a, b) =>
        Number((b as { created_at?: number }).created_at ?? 0) -
        Number((a as { created_at?: number }).created_at ?? 0),
    )
    .slice(0, 200);
  const now = Date.now();
  const summary = {
    failedLogins: access.filter((row) =>
      ["failed", "blocked"].includes(String((row as { result?: string }).result)),
    ).length,
    blockedIps: attempts.filter(
      (row) => Number((row as { blocked_until?: number }).blocked_until ?? 0) > now,
    ).length,
    errors24h: errors.filter(
      (row) => Number((row as { created_at?: number }).created_at ?? 0) > now - 86400000,
    ).length,
    operations: operations.length,
  };
  return json({ summary, access, attempts, errors, operations });
}

async function handleAdminAlliancesRequest(
  request: Request,
  env: WorkerEnv | undefined,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== "/api/admin/alliances") return null;
  if (request.method !== "GET" && request.method !== "POST")
    return json({ error: "Método no permitido." }, 405);
  if (request.method === "POST" && !isSameOriginPost(request, url))
    return json({ error: "Solicitud no autorizada." }, 403);
  if (!env?.DB) return json({ error: "La base de datos no está disponible." }, 503);
  const db = env.DB;
  const account = await getAuthenticatedAccount(db, await requestSessionHash(request));
  if (!account) return json({ error: "Inicia sesión con la cuenta administradora." }, 401);
  if (
    account.email.toLowerCase() !== ADMIN_EMAIL ||
    !(await hasValidAdminSession(db, request, account.google_sub))
  )
    return json({ error: "Acceso administrativo requerido." }, 403);
  try {
    await ensureAuthSchema(db);
    await db
      .prepare(
        `CREATE TABLE IF NOT EXISTS admin_alliance_logs (
      id TEXT PRIMARY KEY, alliance_id TEXT, war_id TEXT, action TEXT NOT NULL,
      target_pilot_id TEXT, reason TEXT NOT NULL, admin_email TEXT NOT NULL, created_at INTEGER NOT NULL
    )`,
      )
      .run();
    await db
      .prepare(
        "CREATE INDEX IF NOT EXISTS idx_admin_alliance_logs_created ON admin_alliance_logs(created_at DESC)",
      )
      .run();
  } catch (error) {
    console.error("No se pudo preparar la auditoría de alianzas:", error);
    return json({ error: "No se pudo preparar la gestión de alianzas." }, 503);
  }

  if (request.method === "GET") {
    const allianceId = url.searchParams.get("alliance_id") ?? "";
    const [alliances, wars, logs, members] = await Promise.all([
      db
        .prepare(
          `SELECT a.alliance_id,a.name,a.tag,a.leader_pilot_id,a.level,a.war_wins,a.war_losses,a.created_at,
        COALESCE(NULLIF(profile.display_name,''),leader.callsign,'PILOTO') AS leader_name,
        (SELECT COUNT(*) FROM alliance_members m WHERE m.alliance_id=a.alliance_id) AS member_count,
        EXISTS(SELECT 1 FROM alliance_war_locks lock WHERE lock.alliance_id=a.alliance_id) AS in_war,
        EXISTS(SELECT 1 FROM alliance_wars w WHERE w.attacker_alliance_id=a.alliance_id OR w.defender_alliance_id=a.alliance_id) AS has_war_history
        FROM alliances a JOIN pilots leader ON leader.pilot_id=a.leader_pilot_id
        LEFT JOIN player_profiles profile ON profile.pilot_id=leader.pilot_id
        ORDER BY a.level DESC,a.war_wins DESC,a.name LIMIT 200`,
        )
        .all(),
      db
        .prepare(
          `SELECT w.war_id,w.attacker_alliance_id,w.defender_alliance_id,w.status,w.winner_alliance_id,
        w.created_at,w.started_at,w.ended_at,w.attacker_hordes_survived,w.defender_hordes_survived,
        aa.name AS attacker_name,aa.tag AS attacker_tag,da.name AS defender_name,da.tag AS defender_tag,
        (SELECT COUNT(*) FROM alliance_war_members m WHERE m.war_id=w.war_id) AS member_count
        FROM alliance_wars w JOIN alliances aa ON aa.alliance_id=w.attacker_alliance_id
        JOIN alliances da ON da.alliance_id=w.defender_alliance_id
        ORDER BY w.created_at DESC LIMIT 100`,
        )
        .all(),
      db
        .prepare(
          "SELECT id,alliance_id,war_id,action,target_pilot_id,reason,admin_email,created_at FROM admin_alliance_logs ORDER BY created_at DESC LIMIT 100",
        )
        .all(),
      allianceId
        ? db
            .prepare(
              `SELECT m.alliance_id,m.pilot_id,m.role,m.joined_at,
        COALESCE(NULLIF(profile.display_name,''),p.callsign,'PILOTO') AS callsign,pa.email
        FROM alliance_members m JOIN pilots p ON p.pilot_id=m.pilot_id
        LEFT JOIN player_profiles profile ON profile.pilot_id=p.pilot_id
        LEFT JOIN player_accounts pa ON pa.pilot_id=p.pilot_id
        WHERE m.alliance_id=? ORDER BY CASE m.role WHEN 'lider' THEN 0 WHEN 'teniente' THEN 1 ELSE 2 END,m.joined_at`,
            )
            .bind(allianceId)
            .all()
        : Promise.resolve({ results: [] }),
    ]);
    return json({
      alliances: alliances.results ?? [],
      wars: wars.results ?? [],
      members: members.results ?? [],
      logs: logs.results ?? [],
    });
  }

  const body = await readJson(request, 4096);
  const action = body?.["action"];
  const allianceId = typeof body?.["allianceId"] === "string" ? body["allianceId"].trim() : "";
  const pilotId = typeof body?.["pilotId"] === "string" ? body["pilotId"].trim() : "";
  const warId = typeof body?.["warId"] === "string" ? body["warId"].trim() : "";
  const role = body?.["role"];
  const reason = typeof body?.["reason"] === "string" ? body["reason"].trim() : "";
  if (reason.length < 5 || reason.length > 240)
    return json({ error: "Indica un motivo de entre 5 y 240 caracteres." }, 400);
  const now = Date.now();
  const log = (aId: string | null, wId: string | null, act: string, target: string | null) =>
    db
      .prepare(
        "INSERT INTO admin_alliance_logs (id,alliance_id,war_id,action,target_pilot_id,reason,admin_email,created_at) VALUES (?,?,?,?,?,?,?,?)",
      )
      .bind(crypto.randomUUID(), aId, wId, act, target, reason, account.email, now);

  if (action === "set-role" || action === "remove-member") {
    if (!allianceId || !pilotId) return json({ error: "Alianza o piloto no válido." }, 400);
    const member = await db
      .prepare("SELECT role FROM alliance_members WHERE alliance_id=? AND pilot_id=?")
      .bind(allianceId, pilotId)
      .first<{ role: string }>();
    if (!member) return json({ error: "El piloto no pertenece a esa alianza." }, 404);
    if (member.role === "lider")
      return json({ error: "Transfiere el liderazgo antes de modificar o retirar al líder." }, 409);
    const activeWar = await db
      .prepare("SELECT war_id FROM alliance_war_locks WHERE alliance_id=?")
      .bind(allianceId)
      .first();
    if (activeWar)
      return json(
        {
          error:
            "No puedes modificar miembros o permisos mientras la alianza tiene una guerra pendiente o activa.",
        },
        409,
      );
    if (action === "set-role") {
      if (role !== "teniente" && role !== "miembro")
        return json({ error: "El rol indicado no es válido." }, 400);
      await db.batch([
        db
          .prepare("UPDATE alliance_members SET role=? WHERE alliance_id=? AND pilot_id=?")
          .bind(role, allianceId, pilotId),
        log(allianceId, null, "set-role:" + String(role), pilotId),
      ]);
    } else {
      await db.batch([
        db
          .prepare("DELETE FROM alliance_members WHERE alliance_id=? AND pilot_id=?")
          .bind(allianceId, pilotId),
        log(allianceId, null, "remove-member", pilotId),
      ]);
    }
    return json({ success: true });
  }

  if (action === "transfer-leader") {
    const newLeaderId = pilotId;
    if (!allianceId || !newLeaderId)
      return json({ error: "Alianza o nuevo líder no válido." }, 400);
    const alliance = await db
      .prepare("SELECT leader_pilot_id FROM alliances WHERE alliance_id=?")
      .bind(allianceId)
      .first<{ leader_pilot_id: string }>();
    const activeWar = await db
      .prepare("SELECT war_id FROM alliance_war_locks WHERE alliance_id=?")
      .bind(allianceId)
      .first();
    if (activeWar)
      return json(
        { error: "No puedes transferir el liderazgo durante una guerra pendiente o activa." },
        409,
      );
    const target = await db
      .prepare("SELECT role FROM alliance_members WHERE alliance_id=? AND pilot_id=?")
      .bind(allianceId, newLeaderId)
      .first();
    if (!alliance || !target)
      return json({ error: "El nuevo líder debe pertenecer a la alianza." }, 404);
    if (alliance.leader_pilot_id === newLeaderId)
      return json({ error: "Ese piloto ya es el líder." }, 409);
    await db.batch([
      db
        .prepare("UPDATE alliance_members SET role='teniente' WHERE alliance_id=? AND pilot_id=?")
        .bind(allianceId, alliance.leader_pilot_id),
      db
        .prepare("UPDATE alliance_members SET role='lider' WHERE alliance_id=? AND pilot_id=?")
        .bind(allianceId, newLeaderId),
      db
        .prepare("UPDATE alliances SET leader_pilot_id=? WHERE alliance_id=?")
        .bind(newLeaderId, allianceId),
      log(allianceId, null, "transfer-leader", newLeaderId),
    ]);
    return json({ success: true });
  }

  if (action === "dissolve") {
    if (!allianceId) return json({ error: "Alianza no válida." }, 400);
    const alliance = await db
      .prepare("SELECT name FROM alliances WHERE alliance_id=?")
      .bind(allianceId)
      .first<{ name: string }>();
    if (!alliance) return json({ error: "No se encontró la alianza." }, 404);
    const locked = await db
      .prepare("SELECT war_id FROM alliance_war_locks WHERE alliance_id=?")
      .bind(allianceId)
      .first();
    if (locked)
      return json(
        { error: "No puedes disolver una alianza con una guerra pendiente o activa." },
        409,
      );
    const history = await db
      .prepare(
        "SELECT war_id FROM alliance_wars WHERE attacker_alliance_id=? OR defender_alliance_id=? LIMIT 1",
      )
      .bind(allianceId, allianceId)
      .first();
    if (history)
      return json(
        {
          error:
            "Esta alianza tiene historial de guerras y no se puede eliminar sin borrar ese historial.",
        },
        409,
      );
    await db.batch([
      db.prepare("DELETE FROM alliances WHERE alliance_id=?").bind(allianceId),
      log(allianceId, null, "dissolve:" + alliance.name, null),
    ]);
    return json({ success: true });
  }

  if (action === "reject-war" || action === "cancel-war") {
    if (!warId) return json({ error: "Guerra no válida." }, 400);
    const war = await db
      .prepare(
        "SELECT attacker_alliance_id,defender_alliance_id,status FROM alliance_wars WHERE war_id=?",
      )
      .bind(warId)
      .first<{ attacker_alliance_id: string; defender_alliance_id: string; status: string }>();
    if (!war) return json({ error: "No se encontró la guerra." }, 404);
    if (action === "reject-war" && war.status !== "DECLARED")
      return json({ error: "Solo puedes rechazar declaraciones pendientes." }, 409);
    if (action === "cancel-war" && war.status !== "DECLARED" && war.status !== "PREPARING")
      return json(
        {
          error:
            "Solo puedes cancelar guerras declaradas o en preparación. Los combates iniciados no se alteran.",
        },
        409,
      );
    const status = action === "reject-war" ? "REJECTED" : "CANCELLED";
    await db.batch([
      db
        .prepare("UPDATE alliance_wars SET status=?,ended_at=? WHERE war_id=? AND status=?")
        .bind(status, now, warId, war.status),
      db.prepare("DELETE FROM alliance_war_locks WHERE war_id=?").bind(warId),
      log(war.attacker_alliance_id, warId, status.toLowerCase(), null),
    ]);
    return json({ success: true, status });
  }
  return json({ error: "Acción administrativa no válida." }, 400);
}

async function handleAdminSeasonsRequest(
  request: Request,
  env: WorkerEnv | undefined,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== "/api/admin/seasons") return null;
  if (request.method !== "GET" && request.method !== "POST")
    return json({ error: "Método no permitido." }, 405);
  if (request.method === "POST" && !isSameOriginPost(request, url))
    return json({ error: "Solicitud no autorizada." }, 403);
  if (!env?.DB) return json({ error: "La base de datos no está disponible." }, 503);
  const db = env.DB;
  try {
    await ensureAuthSchema(db);
    await db
      .prepare(
        `CREATE TABLE IF NOT EXISTS admin_season_events (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL,
      starts_at INTEGER NOT NULL, ends_at INTEGER NOT NULL,
      reward_description TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'DRAFT',
      created_by TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
      CHECK (ends_at > starts_at), CHECK (status IN ('DRAFT','ACTIVE','FINISHED'))
    )`,
      )
      .run();
    await db
      .prepare(
        "CREATE INDEX IF NOT EXISTS idx_admin_season_events_dates ON admin_season_events(starts_at, ends_at, status)",
      )
      .run();
    await db
      .prepare(
        `CREATE TABLE IF NOT EXISTS admin_season_event_logs (
      id TEXT PRIMARY KEY, event_id TEXT NOT NULL, action TEXT NOT NULL,
      event_name TEXT NOT NULL, admin_email TEXT NOT NULL, created_at INTEGER NOT NULL
    )`,
      )
      .run();
    await db
      .prepare(
        "CREATE INDEX IF NOT EXISTS idx_admin_season_event_logs_created ON admin_season_event_logs(created_at DESC)",
      )
      .run();
  } catch (error) {
    console.error("No se pudo preparar la gestión de temporadas:", error);
    return json({ error: "No se pudo preparar la gestión de temporadas." }, 503);
  }
  const account = await getAuthenticatedAccount(db, await requestSessionHash(request));
  if (!account) return json({ error: "Inicia sesión con la cuenta administradora." }, 401);
  if (
    account.email.toLowerCase() !== ADMIN_EMAIL ||
    !(await hasValidAdminSession(db, request, account.google_sub))
  )
    return json({ error: "Acceso administrativo requerido." }, 403);

  if (request.method === "GET") {
    const [events, ranking, totals, logs] = await Promise.all([
      db
        .prepare(
          "SELECT id, name, description, starts_at, ends_at, reward_description, status, created_by, created_at, updated_at FROM admin_season_events ORDER BY starts_at DESC LIMIT 100",
        )
        .all(),
      db
        .prepare(
          `SELECT p.pilot_id, COALESCE(NULLIF(profile.display_name, ''), p.callsign, 'PILOTO') AS callsign,
        pa.email, COALESCE(CAST(json_extract(progress.progress_json, '$.season.pt') AS INTEGER), 0) AS pt,
        json_extract(progress.progress_json, '$.season.seasonId') AS season_id,
        COALESCE(json_array_length(json_extract(progress.progress_json, '$.season.dailyCompletedIds')), 0) AS daily_completed,
        COALESCE(json_array_length(json_extract(progress.progress_json, '$.season.weeklyCompletedIds')), 0) AS weekly_completed
        FROM player_progress progress JOIN pilots p ON p.pilot_id = progress.pilot_id
        LEFT JOIN player_profiles profile ON profile.pilot_id = p.pilot_id
        LEFT JOIN player_accounts pa ON pa.pilot_id = p.pilot_id
        ORDER BY pt DESC LIMIT 100`,
        )
        .all(),
      db
        .prepare(
          "SELECT COUNT(*) AS participants FROM player_progress WHERE json_valid(progress_json) AND json_type(progress_json, '$.season') = 'object'",
        )
        .first(),
      db
        .prepare(
          "SELECT event_id, action, event_name, admin_email, created_at FROM admin_season_event_logs ORDER BY created_at DESC LIMIT 100",
        )
        .all(),
    ]);
    const now = Date.now();
    const active = (events.results ?? []).filter(
      (event: Record<string, unknown>) =>
        event["status"] === "ACTIVE" &&
        Number(event["starts_at"]) <= now &&
        Number(event["ends_at"]) > now,
    );
    return json({
      events: events.results ?? [],
      ranking: ranking.results ?? [],
      participants: totals?.["participants"] ?? 0,
      activeEvents: active.length,
      logs: logs.results ?? [],
    });
  }

  if ((await readGameSetting(db, "events_enabled", "true")) !== "true")
    return json({ error: "La gestión de eventos está desactivada desde Configuración." }, 403);
  const body = await readJson(request, 4096);
  const action = body?.["action"];
  const id = typeof body?.["id"] === "string" ? body["id"].trim() : "";
  const name = typeof body?.["name"] === "string" ? body["name"].trim() : "";
  const description = typeof body?.["description"] === "string" ? body["description"].trim() : "";
  const rewardDescription =
    typeof body?.["rewardDescription"] === "string" ? body["rewardDescription"].trim() : "";
  const startsAt = body?.["startsAt"];
  const endsAt = body?.["endsAt"];
  const status = body?.["status"];
  if (!["create", "update", "status", "delete"].includes(String(action)))
    return json({ error: "Acción de temporada no válida." }, 400);
  if (action !== "delete" && action !== "status") {
    if (name.length < 3 || name.length > 90 || description.length < 5 || description.length > 1200)
      return json({ error: "Completa un nombre y una descripción válidos." }, 400);
    if (
      !Number.isSafeInteger(startsAt) ||
      !Number.isSafeInteger(endsAt) ||
      (startsAt as number) < 0 ||
      (endsAt as number) <= (startsAt as number)
    )
      return json({ error: "Las fechas de inicio y fin no son válidas." }, 400);
    if (rewardDescription.length > 500)
      return json({ error: "La descripción del premio no puede superar 500 caracteres." }, 400);
    if (status !== "DRAFT" && status !== "ACTIVE" && status !== "FINISHED")
      return json({ error: "Estado de temporada no válido." }, 400);
  }
  if (action !== "create" && !/^[a-f0-9-]{36}$/i.test(id))
    return json({ error: "Identificador de temporada no válido." }, 400);
  if (action === "status" && status !== "DRAFT" && status !== "ACTIVE" && status !== "FINISHED")
    return json({ error: "Estado de temporada no válido." }, 400);
  if (action === "delete") {
    const existing = await db
      .prepare("SELECT name FROM admin_season_events WHERE id = ?")
      .bind(id)
      .first<{ name: string }>();
    if (!existing) return json({ error: "No se encontró la temporada." }, 404);
    const now = Date.now();
    await db.batch([
      db.prepare("DELETE FROM admin_season_events WHERE id = ?").bind(id),
      db
        .prepare(
          "INSERT INTO admin_season_event_logs (id,event_id,action,event_name,admin_email,created_at) VALUES (?,?,?,?,?,?)",
        )
        .bind(crypto.randomUUID(), id, "delete", existing.name, account.email, now),
    ]);
    return json({ success: true });
  }
  const now = Date.now();
  const eventId = action === "create" ? crypto.randomUUID() : id;
  if (status === "ACTIVE") {
    const conflict = await db
      .prepare(
        "SELECT id FROM admin_season_events WHERE status = 'ACTIVE' AND id != ? AND ends_at > ? LIMIT 1",
      )
      .bind(eventId, now)
      .first<{ id: string }>();
    if (conflict)
      return json(
        { error: "Ya existe otra temporada activa. Finalízala antes de activar esta." },
        409,
      );
  }
  if (action === "status") {
    const existing = await db
      .prepare("SELECT name FROM admin_season_events WHERE id = ?")
      .bind(id)
      .first<{ name: string }>();
    if (!existing) return json({ error: "No se encontró la temporada." }, 404);
    await db.batch([
      db
        .prepare("UPDATE admin_season_events SET status = ?, updated_at = ? WHERE id = ?")
        .bind(status, now, id),
      db
        .prepare(
          "INSERT INTO admin_season_event_logs (id,event_id,action,event_name,admin_email,created_at) VALUES (?,?,?,?,?,?)",
        )
        .bind(crypto.randomUUID(), id, "status:" + status, existing.name, account.email, now),
    ]);
    return json({ success: true, id });
  }
  if (action === "create") {
    await db.batch([
      db
        .prepare(
          "INSERT INTO admin_season_events (id,name,description,starts_at,ends_at,reward_description,status,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
        )
        .bind(
          eventId,
          name,
          description,
          startsAt,
          endsAt,
          rewardDescription,
          status,
          account.email,
          now,
          now,
        ),
      db
        .prepare(
          "INSERT INTO admin_season_event_logs (id,event_id,action,event_name,admin_email,created_at) VALUES (?,?,?,?,?,?)",
        )
        .bind(crypto.randomUUID(), eventId, "create", name, account.email, now),
    ]);
  } else {
    const result = await db
      .prepare(
        "UPDATE admin_season_events SET name=?,description=?,starts_at=?,ends_at=?,reward_description=?,status=?,updated_at=? WHERE id=?",
      )
      .bind(name, description, startsAt, endsAt, rewardDescription, status, now, id)
      .run();
    if (result.meta?.changes !== 1) return json({ error: "No se encontró la temporada." }, 404);
    await db
      .prepare(
        "INSERT INTO admin_season_event_logs (id,event_id,action,event_name,admin_email,created_at) VALUES (?,?,?,?,?,?)",
      )
      .bind(crypto.randomUUID(), id, "update", name, account.email, now)
      .run();
  }
  return json({ success: true, id: eventId });
}

async function handleAdminRewardsRequest(
  request: Request,
  env: WorkerEnv | undefined,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== "/api/admin/rewards") return null;
  if (request.method !== "GET" && request.method !== "POST")
    return json({ error: "Método no permitido." }, 405);
  if (request.method === "POST" && !isSameOriginPost(request, url))
    return json({ error: "Solicitud no autorizada." }, 403);
  if (!env?.DB) return json({ error: "La base de datos no está disponible." }, 503);

  const db = env.DB;
  try {
    await ensureAuthSchema(db);
    await ensureMarketSchema(db);
    await db
      .prepare(
        "CREATE TABLE IF NOT EXISTS admin_reward_logs (id TEXT PRIMARY KEY, operation_id TEXT NOT NULL UNIQUE, pilot_id TEXT NOT NULL, reward_type TEXT NOT NULL, reward_id TEXT NOT NULL, reward_name TEXT NOT NULL, quantity INTEGER NOT NULL, event_name TEXT NOT NULL DEFAULT '', reason TEXT NOT NULL, admin_email TEXT NOT NULL, created_at INTEGER NOT NULL)",
      )
      .run();
    await db
      .prepare(
        "CREATE INDEX IF NOT EXISTS idx_admin_reward_logs_created ON admin_reward_logs(created_at DESC)",
      )
      .run();
    await db
      .prepare(
        "CREATE INDEX IF NOT EXISTS idx_admin_reward_logs_pilot ON admin_reward_logs(pilot_id, created_at DESC)",
      )
      .run();
  } catch (error) {
    console.error("No se pudo preparar el sistema de recompensas:", error);
    return json({ error: "No se pudo preparar el sistema de recompensas." }, 503);
  }

  const account = await getAuthenticatedAccount(db, await requestSessionHash(request));
  if (!account) return json({ error: "Inicia sesión con la cuenta administradora." }, 401);
  if (
    account.email.toLowerCase() !== ADMIN_EMAIL ||
    !(await hasValidAdminSession(db, request, account.google_sub))
  )
    return json({ error: "Acceso administrativo requerido." }, 403);

  if (request.method === "GET") {
    const search = (url.searchParams.get("search") ?? "").trim().slice(0, 100);
    const pattern = "%" + search.replace(/[\\%_]/g, (character) => "\\" + character) + "%";
    const rows = await db
      .prepare(
        "SELECT l.id, l.operation_id, l.pilot_id, l.reward_type, l.reward_id, l.reward_name, l.quantity, l.event_name, l.reason, l.admin_email, l.created_at, p.callsign, pa.email FROM admin_reward_logs l JOIN pilots p ON p.pilot_id = l.pilot_id LEFT JOIN player_accounts pa ON pa.pilot_id = l.pilot_id WHERE (? = '' OR l.pilot_id LIKE ? ESCAPE '\\' OR p.callsign LIKE ? ESCAPE '\\' OR pa.email LIKE ? ESCAPE '\\' OR l.event_name LIKE ? ESCAPE '\\') ORDER BY l.created_at DESC LIMIT 100",
      )
      .bind(search, pattern, pattern, pattern, pattern)
      .all();
    return json({ rewards: rows.results ?? [] });
  }

  if ((await readGameSetting(db, "rewards_enabled", "true")) !== "true")
    return json(
      { error: "La entrega administrativa de recompensas está desactivada desde Configuración." },
      403,
    );
  const body = await readJson(request, 4096);
  const operationId = body?.["operationId"];
  const recipient =
    typeof body?.["recipient"] === "string" ? body["recipient"].trim().slice(0, 160) : "";
  const rewardType = body?.["rewardType"];
  const rewardId = typeof body?.["rewardId"] === "string" ? body["rewardId"] : "";
  const quantity = body?.["quantity"];
  const eventName = typeof body?.["eventName"] === "string" ? body["eventName"].trim() : "";
  const reason = typeof body?.["reason"] === "string" ? body["reason"].trim() : "";
  if (typeof operationId !== "string" || !/^[0-9a-f-]{36}$/i.test(operationId))
    return json(
      { error: "La operación no tiene un identificador válido. Inténtalo de nuevo." },
      400,
    );
  if (!recipient) return json({ error: "Indica el jugador que recibirá el premio." }, 400);
  if (typeof rewardType !== "string" || !["ship", "item", "CR", "OBS", "VIP"].includes(rewardType))
    return json({ error: "Selecciona un tipo de premio válido." }, 400);
  if (typeof quantity !== "number" || !Number.isSafeInteger(quantity) || quantity < 1)
    return json({ error: "La cantidad debe ser un número entero positivo." }, 400);
  if (reason.length < 5 || reason.length > 240)
    return json({ error: "Escribe un motivo de entre 5 y 240 caracteres." }, 400);
  if (eventName.length > 100)
    return json({ error: "El nombre del evento no puede superar 100 caracteres." }, 400);

  const duplicate = await db
    .prepare("SELECT id FROM admin_reward_logs WHERE operation_id = ?")
    .bind(operationId)
    .first<{ id: string }>();
  if (duplicate)
    return json({ error: "Esta entrega ya fue procesada. Actualiza el historial." }, 409);

  const matches = validPilotId(recipient)
    ? await db
        .prepare(
          "SELECT p.pilot_id, p.callsign, pa.email FROM pilots p LEFT JOIN player_accounts pa ON pa.pilot_id = p.pilot_id WHERE p.pilot_id = ? LIMIT 1",
        )
        .bind(recipient)
        .all<{ pilot_id: string; callsign: string; email: string | null }>()
    : await db
        .prepare(
          "SELECT p.pilot_id, p.callsign, pa.email FROM pilots p LEFT JOIN player_accounts pa ON pa.pilot_id = p.pilot_id LEFT JOIN player_profiles pp ON pp.pilot_id = p.pilot_id WHERE lower(pa.email) = lower(?) OR lower(p.callsign) = lower(?) OR lower(pp.display_name) = lower(?) LIMIT 2",
        )
        .bind(recipient, recipient, recipient)
        .all<{ pilot_id: string; callsign: string; email: string | null }>();
  if (!matches.results?.length) return json({ error: "No se encontró ese jugador." }, 404);
  if (matches.results.length > 1)
    return json({ error: "Hay varios jugadores con ese nombre. Usa su ID o correo." }, 409);
  const player = matches.results[0]!;
  const now = Date.now();
  const logId = crypto.randomUUID();
  let name = "";
  let rewardKey = rewardId;
  let statements: D1Statement[] = [];

  if (rewardType === "CR" || rewardType === "OBS") {
    if (quantity > 1000000000) return json({ error: "La cantidad máxima es 1.000.000.000." }, 400);
    name = rewardType;
    statements =
      rewardType === "OBS"
        ? [
            db
              .prepare(
                "UPDATE pilots SET obsidian = obsidian + ?, updated_at = ? WHERE pilot_id = ?",
              )
              .bind(quantity, now, player.pilot_id),
          ]
        : [
            db
              .prepare(
                "INSERT INTO player_progress (pilot_id, progress_json, updated_at) VALUES (?, json_object('credits', ?), ?) ON CONFLICT(pilot_id) DO UPDATE SET progress_json = json_set(CASE WHEN json_valid(player_progress.progress_json) THEN player_progress.progress_json ELSE json_object('credits', 0) END, '$.credits', COALESCE(CAST(json_extract(CASE WHEN json_valid(player_progress.progress_json) THEN player_progress.progress_json ELSE json_object('credits', 0) END, '$.credits') AS INTEGER), 0) + ?), updated_at = excluded.updated_at",
              )
              .bind(player.pilot_id, quantity, now, quantity),
          ];
  } else if (rewardType === "VIP") {
    if (quantity > 3650) return json({ error: "La duración máxima de VIP es 3.650 días." }, 400);
    name = "VIP";
    rewardKey = "vip";
    statements = [
      db
        .prepare(
          "UPDATE pilots SET vip_until = MAX(COALESCE(vip_until, 0), ?) + ?, updated_at = ? WHERE pilot_id = ?",
        )
        .bind(now, quantity * 86400000, now, player.pilot_id),
    ];
  } else if (rewardType === "ship") {
    if (!VALID_SHIP_IDS.has(rewardId)) return json({ error: "Selecciona una nave válida." }, 400);
    if (quantity !== 1) return json({ error: "Las naves se entregan de una en una." }, 400);
    const ship = SHIPS.find((entry) => entry.id === rewardId);
    if (!ship) return json({ error: "No se encontró la nave seleccionada." }, 400);
    name = ship.name;
    statements = [
      db
        .prepare(
          "INSERT INTO pilot_inventory (id, pilot_id, item_id, item_name, item_type, quantity, is_locked, grant_source, created_at, updated_at) VALUES (?, ?, ?, ?, 'nave', 1, 0, 'legacy', ?, ?) ON CONFLICT(pilot_id, item_id) DO UPDATE SET quantity = pilot_inventory.quantity + 1, updated_at = excluded.updated_at",
        )
        .bind(crypto.randomUUID(), player.pilot_id, rewardId, name, now, now),
    ];
  } else {
    const item = INVENTORY_CATALOG.find((entry) => entry.itemId === rewardId);
    if (!item) return json({ error: "Selecciona un objeto válido." }, 400);
    if (quantity > 1000)
      return json({ error: "La cantidad máxima por entrega es 1.000 objetos." }, 400);
    name = item.label;
    statements = [
      db
        .prepare(
          "INSERT INTO pilot_inventory (id, pilot_id, item_id, item_name, item_type, quantity, is_locked, grant_source, created_at, updated_at) VALUES (?, ?, ?, ?, 'objeto', ?, 0, 'legacy', ?, ?) ON CONFLICT(pilot_id, item_id) DO UPDATE SET quantity = pilot_inventory.quantity + excluded.quantity, updated_at = excluded.updated_at",
        )
        .bind(crypto.randomUUID(), player.pilot_id, rewardId, name, quantity, now, now),
    ];
  }

  statements.push(
    db
      .prepare(
        "INSERT INTO admin_reward_logs (id, operation_id, pilot_id, reward_type, reward_id, reward_name, quantity, event_name, reason, admin_email, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .bind(
        logId,
        operationId,
        player.pilot_id,
        rewardType,
        rewardKey,
        name,
        quantity,
        eventName,
        reason,
        account.email,
        now,
      ),
  );

  try {
    const results = await db.batch(statements);
    if (results[0]?.meta?.changes !== 1)
      return json({ error: "No se pudo entregar el premio al jugador." }, 409);
    await notifyPilotRewards(env, player.pilot_id);
  } catch (error) {
    console.error("No se pudo registrar la recompensa:", error);
    return json(
      {
        error:
          "No se pudo completar la entrega. Actualiza el historial antes de volver a intentarlo.",
      },
      409,
    );
  }
  return json({
    success: true,
    id: logId,
    pilot_id: player.pilot_id,
    reward_type: rewardType,
    reward_name: name,
    quantity,
    event_name: eventName,
  });
}

/** Avisa en tiempo real al jugador que tiene un premio nuevo. Nunca bloquea la entrega. */
async function notifyPilotRewards(env: WorkerEnv | undefined, pilotId: string) {
  if (!env?.PILOT_NOTIFY) return;
  try {
    const stub = env.PILOT_NOTIFY.get(env.PILOT_NOTIFY.idFromName(pilotId));
    await stub.fetch(
      new Request("https://pilot-notify.internal/notify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "rewards" }),
      }),
    );
  } catch (error) {
    console.error("No se pudo enviar la notificación de premio:", error);
  }
}

let pilotRewardLogsReady = false;

/** Tabla de premios de jefes: un registro por reclamo validado (OBS y objetos/naves). */
async function ensurePilotRewardLogs(db: NonNullable<WorkerEnv["DB"]>) {
  if (pilotRewardLogsReady) return;
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS boss_reward_logs (
        reward_id TEXT PRIMARY KEY, pilot_id TEXT NOT NULL, boss_id TEXT NOT NULL,
        obsidian INTEGER NOT NULL, drops_json TEXT NOT NULL, created_at INTEGER NOT NULL
      )`,
    )
    .run();
  await db
    .prepare(
      "CREATE INDEX IF NOT EXISTS idx_boss_reward_logs_pilot ON boss_reward_logs(pilot_id, created_at DESC)",
    )
    .run();
  pilotRewardLogsReady = true;
}

/** Historial de premios del jugador: administración y jefes. Solo lectura. */
async function handlePilotRewardsRequest(
  request: Request,
  env: WorkerEnv | undefined,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== "/api/pilot/rewards" && url.pathname !== "/api/pilot/rewards/ws")
    return null;
  if (request.method !== "GET") return json({ error: "Método no permitido." }, 405);
  if (!env?.DB) return json({ error: "La base de datos no está disponible." }, 503);

  const db = env.DB;
  try {
    await ensureAuthSchema(db);
    await ensurePilotRewardLogs(db);
  } catch (error) {
    console.error("No se pudo preparar el historial de premios:", error);
    return json({ error: "No se pudo preparar el historial de premios." }, 503);
  }

  const account = await getAuthenticatedAccount(db, await requestSessionHash(request));
  if (!account) return json({ error: "Inicia sesión para ver tus premios." }, 401);

  if (url.pathname === "/api/pilot/rewards/ws") {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return json({ error: "Se requiere una conexión WebSocket." }, 426);
    }
    if (request.headers.get("origin") !== url.origin) {
      return json({ error: "Origen de conexión no autorizado." }, 403);
    }
    if (!env?.PILOT_NOTIFY) {
      return json({ error: "Las notificaciones en tiempo real no están disponibles." }, 503);
    }
    const stub = env.PILOT_NOTIFY.get(env.PILOT_NOTIFY.idFromName(account.pilot_id));
    const socketUrl = new URL(request.url);
    socketUrl.pathname = "/websocket";
    return stub.fetch(new Request(socketUrl, request));
  }

  type RewardEntry = {
    id: string;
    source: "ADMIN" | "BOSS";
    kind: string;
    label: string;
    detail: string;
    quantity: number;
    created_at: number;
  };
  const entries: RewardEntry[] = [];

  try {
    const admin = await db
      .prepare(
        "SELECT id, reward_type, reward_name, quantity, reason, event_name, created_at FROM admin_reward_logs WHERE pilot_id = ? ORDER BY created_at DESC LIMIT 30",
      )
      .bind(account.pilot_id)
      .all<{
        id: string;
        reward_type: string;
        reward_name: string;
        quantity: number;
        reason: string;
        event_name: string;
        created_at: number;
      }>();
    for (const row of admin.results ?? []) {
      entries.push({
        id: `admin_${row.id}`,
        source: "ADMIN",
        kind: row.reward_type,
        label: row.reward_name,
        detail: row.event_name ? `${row.event_name} · ${row.reason}` : row.reason,
        quantity: row.quantity,
        created_at: row.created_at,
      });
    }
  } catch {
    // Aún no hay premios de administración registrados.
  }

  const bossRows = await db
    .prepare(
      "SELECT reward_id, boss_id, obsidian, drops_json, created_at FROM boss_reward_logs WHERE pilot_id = ? ORDER BY created_at DESC LIMIT 30",
    )
    .bind(account.pilot_id)
    .all<{
      reward_id: string;
      boss_id: string;
      obsidian: number;
      drops_json: string;
      created_at: number;
    }>();
  for (const row of bossRows.results ?? []) {
    const bossName = bossById(row.boss_id)?.name ?? row.boss_id;
    const detail = `Jefe ${bossName}`;
    if (row.obsidian > 0) {
      entries.push({
        id: `boss_${row.reward_id}_obs`,
        source: "BOSS",
        kind: "OBS",
        label: "OBSIDIANA",
        detail,
        quantity: row.obsidian,
        created_at: row.created_at,
      });
    }
    let drops: { type: string; name: string }[] = [];
    try {
      drops = JSON.parse(row.drops_json) as { type: string; name: string }[];
    } catch {
      drops = [];
    }
    drops.forEach((drop, index) => {
      entries.push({
        id: `boss_${row.reward_id}_${index}`,
        source: "BOSS",
        kind: drop.type === "nave" ? "ship" : "item",
        label: drop.name,
        detail,
        quantity: 1,
        created_at: row.created_at,
      });
    });
  }

  entries.sort((a, b) => b.created_at - a.created_at);
  return json({ rewards: entries.slice(0, 40) });
}

async function handleSupportRequest(
  request: Request,
  env: WorkerEnv | undefined,
): Promise<Response | null> {
  const url = new URL(request.url);
  const isPlayer = url.pathname === "/api/support/tickets";
  const isAdmin = url.pathname === "/api/admin/support";
  if (!isPlayer && !isAdmin) return null;
  if (!env?.DB) return json({ error: "La base de datos no está disponible." }, 503);
  if (request.method !== "GET" && request.method !== "POST")
    return json({ error: "Método no permitido." }, 405);
  if (request.method === "POST" && !isSameOriginPost(request, url))
    return json({ error: "Solicitud no autorizada." }, 403);

  const db = env.DB;
  try {
    await ensureAuthSchema(db);
    await db
      .prepare(
        `CREATE TABLE IF NOT EXISTS support_tickets (
        id TEXT PRIMARY KEY, pilot_id TEXT NOT NULL, subject TEXT NOT NULL,
        category TEXT NOT NULL, description TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'OPEN',
        priority TEXT NOT NULL DEFAULT 'NORMAL', created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL, closed_at INTEGER
      )`,
      )
      .run();
    await db
      .prepare(
        `CREATE TABLE IF NOT EXISTS support_messages (
        id TEXT PRIMARY KEY, ticket_id TEXT NOT NULL, sender_role TEXT NOT NULL,
        sender_name TEXT NOT NULL, message TEXT NOT NULL, created_at INTEGER NOT NULL
      )`,
      )
      .run();
    await db
      .prepare(
        "CREATE INDEX IF NOT EXISTS idx_support_tickets_status_updated ON support_tickets(status, updated_at DESC)",
      )
      .run();
    await db
      .prepare(
        "CREATE INDEX IF NOT EXISTS idx_support_messages_ticket ON support_messages(ticket_id, created_at)",
      )
      .run();
    await db
      .prepare(
        `CREATE TABLE IF NOT EXISTS admin_support_logs (
        id TEXT PRIMARY KEY, ticket_id TEXT NOT NULL, action TEXT NOT NULL,
        note TEXT NOT NULL, admin_email TEXT NOT NULL, created_at INTEGER NOT NULL
      )`,
      )
      .run();
  } catch (error) {
    console.error("No se pudo preparar el sistema de soporte:", error);
    return json({ error: "No se pudo preparar el sistema de soporte." }, 503);
  }

  const account = await getAuthenticatedAccount(db, await requestSessionHash(request));
  if (!account) return json({ error: "Inicia sesión con Google para usar soporte." }, 401);

  if (isPlayer) {
    if (request.method === "GET") {
      const [tickets, messages] = await Promise.all([
        db
          .prepare(
            "SELECT id, subject, category, status, priority, created_at, updated_at, closed_at FROM support_tickets WHERE pilot_id = ? ORDER BY updated_at DESC LIMIT 50",
          )
          .bind(account.pilot_id)
          .all(),
        db
          .prepare(
            "SELECT m.id, m.ticket_id, m.sender_role, m.message, m.created_at FROM support_messages m JOIN support_tickets t ON t.id = m.ticket_id WHERE t.pilot_id = ? ORDER BY m.created_at ASC LIMIT 500",
          )
          .bind(account.pilot_id)
          .all(),
      ]);
      return json({ tickets: tickets.results ?? [], messages: messages.results ?? [] });
    }
    const body = await readJson(request, 4096);
    const subject = typeof body?.["subject"] === "string" ? body["subject"].trim() : "";
    const category = body?.["category"];
    const description = typeof body?.["description"] === "string" ? body["description"].trim() : "";
    if (
      subject.length < 4 ||
      subject.length > 100 ||
      description.length < 10 ||
      description.length > 2000 ||
      !["TECNICO", "CUENTA", "PAGOS", "MERCADO", "OTRO"].includes(String(category))
    ) {
      return json({ error: "Completa un asunto, categoría y descripción válidos." }, 400);
    }
    const now = Date.now();
    const id = crypto.randomUUID();
    await db.batch([
      db
        .prepare(
          "INSERT INTO support_tickets (id, pilot_id, subject, category, description, status, priority, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'OPEN', 'NORMAL', ?, ?)",
        )
        .bind(id, account.pilot_id, subject, category, description, now, now),
      db
        .prepare(
          "INSERT INTO support_messages (id, ticket_id, sender_role, sender_name, message, created_at) VALUES (?, ?, 'PLAYER', ?, ?, ?)",
        )
        .bind(crypto.randomUUID(), id, account.email, description, now),
    ]);
    return json({ success: true, id });
  }

  if (
    account.email.toLowerCase() !== ADMIN_EMAIL ||
    !(await hasValidAdminSession(db, request, account.google_sub))
  ) {
    return json({ error: "Acceso administrativo requerido." }, 403);
  }

  if (request.method === "GET") {
    const [tickets, logs] = await Promise.all([
      db
        .prepare(
          `SELECT t.id, t.pilot_id, t.subject, t.category, t.description, t.status, t.priority,
          t.created_at, t.updated_at, t.closed_at,
          COALESCE(NULLIF(profile.display_name, ''), pilot.callsign, 'PILOTO') AS callsign,
          account.email
         FROM support_tickets t
         LEFT JOIN pilots pilot ON pilot.pilot_id = t.pilot_id
         LEFT JOIN player_profiles profile ON profile.pilot_id = t.pilot_id
         LEFT JOIN player_accounts account ON account.pilot_id = t.pilot_id
         ORDER BY CASE WHEN t.status = 'OPEN' THEN 0 WHEN t.status = 'IN_PROGRESS' THEN 1 ELSE 2 END,
          t.updated_at DESC LIMIT 200`,
        )
        .all(),
      db
        .prepare(
          "SELECT ticket_id, action, note, admin_email, created_at FROM admin_support_logs ORDER BY created_at DESC LIMIT 100",
        )
        .all(),
    ]);
    const messages = await db
      .prepare(
        "SELECT id, ticket_id, sender_role, sender_name, message, created_at FROM support_messages ORDER BY created_at ASC LIMIT 1000",
      )
      .all();
    return json({
      tickets: tickets.results ?? [],
      messages: messages.results ?? [],
      logs: logs.results ?? [],
    });
  }

  const body = await readJson(request, 4096);
  const action = body?.["action"];
  const ticketId = typeof body?.["ticketId"] === "string" ? body["ticketId"].trim() : "";
  const note = typeof body?.["note"] === "string" ? body["note"].trim() : "";
  if (!/^[a-f0-9-]{36}$/i.test(ticketId)) return json({ error: "Ticket no válido." }, 400);
  const ticket = await db
    .prepare("SELECT id, status FROM support_tickets WHERE id = ?")
    .bind(ticketId)
    .first<{ id: string; status: string }>();
  if (!ticket) return json({ error: "El ticket no existe." }, 404);
  const now = Date.now();
  if (action === "reply") {
    if (note.length < 2 || note.length > 2000)
      return json({ error: "La respuesta debe tener entre 2 y 2000 caracteres." }, 400);
    await db.batch([
      db
        .prepare(
          "INSERT INTO support_messages (id, ticket_id, sender_role, sender_name, message, created_at) VALUES (?, ?, 'ADMIN', ?, ?, ?)",
        )
        .bind(crypto.randomUUID(), ticketId, account.email, note, now),
      db
        .prepare(
          "UPDATE support_tickets SET status = CASE WHEN status = 'CLOSED' THEN 'IN_PROGRESS' ELSE 'IN_PROGRESS' END, updated_at = ?, closed_at = NULL WHERE id = ?",
        )
        .bind(now, ticketId),
      db
        .prepare(
          "INSERT INTO admin_support_logs (id, ticket_id, action, note, admin_email, created_at) VALUES (?, ?, 'reply', ?, ?, ?)",
        )
        .bind(crypto.randomUUID(), ticketId, note.slice(0, 240), account.email, now),
    ]);
    return json({ success: true });
  }
  if (action === "set-status") {
    const status = body?.["status"];
    if (status !== "OPEN" && status !== "IN_PROGRESS" && status !== "CLOSED")
      return json({ error: "Estado de ticket no válido." }, 400);
    if (note.length < 3 || note.length > 240)
      return json({ error: "Indica un motivo para el cambio de estado." }, 400);
    await db.batch([
      db
        .prepare(
          "UPDATE support_tickets SET status = ?, updated_at = ?, closed_at = ? WHERE id = ?",
        )
        .bind(status, now, status === "CLOSED" ? now : null, ticketId),
      db
        .prepare(
          "INSERT INTO admin_support_logs (id, ticket_id, action, note, admin_email, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        )
        .bind(crypto.randomUUID(), ticketId, "status:" + status, note, account.email, now),
    ]);
    return json({ success: true });
  }
  return json({ error: "Acción de soporte no válida." }, 400);
}

async function handleAdminChatRequest(
  request: Request,
  env: WorkerEnv | undefined,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== "/api/admin/chat") return null;
  if (request.method !== "GET" && request.method !== "POST")
    return json({ error: "Método no permitido." }, 405);
  if (!env?.DB || !env.CHAT_ROOM)
    return json({ error: "El servicio de chat no está disponible." }, 503);
  if (request.method === "POST" && !isSameOriginPost(request, url))
    return json({ error: "Solicitud no autorizada." }, 403);
  const db = env.DB;
  try {
    await ensureAuthSchema(db);
    await db
      .prepare(
        "CREATE TABLE IF NOT EXISTS admin_chat_logs (id TEXT PRIMARY KEY, action TEXT NOT NULL, target_pilot_id TEXT, message_id INTEGER, reason TEXT NOT NULL, admin_email TEXT NOT NULL, created_at INTEGER NOT NULL)",
      )
      .run();
    await db
      .prepare(
        "CREATE TABLE IF NOT EXISTS chat_reports (id TEXT PRIMARY KEY, message_id INTEGER NOT NULL, language TEXT NOT NULL, reporter_pilot_id TEXT NOT NULL, target_pilot_id TEXT NOT NULL, reason TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'OPEN', created_at INTEGER NOT NULL, reviewed_at INTEGER, reviewed_by TEXT, resolution_note TEXT)",
      )
      .run();
    await db
      .prepare(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_reports_unique ON chat_reports(message_id, language, reporter_pilot_id)",
      )
      .run();
    await db
      .prepare(
        "CREATE INDEX IF NOT EXISTS idx_admin_chat_logs_created ON admin_chat_logs(created_at DESC)",
      )
      .run();
  } catch (error) {
    console.error("No se pudo preparar la moderación del chat:", error);
    return json({ error: "No se pudo preparar la moderación del chat." }, 503);
  }
  const account = await getAuthenticatedAccount(db, await requestSessionHash(request));
  if (!account) return json({ error: "Inicia sesión con la cuenta administradora." }, 401);
  if (
    account.email.toLowerCase() !== ADMIN_EMAIL ||
    !(await hasValidAdminSession(db, request, account.google_sub))
  )
    return json({ error: "Acceso administrativo requerido." }, 403);
  const room = env.CHAT_ROOM.get(env.CHAT_ROOM.idFromName("global"));
  if (request.method === "GET") {
    const [roomResponse, reports, logs] = await Promise.all([
      room.fetch(new Request("https://chat-room/admin")),
      db
        .prepare(
          "SELECT r.id, r.message_id, r.language, r.reporter_pilot_id, r.target_pilot_id, r.reason, r.status, r.created_at, r.reviewed_at, r.resolution_note, COALESCE(NULLIF(rp.display_name, ''), reporter.callsign, 'PILOTO') AS reporter_name, COALESCE(NULLIF(tp.display_name, ''), target.callsign, 'PILOTO') AS target_name FROM chat_reports r LEFT JOIN pilots reporter ON reporter.pilot_id = r.reporter_pilot_id LEFT JOIN pilots target ON target.pilot_id = r.target_pilot_id LEFT JOIN player_profiles rp ON rp.pilot_id = r.reporter_pilot_id LEFT JOIN player_profiles tp ON tp.pilot_id = r.target_pilot_id ORDER BY CASE WHEN r.status = 'OPEN' THEN 0 ELSE 1 END, r.created_at DESC LIMIT 100",
        )
        .all(),
      db
        .prepare(
          "SELECT action, target_pilot_id, message_id, reason, admin_email, created_at FROM admin_chat_logs ORDER BY created_at DESC LIMIT 100",
        )
        .all(),
    ]);
    if (!roomResponse.ok)
      return json({ error: "No se pudo consultar el historial del chat." }, 502);
    const roomData = (await roomResponse.json()) as { messages?: unknown[]; mutes?: unknown[] };
    return json({
      messages: roomData.messages ?? [],
      mutes: roomData.mutes ?? [],
      chatEnabled: (roomData as { chatEnabled?: boolean }).chatEnabled !== false,
      reports: reports.results ?? [],
      logs: logs.results ?? [],
    });
  }
  const body = await readJson(request, 4096);
  const action = body?.["action"];
  const reason = typeof body?.["reason"] === "string" ? body["reason"].trim().slice(0, 240) : "";
  const reportId = typeof body?.["reportId"] === "string" ? body["reportId"].trim() : "";
  const pilotId = typeof body?.["pilotId"] === "string" ? body["pilotId"].trim() : "";
  const messageId = Number(body?.["messageId"]);
  const enabled = body?.["enabled"];
  if (
    typeof action !== "string" ||
    ![
      "delete-message",
      "delete-last-12-hours",
      "delete-last-24-hours",
      "delete-all-messages",
      "mute",
      "ban",
      "unmute",
      "close-report",
      "set-chat-enabled",
    ].includes(action)
  )
    return json({ error: "Acción de chat no válida." }, 400);
  if (reason.length < 5) return json({ error: "Escribe un motivo de al menos 5 caracteres." }, 400);
  if (action === "close-report") {
    if (!/^[a-f0-9-]{36}$/i.test(reportId)) return json({ error: "Denuncia no válida." }, 400);
    const result = await db
      .prepare(
        "UPDATE chat_reports SET status = 'REVIEWED', reviewed_at = ?, reviewed_by = ?, resolution_note = ? WHERE id = ? AND status = 'OPEN'",
      )
      .bind(Date.now(), account.email, reason, reportId)
      .run();
    if (!result.meta?.changes)
      return json({ error: "La denuncia ya fue revisada o no existe." }, 409);
  } else {
    const roomResponse = await room.fetch(
      new Request("https://chat-room/admin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, pilotId, messageId, reason, enabled }),
      }),
    );
    const result = (await roomResponse.json().catch(() => null)) as { error?: string } | null;
    if (!roomResponse.ok)
      return json(
        { error: result?.error ?? "No se pudo aplicar la moderación." },
        roomResponse.status,
      );
  }
  await db
    .prepare(
      "INSERT INTO admin_chat_logs (id, action, target_pilot_id, message_id, reason, admin_email, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(
      crypto.randomUUID(),
      action,
      /^plt_[0-9a-f]{24}$/.test(pilotId) ? pilotId : null,
      Number.isSafeInteger(messageId) && messageId > 0 ? messageId : null,
      reason,
      account.email,
      Date.now(),
    )
    .run();
  return json({ success: true });
}
async function handleMarketRequest(
  request: Request,
  env: WorkerEnv | undefined,
): Promise<Response | null> {
  const url = new URL(request.url);
  const isMarketPath =
    url.pathname.startsWith("/api/market/") || url.pathname.startsWith("/api/inventory/");
  const isAdminPlayersPath =
    url.pathname === "/api/admin/players" ||
    /^\/api\/admin\/players\/[^/]+(?:\/status)?$/.test(url.pathname);
  const isAdminEconomyPath = url.pathname === "/api/admin/economy";
  const isAdminPaymentsPath = url.pathname === "/api/admin/payments";
  const isAdminMarketPath = url.pathname === "/api/admin/market";
  const isAdminPath =
    url.pathname === "/api/admin/credit-obsidian" ||
    isAdminPlayersPath ||
    isAdminEconomyPath ||
    isAdminPaymentsPath ||
    isAdminMarketPath;
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

  if (isAdminMarketPath) {
    if (request.method !== "GET" && request.method !== "POST") {
      return json({ error: "Método no permitido." }, 405);
    }
    if (request.method === "POST" && !isSameOriginPost(request, url)) {
      return json({ error: "Solicitud no autorizada." }, 403);
    }
    if (!account) return json({ error: "Inicia sesión con la cuenta administradora." }, 401);
    if (
      account.email.toLowerCase() !== ADMIN_EMAIL ||
      !(await hasValidAdminSession(db, request, account.google_sub))
    ) {
      return json({ error: "Acceso administrativo requerido." }, 403);
    }

    if (request.method === "GET") {
      const [stats, ads, orders, disputes, messages, logs] = await Promise.all([
        db
          .prepare(
            `SELECT
            (SELECT COUNT(*) FROM p2p_ads WHERE status IN ('ACTIVO', 'PAUSADO')) AS active_ads,
            (SELECT COUNT(*) FROM p2p_orders WHERE status IN ('PENDIENTE', 'PAGO_REPORTADO')) AS pending_orders,
            (SELECT COUNT(*) FROM p2p_disputes WHERE status = 'OPEN') AS open_disputes,
            (SELECT COUNT(*) FROM p2p_orders WHERE status = 'COMPLETADA') AS completed_orders`,
          )
          .first<{
            active_ads: number;
            pending_orders: number;
            open_disputes: number;
            completed_orders: number;
          }>(),
        db
          .prepare(
            `SELECT ad.id, ad.seller_pilot_id, ad.item_name, ad.item_type, ad.price_minor,
            ad.currency_code, ad.country_code, ad.status, ad.created_at,
            COALESCE(NULLIF(profile.display_name, ''), p.callsign, 'PILOTO') AS seller_name
           FROM p2p_ads ad
           JOIN pilots p ON p.pilot_id = ad.seller_pilot_id
           LEFT JOIN player_profiles profile ON profile.pilot_id = p.pilot_id
           ORDER BY ad.created_at DESC LIMIT 100`,
          )
          .all(),
        db
          .prepare(
            `SELECT o.id, o.status, o.created_at, o.updated_at, o.payment_method,
            o.buyer_pilot_id, ad.id AS ad_id, ad.seller_pilot_id, ad.item_name,
            ad.item_type, ad.price_minor, ad.currency_code, ad.country_code,
            COALESCE(NULLIF(bp.display_name, ''), buyer.callsign, 'PILOTO') AS buyer_name,
            COALESCE(NULLIF(sp.display_name, ''), seller.callsign, 'PILOTO') AS seller_name
           FROM p2p_orders o
           JOIN p2p_ads ad ON ad.id = o.ad_id
           JOIN pilots buyer ON buyer.pilot_id = o.buyer_pilot_id
           JOIN pilots seller ON seller.pilot_id = ad.seller_pilot_id
           LEFT JOIN player_profiles bp ON bp.pilot_id = buyer.pilot_id
           LEFT JOIN player_profiles sp ON sp.pilot_id = seller.pilot_id
           ORDER BY CASE WHEN o.status IN ('DISPUTA', 'PENDIENTE', 'PAGO_REPORTADO') THEN 0 ELSE 1 END,
             o.created_at DESC LIMIT 100`,
          )
          .all(),
        db
          .prepare(
            `SELECT d.id, d.order_id, d.opened_by_pilot_id, d.reason, d.evidence_url,
            d.status, d.created_at, d.resolved_at, d.resolved_by, d.resolution_note,
            o.status AS order_status, o.buyer_pilot_id, ad.seller_pilot_id,
            ad.item_name, ad.price_minor, ad.currency_code, ad.country_code,
            COALESCE(NULLIF(op.display_name, ''), opener.callsign, 'PILOTO') AS opened_by_name,
            COALESCE(NULLIF(bp.display_name, ''), buyer.callsign, 'PILOTO') AS buyer_name,
            COALESCE(NULLIF(sp.display_name, ''), seller.callsign, 'PILOTO') AS seller_name
           FROM p2p_disputes d
           JOIN p2p_orders o ON o.id = d.order_id
           JOIN p2p_ads ad ON ad.id = o.ad_id
           JOIN pilots opener ON opener.pilot_id = d.opened_by_pilot_id
           JOIN pilots buyer ON buyer.pilot_id = o.buyer_pilot_id
           JOIN pilots seller ON seller.pilot_id = ad.seller_pilot_id
           LEFT JOIN player_profiles op ON op.pilot_id = opener.pilot_id
           LEFT JOIN player_profiles bp ON bp.pilot_id = buyer.pilot_id
           LEFT JOIN player_profiles sp ON sp.pilot_id = seller.pilot_id
           ORDER BY CASE WHEN d.status = 'OPEN' THEN 0 ELSE 1 END, d.created_at DESC LIMIT 100`,
          )
          .all(),
        db
          .prepare(
            `SELECT m.id, m.dispute_id, m.author_pilot_id, m.message, m.evidence_url,
            m.created_at, COALESCE(NULLIF(profile.display_name, ''), p.callsign, 'PILOTO') AS author_name
           FROM p2p_dispute_messages m
           JOIN pilots p ON p.pilot_id = m.author_pilot_id
           LEFT JOIN player_profiles profile ON profile.pilot_id = p.pilot_id
           JOIN p2p_disputes d ON d.id = m.dispute_id
           ORDER BY m.created_at ASC LIMIT 300`,
          )
          .all(),
        db
          .prepare(
            "SELECT id, order_id, ad_id, action, resolution_note, admin_email, created_at FROM admin_market_logs ORDER BY created_at DESC LIMIT 100",
          )
          .all(),
      ]);
      return json({
        stats: stats ?? { active_ads: 0, pending_orders: 0, open_disputes: 0, completed_orders: 0 },
        ads: ads.results ?? [],
        orders: orders.results ?? [],
        disputes: disputes.results ?? [],
        messages: messages.results ?? [],
        logs: logs.results ?? [],
      });
    }

    const body = await readJson(request, 4096);
    const action = body?.["action"];
    const reason = typeof body?.["reason"] === "string" ? body["reason"].trim().slice(0, 240) : "";
    if (reason.length < 5) {
      return json({ error: "Escribe el motivo de la operación (mínimo 5 caracteres)." }, 400);
    }
    const now = Date.now();

    if (action === "resolve-buyer" || action === "resolve-seller") {
      const disputeId = typeof body?.["disputeId"] === "string" ? body["disputeId"].trim() : "";
      if (!/^dsp_[a-f0-9]{24}$/.test(disputeId)) {
        return json({ error: "Identificador de disputa no válido." }, 400);
      }
      const dispute = await db
        .prepare(
          `SELECT d.id, d.order_id, d.status, o.ad_id
         FROM p2p_disputes d JOIN p2p_orders o ON o.id = d.order_id
         WHERE d.id = ?`,
        )
        .bind(disputeId)
        .first<{ id: string; order_id: string; status: string; ad_id: string }>();
      if (!dispute) return json({ error: "No se encontró la disputa." }, 404);
      if (dispute.status !== "OPEN") return json({ error: "Esta disputa ya fue resuelta." }, 409);
      const finalStatus = action === "resolve-buyer" ? "COMPLETADA" : "CANCELADA";
      const disputeStatus = action === "resolve-buyer" ? "RESOLVED_BUYER" : "RESOLVED_SELLER";
      try {
        const results = await db.batch([
          db
            .prepare(
              "UPDATE p2p_orders SET status = 'PENDIENTE', updated_at = ? WHERE id = ? AND status = 'DISPUTA'",
            )
            .bind(now, dispute.order_id),
          db
            .prepare(
              "UPDATE p2p_orders SET status = ?, updated_at = ? WHERE id = ? AND status = 'PENDIENTE'",
            )
            .bind(finalStatus, now, dispute.order_id),
          db
            .prepare(
              "UPDATE p2p_disputes SET status = ?, resolved_at = ?, resolved_by = ?, resolution_note = ? WHERE id = ? AND status = 'OPEN'",
            )
            .bind(disputeStatus, now, account.email, reason, disputeId),
          db
            .prepare(
              "INSERT INTO admin_market_logs (id, order_id, ad_id, action, resolution_note, admin_email, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
            )
            .bind(
              "amk_" + randomHex(10),
              dispute.order_id,
              dispute.ad_id,
              action,
              reason,
              account.email,
              now,
            ),
        ]);
        if (results.slice(0, 3).some((result) => result.meta?.changes !== 1)) {
          return json(
            { error: "No se pudo resolver la disputa. No se modificó la operación." },
            409,
          );
        }
      } catch (error) {
        console.error("No se pudo resolver la disputa P2P:", error);
        return json({ error: "No se pudo resolver la disputa. La operación no se modificó." }, 409);
      }
      return json({ success: true, status: disputeStatus, orderStatus: finalStatus });
    }

    if (action === "remove-listing") {
      const adId = typeof body?.["adId"] === "string" ? body["adId"].trim() : "";
      if (!/^ad_[a-f0-9]{16}$/.test(adId)) {
        return json({ error: "Identificador de publicación no válido." }, 400);
      }
      try {
        const results = await db.batch([
          db
            .prepare(
              `UPDATE p2p_ads SET status = 'CANCELADO', updated_at = ?
             WHERE id = ? AND status IN ('ACTIVO', 'PAUSADO')
               AND NOT EXISTS (
                 SELECT 1 FROM p2p_orders o WHERE o.ad_id = p2p_ads.id
                   AND o.status IN ('PENDIENTE', 'PAGO_REPORTADO', 'DISPUTA')
               )`,
            )
            .bind(now, adId),
          db
            .prepare(
              `UPDATE pilot_inventory SET is_locked = 0, updated_at = ?
             WHERE id = (
               SELECT inventory_id FROM p2p_ads
               WHERE id = ? AND status = 'CANCELADO' AND updated_at = ?
             ) AND is_locked = 1`,
            )
            .bind(now, adId, now),
          db
            .prepare(
              "INSERT INTO admin_market_logs (id, order_id, ad_id, action, resolution_note, admin_email, created_at) VALUES (?, NULL, ?, 'remove-listing', ?, ?, ?)",
            )
            .bind("amk_" + randomHex(10), adId, reason, account.email, now),
        ]);
        if (results.some((result) => result.meta?.changes !== 1)) {
          return json(
            { error: "No se pudo retirar la publicación. No se modificó el artículo." },
            409,
          );
        }
      } catch (error) {
        console.error("No se pudo retirar la publicación P2P:", error);
        return json(
          { error: "No se pudo retirar la publicación. No se modificó el artículo." },
          409,
        );
      }
      return json({ success: true, status: "CANCELADO" });
    }

    return json({ error: "Operación de mercado no válida." }, 400);
  }

  if (isAdminPaymentsPath) {
    if (request.method !== "GET" && request.method !== "POST") {
      return json({ error: "Método no permitido." }, 405);
    }
    if (request.method === "POST" && !isSameOriginPost(request, url)) {
      return json({ error: "Solicitud no autorizada." }, 403);
    }
    if (!account) return json({ error: "Inicia sesión con la cuenta administradora." }, 401);
    if (
      account.email.toLowerCase() !== ADMIN_EMAIL ||
      !(await hasValidAdminSession(db, request, account.google_sub))
    ) {
      return json({ error: "Acceso administrativo requerido." }, 403);
    }

    if (request.method === "GET") {
      const [settings, rows] = await Promise.all([
        db
          .prepare(
            "SELECT wallet_address, qr_url, updated_at FROM admin_payment_settings WHERE id = 1",
          )
          .first<{ wallet_address: string; qr_url: string | null; updated_at: number }>(),
        db
          .prepare(
            `SELECT r.id, r.pilot_id, r.obsidian_amount, r.crypto_amount, r.currency,
              r.network, r.tx_hash, r.wallet_address, r.status, r.created_at,
              r.reviewed_at, r.reviewed_by, r.rejection_reason, p.callsign, pa.email
             FROM obsidian_payment_requests r
             JOIN pilots p ON p.pilot_id = r.pilot_id
             LEFT JOIN player_accounts pa ON pa.pilot_id = r.pilot_id
             ORDER BY CASE WHEN r.status = 'PENDING' THEN 0 ELSE 1 END,
               r.created_at DESC LIMIT 100`,
          )
          .all<{
            id: string;
            pilot_id: string;
            obsidian_amount: number;
            crypto_amount: string;
            currency: "USDT" | "USDC";
            network: "POLYGON";
            tx_hash: string;
            wallet_address: string;
            status: "PENDING" | "APPROVED" | "REJECTED";
            created_at: number;
            reviewed_at: number | null;
            reviewed_by: string | null;
            rejection_reason: string | null;
            callsign: string;
            email: string | null;
          }>(),
      ]);
      return json({
        settings: settings ?? { wallet_address: "", qr_url: null, updated_at: null },
        payments: rows.results ?? [],
      });
    }

    const body = await readJson(request, 4096);
    const action = body?.["action"];
    if (action === "save-wallet") {
      const walletAddress =
        typeof body?.["walletAddress"] === "string" ? body["walletAddress"].trim() : "";
      const qrUrl = typeof body?.["qrUrl"] === "string" ? body["qrUrl"].trim() : "";
      if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
        return json({ error: "La dirección de wallet Polygon no es válida." }, 400);
      }
      if (
        qrUrl.length > 2048 ||
        (qrUrl !== "" &&
          (() => {
            try {
              return new URL(qrUrl).protocol !== "https:";
            } catch {
              return true;
            }
          })())
      ) {
        return json(
          { error: "La dirección de la imagen QR debe ser un enlace HTTPS válido." },
          400,
        );
      }
      const now = Date.now();
      await db
        .prepare(
          `INSERT INTO admin_payment_settings (id, wallet_address, qr_url, updated_by, updated_at)
           VALUES (1, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET wallet_address = excluded.wallet_address,
             qr_url = excluded.qr_url, updated_by = excluded.updated_by,
             updated_at = excluded.updated_at`,
        )
        .bind(walletAddress, qrUrl || null, account.email, now)
        .run();
      return json({
        success: true,
        settings: { wallet_address: walletAddress, qr_url: qrUrl || null },
      });
    }

    if (action !== "approve" && action !== "reject") {
      return json({ error: "Operación de pago no válida." }, 400);
    }
    const paymentId = typeof body?.["paymentId"] === "string" ? body["paymentId"].trim() : "";
    if (!/^pay_[a-f0-9]{20}$/.test(paymentId)) {
      return json({ error: "Identificador de pago no válido." }, 400);
    }
    const payment = await db
      .prepare(
        "SELECT id, pilot_id, obsidian_amount, currency, network, tx_hash, status FROM obsidian_payment_requests WHERE id = ?",
      )
      .bind(paymentId)
      .first<{
        id: string;
        pilot_id: string;
        obsidian_amount: number;
        currency: "USDT" | "USDC";
        network: "POLYGON";
        tx_hash: string;
        status: "PENDING" | "APPROVED" | "REJECTED";
      }>();
    if (!payment) return json({ error: "No se encontró el pago." }, 404);
    if (payment.status !== "PENDING") {
      return json({ error: "Este pago ya fue revisado y no se puede procesar otra vez." }, 409);
    }

    const now = Date.now();
    if (action === "reject") {
      const reason =
        typeof body?.["reason"] === "string" ? body["reason"].trim().slice(0, 240) : "";
      if (reason.length < 5) {
        return json({ error: "Escribe un motivo de rechazo de al menos 5 caracteres." }, 400);
      }
      const result = await db
        .prepare(
          `UPDATE obsidian_payment_requests SET status = 'REJECTED',
            reviewed_at = ?, reviewed_by = ?, rejection_reason = ?
           WHERE id = ? AND status = 'PENDING'`,
        )
        .bind(now, account.email, reason, paymentId)
        .run();
      if (result.meta?.changes !== 1) {
        return json({ error: "El pago ya fue revisado. Actualiza la lista." }, 409);
      }
      return json({ success: true, status: "REJECTED" });
    }

    const pilot = await db
      .prepare("SELECT obsidian FROM pilots WHERE pilot_id = ?")
      .bind(payment.pilot_id)
      .first<{ obsidian: number }>();
    if (!pilot) return json({ error: "No se encontró el jugador del pago." }, 404);
    const balanceBefore = pilot.obsidian;
    const balanceAfter = balanceBefore + payment.obsidian_amount;
    if (!Number.isSafeInteger(balanceAfter) || balanceAfter < 0) {
      return json({ error: "El saldo del jugador no se puede actualizar." }, 409);
    }
    const reason = `Compra OBS por ${payment.currency} en Polygon · TX ${payment.tx_hash}`;
    try {
      const results = await db.batch([
        db
          .prepare(
            `UPDATE pilots SET obsidian = ?, updated_at = ?
             WHERE pilot_id = ? AND obsidian = ?
               AND EXISTS (
                 SELECT 1 FROM obsidian_payment_requests
                 WHERE id = ? AND status = 'PENDING'
               )`,
          )
          .bind(balanceAfter, now, payment.pilot_id, balanceBefore, paymentId),
        db
          .prepare(
            `UPDATE obsidian_payment_requests SET status = 'APPROVED',
              reviewed_at = ?, reviewed_by = ?
             WHERE id = ? AND status = 'PENDING'
               AND EXISTS (
                 SELECT 1 FROM pilots WHERE pilot_id = ? AND obsidian = ?
               )`,
          )
          .bind(now, account.email, paymentId, payment.pilot_id, balanceAfter),
        db
          .prepare(
            `INSERT INTO admin_economy_logs
             (id, pilot_id, currency, delta, balance_before, balance_after, reason, admin_email, created_at)
             SELECT ?, ?, CASE WHEN changes() = 1 THEN 'OBS' ELSE NULL END,
               ?, ?, ?, ?, ?, ?
             FROM obsidian_payment_requests WHERE id = ? AND status = 'APPROVED'`,
          )
          .bind(
            `econ_${randomHex(10)}`,
            payment.pilot_id,
            payment.obsidian_amount,
            balanceBefore,
            balanceAfter,
            reason,
            account.email,
            now,
            paymentId,
          ),
      ]);
      if (results.some((result) => result.meta?.changes !== 1)) {
        return json({ error: "No se pudo acreditar el pago. El saldo no fue modificado." }, 409);
      }
    } catch (error) {
      console.error("No se pudo aprobar el pago de OBS:", error);
      return json({ error: "No se pudo aprobar el pago. El saldo no fue modificado." }, 409);
    }
    return json({ success: true, status: "APPROVED", balanceBefore, balanceAfter });
  }

  if (isAdminEconomyPath) {
    if (request.method !== "GET" && request.method !== "POST") {
      return json({ error: "Método no permitido." }, 405);
    }
    if (request.method === "POST" && !isSameOriginPost(request, url)) {
      return json({ error: "Solicitud no autorizada." }, 403);
    }
    if (!account) return json({ error: "Inicia sesión con la cuenta administradora." }, 401);
    if (
      account.email.toLowerCase() !== ADMIN_EMAIL ||
      !(await hasValidAdminSession(db, request, account.google_sub))
    ) {
      return json({ error: "Acceso administrativo requerido." }, 403);
    }

    if (request.method === "GET") {
      const currency = url.searchParams.get("currency") ?? "Todos";
      const direction = url.searchParams.get("direction") ?? "Todos";
      const search = (url.searchParams.get("search") ?? "").trim().slice(0, 100);
      if (
        !["Todos", "CR", "OBS"].includes(currency) ||
        !["Todos", "Entradas", "Salidas"].includes(direction)
      ) {
        return json({ error: "Filtro de economía no válido." }, 400);
      }
      const pattern = "%" + search.replace(/[\\%_]/g, (character) => "\\" + character) + "%";
      const [totals, movements] = await Promise.all([
        db
          .prepare(
            `SELECT
            COALESCE(SUM(CASE WHEN json_valid(pr.progress_json) THEN CAST(COALESCE(json_extract(pr.progress_json, '$.credits'), 0) AS INTEGER) ELSE 0 END), 0) AS cr_total,
            COALESCE((SELECT SUM(obsidian) FROM pilots), 0) AS obs_total
           FROM player_progress pr`,
          )
          .first<{ cr_total: number; obs_total: number }>(),
        db
          .prepare(
            `SELECT l.id, l.pilot_id, l.currency, l.delta, l.balance_before, l.balance_after,
            l.reason, l.admin_email, l.created_at, p.callsign, pa.email
           FROM admin_economy_logs l
           JOIN pilots p ON p.pilot_id = l.pilot_id
           LEFT JOIN player_accounts pa ON pa.pilot_id = l.pilot_id
           WHERE (? = 'Todos' OR l.currency = ?)
             AND (? = 'Todos' OR (? = 'Entradas' AND l.delta > 0) OR (? = 'Salidas' AND l.delta < 0))
             AND (? = '' OR l.pilot_id LIKE ? ESCAPE '\\' OR p.callsign LIKE ? ESCAPE '\\' OR pa.email LIKE ? ESCAPE '\\')
           ORDER BY l.created_at DESC LIMIT 100`,
          )
          .bind(
            currency,
            currency,
            direction,
            direction,
            direction,
            search,
            pattern,
            pattern,
            pattern,
          )
          .all<{
            id: string;
            pilot_id: string;
            currency: string;
            delta: number;
            balance_before: number;
            balance_after: number;
            reason: string;
            admin_email: string;
            created_at: number;
            callsign: string;
            email: string | null;
          }>(),
      ]);
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayCount = await db
        .prepare("SELECT COUNT(*) AS total FROM admin_economy_logs WHERE created_at >= ?")
        .bind(todayStart.getTime())
        .first<{ total: number }>();
      return json({
        totals: {
          cr: totals?.cr_total ?? 0,
          obs: totals?.obs_total ?? 0,
          movementsToday: todayCount?.total ?? 0,
        },
        movements: movements.results ?? [],
      });
    }

    const body = await readJson(request, 4096);
    const playerQuery =
      typeof body?.["player"] === "string" ? body["player"].trim().slice(0, 100) : "";
    const currency = body?.["currency"];
    const operation = body?.["operation"];
    const amount = body?.["amount"];
    const reason = typeof body?.["reason"] === "string" ? body["reason"].trim().slice(0, 240) : "";
    if (
      !playerQuery ||
      (currency !== "CR" && currency !== "OBS") ||
      (operation !== "credit" && operation !== "debit") ||
      typeof amount !== "number" ||
      !Number.isSafeInteger(amount) ||
      amount < 1 ||
      amount > 1_000_000_000 ||
      reason.length < 5
    ) {
      return json({ error: "Datos no válidos. Revisa jugador, moneda, cantidad y motivo." }, 400);
    }
    const matches = await db
      .prepare(
        `SELECT p.pilot_id, p.obsidian
       FROM pilots p
       LEFT JOIN player_accounts pa ON pa.pilot_id = p.pilot_id
       LEFT JOIN player_profiles pp ON pp.pilot_id = p.pilot_id
       WHERE p.pilot_id = ? OR LOWER(pa.email) = LOWER(?)
         OR LOWER(p.callsign) = LOWER(?) OR LOWER(pp.display_name) = LOWER(?)
       LIMIT 2`,
      )
      .bind(playerQuery, playerQuery, playerQuery, playerQuery)
      .all<{ pilot_id: string; obsidian: number }>();
    const matchedPlayers = matches.results ?? [];
    if (!matchedPlayers.length) return json({ error: "No se encontró el jugador." }, 404);
    if (matchedPlayers.length > 1)
      return json({ error: "Hay varios jugadores con ese nombre. Usa su ID o correo." }, 409);
    const pilot = matchedPlayers[0]!;
    const pilotId = pilot.pilot_id;

    let balanceBefore = 0;
    if (currency === "CR") {
      const current = await db
        .prepare("SELECT progress_json FROM player_progress WHERE pilot_id = ?")
        .bind(pilotId)
        .first<{ progress_json: string }>();
      try {
        const progress = current?.progress_json
          ? (JSON.parse(current.progress_json) as { credits?: unknown })
          : {};
        balanceBefore = Number.isSafeInteger(Number(progress["credits"]))
          ? Math.max(0, Number(progress["credits"]))
          : 0;
      } catch {
        return json({ error: "El saldo CR del jugador no se puede leer." }, 409);
      }
    } else {
      balanceBefore = pilot.obsidian;
    }
    const delta = operation === "credit" ? amount : -amount;
    const balanceAfter = balanceBefore + delta;
    if (!Number.isSafeInteger(balanceAfter) || balanceAfter < 0) {
      return json({ error: "El jugador no tiene saldo suficiente para ese descuento." }, 409);
    }
    const now = Date.now();
    const logId = "econ_" + randomHex(10);
    const update =
      currency === "OBS"
        ? db
            .prepare(
              "UPDATE pilots SET obsidian = ?, updated_at = ? WHERE pilot_id = ? AND obsidian = ?",
            )
            .bind(balanceAfter, now, pilotId, balanceBefore)
        : db
            .prepare(
              `INSERT INTO player_progress (pilot_id, progress_json, updated_at)
           VALUES (?, json_object('v', 1, 'credits', ?), ?)
           ON CONFLICT(pilot_id) DO UPDATE SET
             progress_json = json_set(player_progress.progress_json, '$.credits', ?),
             updated_at = excluded.updated_at
           WHERE CAST(COALESCE(json_extract(player_progress.progress_json, '$.credits'), 0) AS INTEGER) = ?`,
            )
            .bind(pilotId, balanceAfter, now, balanceAfter, balanceBefore);
    const log =
      currency === "OBS"
        ? db
            .prepare(
              `INSERT INTO admin_economy_logs
           (id, pilot_id, currency, delta, balance_before, balance_after, reason, admin_email, created_at)
           SELECT ?, ?, CASE WHEN changes() = 1 THEN ? ELSE NULL END, ?, ?, ?, ?, ?, ?
           FROM pilots WHERE pilot_id = ? AND obsidian = ?`,
            )
            .bind(
              logId,
              pilotId,
              currency,
              delta,
              balanceBefore,
              balanceAfter,
              reason,
              account.email,
              now,
              pilotId,
              balanceAfter,
            )
        : db
            .prepare(
              `INSERT INTO admin_economy_logs
           (id, pilot_id, currency, delta, balance_before, balance_after, reason, admin_email, created_at)
           SELECT ?, ?, CASE WHEN changes() = 1 THEN ? ELSE NULL END, ?, ?, ?, ?, ?, ?
           FROM player_progress
           WHERE pilot_id = ? AND CAST(COALESCE(json_extract(progress_json, '$.credits'), 0) AS INTEGER) = ?`,
            )
            .bind(
              logId,
              pilotId,
              currency,
              delta,
              balanceBefore,
              balanceAfter,
              reason,
              account.email,
              now,
              pilotId,
              balanceAfter,
            );
    let results;
    try {
      results = await db.batch([update, log]);
    } catch (error) {
      console.error("No se pudo guardar el ajuste y su registro económico:", error);
      return json(
        { error: "No se pudo completar el ajuste económico. El saldo no fue modificado." },
        409,
      );
    }
    if (results[0]?.meta?.changes !== 1 || results[1]?.meta?.changes !== 1) {
      return json(
        {
          error:
            "El saldo cambió durante la operación. Actualiza la pantalla e inténtalo de nuevo.",
        },
        409,
      );
    }
    return json({ success: true, currency, balanceBefore, balanceAfter, delta });
  }

  if (isAdminPlayersPath) {
    if (request.method !== "GET" && request.method !== "POST") {
      return json({ error: "Método no permitido." }, 405);
    }
    if (request.method === "POST" && !isSameOriginPost(request, url)) {
      return json({ error: "Solicitud no autorizada." }, 403);
    }
    if (!account) return json({ error: "Inicia sesión con la cuenta administradora." }, 401);
    if (
      account.email.toLowerCase() !== ADMIN_EMAIL ||
      !(await hasValidAdminSession(db, request, account.google_sub))
    ) {
      return json({ error: "Acceso administrativo requerido." }, 403);
    }

    const playerPath = url.pathname.match(/^\/api\/admin\/players(?:\/([^/]+)(?:\/status)?)?$/);
    const pilotId = playerPath?.[1];
    const isStatusPath = url.pathname.endsWith("/status");

    if (request.method === "GET" && !pilotId) {
      const search = (url.searchParams.get("search") ?? "").trim().slice(0, 100);
      const filter = url.searchParams.get("filter") ?? "Todos";
      const pattern = "%" + search.replace(/[\\%_]/g, (character) => "\\" + character) + "%";
      const rows = await db
        .prepare(
          `SELECT p.pilot_id, p.callsign, p.obsidian, p.boss_obsidian, p.vip_until,
            p.created_at, pa.email, pp.display_name, aps.suspended_at, pr.progress_json
           FROM pilots p
           JOIN player_accounts pa ON pa.pilot_id = p.pilot_id
           LEFT JOIN player_profiles pp ON pp.pilot_id = p.pilot_id
           LEFT JOIN admin_player_status aps ON aps.pilot_id = p.pilot_id
           LEFT JOIN player_progress pr ON pr.pilot_id = p.pilot_id
           WHERE (? = '' OR p.pilot_id LIKE ? ESCAPE '\\'
             OR pa.email LIKE ? ESCAPE '\\'
             OR p.callsign LIKE ? ESCAPE '\\'
             OR pp.display_name LIKE ? ESCAPE '\\')
             AND (? != 'VIP' OR p.vip_until > ?)
             AND (? != 'Suspendidos' OR aps.suspended_at IS NOT NULL)
             AND (? != 'Activos' OR aps.suspended_at IS NULL)
           ORDER BY p.created_at DESC LIMIT 100`,
        )
        .bind(search, pattern, pattern, pattern, pattern, filter, Date.now(), filter, filter)
        .all<{
          pilot_id: string;
          callsign: string;
          obsidian: number;
          boss_obsidian: number;
          vip_until: number | null;
          created_at: number;
          email: string;
          display_name: string | null;
          suspended_at: number | null;
          progress_json: string | null;
        }>();
      const players = (rows.results ?? []).map((row) => {
        let credits = 0;
        try {
          const progress = row.progress_json
            ? (JSON.parse(row.progress_json) as { credits?: unknown })
            : {};
          credits = Number(progress["credits"]) || 0;
        } catch {
          /* Un progreso dañado no debe impedir mostrar el resto del perfil. */
        }
        return {
          pilotId: row.pilot_id,
          name: row.display_name?.trim() || row.callsign,
          email: row.email,
          credits,
          obsidian: row.obsidian,
          bossObsidian: row.boss_obsidian,
          vipUntil: row.vip_until,
          suspended: row.suspended_at !== null,
          createdAt: row.created_at,
        };
      });
      return json({ players });
    }

    if (!pilotId || !validPilotId(pilotId)) return json({ error: "Piloto no válido." }, 400);

    if (request.method === "GET" && !isStatusPath) {
      const player = await db
        .prepare(
          `SELECT p.pilot_id, p.callsign, p.obsidian, p.boss_obsidian, p.vip_until,
            p.created_at, p.updated_at, p.selected_ship_id, pa.email, pp.display_name,
            aps.suspended_at, aps.reason, pr.progress_json
           FROM pilots p
           JOIN player_accounts pa ON pa.pilot_id = p.pilot_id
           LEFT JOIN player_profiles pp ON pp.pilot_id = p.pilot_id
           LEFT JOIN admin_player_status aps ON aps.pilot_id = p.pilot_id
           LEFT JOIN player_progress pr ON pr.pilot_id = p.pilot_id
           WHERE p.pilot_id = ?`,
        )
        .bind(pilotId)
        .first<{
          pilot_id: string;
          callsign: string;
          obsidian: number;
          boss_obsidian: number;
          vip_until: number | null;
          created_at: number;
          updated_at: number;
          selected_ship_id: string;
          email: string;
          display_name: string | null;
          suspended_at: number | null;
          reason: string | null;
          progress_json: string | null;
        }>();
      if (!player) return json({ error: "No se encontró el jugador." }, 404);
      let progress: Record<string, unknown> = {};
      try {
        progress = player.progress_json
          ? (JSON.parse(player.progress_json) as Record<string, unknown>)
          : {};
      } catch {
        progress = {};
      }
      const [inventory, referralCount, history, adminActions] = await Promise.all([
        db
          .prepare(
            "SELECT id, item_id, item_name, item_type, quantity, is_locked, grant_source FROM pilot_inventory WHERE pilot_id = ? AND quantity > 0 ORDER BY item_type, item_name",
          )
          .bind(pilotId)
          .all<{
            id: string;
            item_id: string;
            item_name: string;
            item_type: string;
            quantity: number;
            is_locked: number;
            grant_source: string;
          }>(),
        db
          .prepare("SELECT COUNT(*) AS total FROM referrals WHERE referrer_pilot_id = ?")
          .bind(pilotId)
          .first<{ total: number }>(),
        db
          .prepare(
            `SELECT amount, reason, created_at FROM (
             SELECT amount, reason, created_at FROM admin_obsidian_logs WHERE pilot_id = ?
             UNION ALL
             SELECT delta AS amount, reason, created_at FROM admin_economy_logs
             WHERE pilot_id = ? AND currency = 'OBS'
           ) ORDER BY created_at DESC LIMIT 30`,
          )
          .bind(pilotId, pilotId)
          .all<{ amount: number; reason: string; created_at: number }>(),
        db
          .prepare(
            "SELECT action, reason, created_at FROM admin_player_logs WHERE pilot_id = ? ORDER BY created_at DESC LIMIT 30",
          )
          .bind(pilotId)
          .all<{ action: string; reason: string; created_at: number }>(),
      ]);
      return json({
        player: {
          pilotId: player.pilot_id,
          name: player.display_name?.trim() || player.callsign,
          email: player.email,
          credits: Number(progress["credits"]) || 0,
          obsidian: player.obsidian,
          bossObsidian: player.boss_obsidian,
          vipUntil: player.vip_until,
          selectedShipId: player.selected_ship_id,
          createdAt: player.created_at,
          updatedAt: player.updated_at,
          suspended: player.suspended_at !== null,
          suspensionReason: player.reason,
          referrals: referralCount?.total ?? 0,
        },
        inventory: inventory.results ?? [],
        history: history.results ?? [],
        adminActions: adminActions.results ?? [],
      });
    }

    if (request.method === "POST" && isStatusPath) {
      const body = await readJson(request, 2048);
      if (typeof body?.["suspended"] !== "boolean") {
        return json({ error: "Indica si la cuenta debe quedar suspendida o activa." }, 400);
      }
      const reason = typeof body["reason"] === "string" ? body["reason"].trim().slice(0, 240) : "";
      if (body["suspended"] && reason.length < 5) {
        return json({ error: "Escribe un motivo de al menos 5 caracteres." }, 400);
      }
      const target = await db
        .prepare("SELECT google_sub FROM player_accounts WHERE pilot_id = ?")
        .bind(pilotId)
        .first<{ google_sub: string }>();
      if (!target) return json({ error: "No se encontró el jugador." }, 404);
      if (body["suspended"] && target.google_sub === account.google_sub) {
        return json({ error: "No puedes suspender tu propia cuenta administradora." }, 400);
      }
      const now = Date.now();
      const action = body["suspended"] ? "SUSPENDIDO" : "REACTIVADO";
      const statements = [
        db
          .prepare(
            `INSERT INTO admin_player_status (pilot_id, suspended_at, reason, updated_at)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(pilot_id) DO UPDATE SET
             suspended_at = excluded.suspended_at,
             reason = excluded.reason,
             updated_at = excluded.updated_at`,
          )
          .bind(pilotId, body["suspended"] ? now : null, body["suspended"] ? reason : null, now),
        db
          .prepare(
            "INSERT INTO admin_player_logs (id, pilot_id, action, reason, created_at) VALUES (?, ?, ?, ?, ?)",
          )
          .bind("plog_" + randomHex(8), pilotId, action, reason || "Sin motivo indicado", now),
      ];
      if (body["suspended"]) {
        statements.push(
          db
            .prepare("DELETE FROM auth_sessions WHERE wallet_address = ?")
            .bind("google:" + target.google_sub),
        );
      }
      await db.batch(statements);
      return json({ success: true, suspended: body["suspended"] });
    }

    return json({ error: "Ruta de jugador no encontrada." }, 404);
  }

  if (isAdminPath && request.method === "POST") {
    if (!isSameOriginPost(request, url)) return json({ error: "Solicitud no autorizada." }, 403);
    if (!account) return json({ error: "Inicia sesión con la cuenta administradora." }, 401);
    if (
      account.email.toLowerCase() !== ADMIN_EMAIL ||
      !(await hasValidAdminSession(db, request, account.google_sub))
    ) {
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
            `INSERT INTO admin_economy_logs
          (id, pilot_id, currency, delta, balance_before, balance_after, reason, admin_email, created_at)
          SELECT ?, pilot_id, CASE WHEN changes() = 1 THEN 'OBS' ELSE NULL END,
            ?, obsidian - ?, obsidian, ?, ?, ?
          FROM pilots WHERE pilot_id = ?`,
          )
          .bind(
            `econ_${randomHex(10)}`,
            amount,
            amount,
            "PAQUETE_ADMINISTRATIVO",
            account.email,
            now,
            pilotId,
          ),
        db
          .prepare(
            `INSERT INTO admin_obsidian_logs
          (id, pilot_id, amount, reason, created_at) VALUES (?, ?, ?, ?, ?)`,
          )
          .bind(`obs_${randomHex(8)}`, pilotId, amount, "PAQUETE_ADMINISTRATIVO", now),
      ]);
      if (
        results[0]?.meta?.changes !== 1 ||
        results[1]?.meta?.changes !== 1 ||
        results[2]?.meta?.changes !== 1
      ) {
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
  if (url.pathname === "/api/market/dispute" && request.method === "POST") {
    const body = await readJson(request, 4096);
    const orderId = typeof body?.["order_id"] === "string" ? body["order_id"].trim() : "";
    const reason = typeof body?.["reason"] === "string" ? body["reason"].trim().slice(0, 500) : "";
    const evidenceUrl =
      typeof body?.["evidence_url"] === "string" ? body["evidence_url"].trim() : "";
    if (!orderId || orderId.length > 64 || reason.length < 10) {
      return pilotJson(
        request,
        pilotId,
        { error: "Indica la orden y explica el problema (mínimo 10 caracteres)." },
        400,
      );
    }
    if (evidenceUrl && (evidenceUrl.length > 2048 || !/^https:\/\//i.test(evidenceUrl))) {
      return pilotJson(request, pilotId, { error: "El enlace de la prueba debe ser HTTPS." }, 400);
    }
    const order = await db
      .prepare(
        `SELECT o.id, o.status, o.buyer_pilot_id, ad.seller_pilot_id
       FROM p2p_orders o JOIN p2p_ads ad ON ad.id = o.ad_id WHERE o.id = ?`,
      )
      .bind(orderId)
      .first<{ id: string; status: string; buyer_pilot_id: string; seller_pilot_id: string }>();
    if (!order || (order.buyer_pilot_id !== pilotId && order.seller_pilot_id !== pilotId)) {
      return pilotJson(
        request,
        pilotId,
        { error: "La orden no existe o no participas en ella." },
        404,
      );
    }
    if (order.status !== "PENDIENTE" && order.status !== "PAGO_REPORTADO") {
      return pilotJson(
        request,
        pilotId,
        { error: "Solo se puede disputar una orden en curso." },
        409,
      );
    }
    const now = Date.now();
    const disputeId = "dsp_" + randomHex(12);
    try {
      const results = await db.batch([
        db
          .prepare(
            "UPDATE p2p_orders SET status = 'DISPUTA', updated_at = ? WHERE id = ? AND status IN ('PENDIENTE', 'PAGO_REPORTADO')",
          )
          .bind(now, orderId),
        db
          .prepare(
            "INSERT INTO p2p_disputes (id, order_id, opened_by_pilot_id, reason, evidence_url, status, created_at) SELECT ?, ?, ?, ?, ?, 'OPEN', ? WHERE EXISTS (SELECT 1 FROM p2p_orders WHERE id = ? AND status = 'DISPUTA')",
          )
          .bind(disputeId, orderId, pilotId, reason, evidenceUrl || null, now, orderId),
        db
          .prepare(
            "INSERT INTO p2p_dispute_messages (id, dispute_id, author_pilot_id, message, evidence_url, created_at) SELECT ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM p2p_disputes WHERE id = ?)",
          )
          .bind(
            "dmsg_" + randomHex(12),
            disputeId,
            pilotId,
            reason,
            evidenceUrl || null,
            now,
            disputeId,
          ),
      ]);
      if (results.some((result) => result.meta?.changes !== 1)) {
        return pilotJson(request, pilotId, { error: "No se pudo abrir la disputa." }, 409);
      }
    } catch (error) {
      console.error("No se pudo abrir la disputa P2P:", error);
      return pilotJson(request, pilotId, { error: "No se pudo abrir la disputa." }, 409);
    }
    return pilotJson(request, pilotId, { success: true, dispute_id: disputeId, status: "DISPUTA" });
  }

  if (url.pathname === "/api/market/dispute/message" && request.method === "POST") {
    const body = await readJson(request, 4096);
    const orderId = typeof body?.["order_id"] === "string" ? body["order_id"].trim() : "";
    const message =
      typeof body?.["message"] === "string" ? body["message"].trim().slice(0, 1000) : "";
    const evidenceUrl =
      typeof body?.["evidence_url"] === "string" ? body["evidence_url"].trim() : "";
    if (!orderId || orderId.length > 64 || message.length < 2) {
      return pilotJson(request, pilotId, { error: "Escribe un mensaje válido." }, 400);
    }
    if (evidenceUrl && (evidenceUrl.length > 2048 || !/^https:\/\//i.test(evidenceUrl))) {
      return pilotJson(request, pilotId, { error: "El enlace de la prueba debe ser HTTPS." }, 400);
    }
    const dispute = await db
      .prepare(
        `SELECT d.id FROM p2p_disputes d
       JOIN p2p_orders o ON o.id = d.order_id
       JOIN p2p_ads ad ON ad.id = o.ad_id
       WHERE o.id = ? AND o.status = 'DISPUTA' AND d.status = 'OPEN'
         AND (o.buyer_pilot_id = ? OR ad.seller_pilot_id = ?)`,
      )
      .bind(orderId, pilotId, pilotId)
      .first<{ id: string }>();
    if (!dispute)
      return pilotJson(
        request,
        pilotId,
        { error: "No existe una disputa abierta para esta orden." },
        404,
      );
    const now = Date.now();
    await db
      .prepare(
        "INSERT INTO p2p_dispute_messages (id, dispute_id, author_pilot_id, message, evidence_url, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .bind("dmsg_" + randomHex(12), dispute.id, pilotId, message, evidenceUrl || null, now)
      .run();
    return pilotJson(request, pilotId, { success: true });
  }

  if (url.pathname === "/api/market/dispute/messages" && request.method === "GET") {
    const orderId = url.searchParams.get("order_id") ?? "";
    const dispute = await db
      .prepare(
        `SELECT d.id FROM p2p_disputes d
       JOIN p2p_orders o ON o.id = d.order_id
       JOIN p2p_ads ad ON ad.id = o.ad_id
       WHERE o.id = ? AND (o.buyer_pilot_id = ? OR ad.seller_pilot_id = ?)`,
      )
      .bind(orderId, pilotId, pilotId)
      .first<{ id: string }>();
    if (!dispute)
      return pilotJson(request, pilotId, { error: "No existe una disputa para esta orden." }, 404);
    const messages = await db
      .prepare(
        `SELECT m.id, m.author_pilot_id, m.message, m.evidence_url, m.created_at,
        COALESCE(NULLIF(profile.display_name, ''), p.callsign, 'PILOTO') AS author_name
       FROM p2p_dispute_messages m
       JOIN pilots p ON p.pilot_id = m.author_pilot_id
       LEFT JOIN player_profiles profile ON profile.pilot_id = p.pilot_id
       WHERE m.dispute_id = ? ORDER BY m.created_at ASC LIMIT 100`,
      )
      .bind(dispute.id)
      .all();
    return pilotJson(request, pilotId, { messages: messages.results ?? [] });
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

  if (url.pathname === "/api/market/report-payment" && request.method === "POST") {
    const body = await readJson(request, 2048);
    const orderId = typeof body?.["order_id"] === "string" ? body["order_id"].trim() : "";
    if (!orderId || orderId.length > 64) {
      return pilotJson(request, pilotId, { error: "La orden indicada no es válida." }, 400);
    }
    const result = await db
      .prepare(
        `UPDATE p2p_orders SET status = 'PAGO_REPORTADO', buyer_paid_at = ?, updated_at = ?
       WHERE id = ? AND buyer_pilot_id = ? AND status = 'PENDIENTE'
       RETURNING id`,
      )
      .bind(Date.now(), Date.now(), orderId, pilotId)
      .first<{ id: string }>();
    if (!result)
      return pilotJson(
        request,
        pilotId,
        { error: "La orden no existe, no te pertenece o ya fue procesada." },
        409,
      );
    return pilotJson(request, pilotId, {
      success: true,
      order_id: result.id,
      status: "PAGO_REPORTADO",
    });
  }

  if (url.pathname === "/api/market/release" && request.method === "POST") {
    const body = await readJson(request, 2048);
    const orderId = typeof body?.["order_id"] === "string" ? body["order_id"].trim() : "";
    if (!orderId || orderId.length > 64) {
      return pilotJson(request, pilotId, { error: "La orden indicada no es válida." }, 400);
    }
    const seller = await db
      .prepare(
        "SELECT ad.seller_pilot_id FROM p2p_orders o JOIN p2p_ads ad ON ad.id = o.ad_id WHERE o.id = ?",
      )
      .bind(orderId)
      .first<{ seller_pilot_id: string }>();
    if (!seller || seller.seller_pilot_id !== pilotId) {
      return pilotJson(
        request,
        pilotId,
        { error: "Solo el vendedor de esta orden puede liberar el artículo." },
        403,
      );
    }
    try {
      const result = await db
        .prepare(
          `UPDATE p2p_orders SET status = 'COMPLETADA', updated_at = ?
         WHERE id = ? AND status = 'PAGO_REPORTADO' RETURNING id`,
        )
        .bind(Date.now(), orderId)
        .first<{ id: string }>();
      if (!result)
        return pilotJson(
          request,
          pilotId,
          { error: "La orden aún no tiene el pago reportado o ya fue procesada." },
          409,
        );
      return pilotJson(request, pilotId, {
        success: true,
        order_id: result.id,
        status: "COMPLETADA",
      });
    } catch (error) {
      console.error("No se pudo liberar el artículo del mercado:", error);
      return pilotJson(
        request,
        pilotId,
        { error: "No se pudo liberar el artículo. La operación fue revertida." },
        409,
      );
    }
  }

  if (url.pathname === "/api/market/confirm" && request.method === "POST") {
    return pilotJson(
      request,
      pilotId,
      {
        error:
          "El comprador no puede liberar el artículo. Esa acción corresponde al vendedor después de verificar el pago.",
      },
      403,
    );
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
        const showPayment =
          order.role === "COMPRADOR" && ["PENDIENTE", "PAGO_REPORTADO"].includes(order.status);
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
            `UPDATE pilots SET obsidian = obsidian - 1, updated_at = ?
          WHERE pilot_id = ? AND obsidian >= 1
          RETURNING pilot_id`,
          )
          .bind(now, pilotId),
        db
          .prepare(
            `UPDATE pilot_inventory SET is_locked = 1, updated_at = ?
          WHERE id = ? AND pilot_id = ? AND is_locked = 0 AND quantity > 0
            AND item_id != 'obsidian'
            AND (item_type != 'nave' OR (item_id != 'falcon'
              AND item_id != (SELECT selected_ship_id FROM pilots WHERE pilot_id = ?)))
          RETURNING id`,
          )
          .bind(now, inventoryId, pilotId, pilotId),
        db
          .prepare(
            `INSERT INTO p2p_ads
          (id, seller_pilot_id, inventory_id, item_id, item_name, item_type,
            price, price_minor, currency, currency_code, country_code,
            payment_methods, payment_details, payment_data_json,
            status, fee_paid, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVO', 1, ?, ?)
          RETURNING id`,
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
      ]);
      if (
        results.length !== 3 ||
        results.some((result) => result.success === false || result.meta?.changes !== 1)
      ) {
        throw new Error("La publicación no pudo confirmar el descuento, la reserva y el anuncio.");
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
          WHERE ad_id = ? AND status IN ('ABIERTA', 'PENDIENTE', 'PAGO_REPORTADO', 'DISPUTA', 'OPEN'))`,
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
              WHERE ad_id = ? AND status IN ('ABIERTA', 'PENDIENTE', 'PAGO_REPORTADO', 'DISPUTA', 'OPEN'))`,
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
      const maintenanceResponse = await handleMaintenanceGate(request, workerEnv);
      if (maintenanceResponse) return maintenanceResponse;
      const summaryAdminResponse = await handleAdminSummaryRequest(request, workerEnv);
      if (summaryAdminResponse) return summaryAdminResponse;
      const configAdminResponse = await handleAdminConfigRequest(request, workerEnv);
      if (configAdminResponse) return configAdminResponse;
      const securityAdminResponse = await handleAdminSecurityRequest(request, workerEnv);
      if (securityAdminResponse) return securityAdminResponse;
      const alliancesAdminResponse = await handleAdminAlliancesRequest(request, workerEnv);
      if (alliancesAdminResponse) return alliancesAdminResponse;
      const seasonsResponse = await handleAdminSeasonsRequest(request, workerEnv);
      if (seasonsResponse) return seasonsResponse;
      const rewardsResponse = await handleAdminRewardsRequest(request, workerEnv);
      if (rewardsResponse) return rewardsResponse;
      const rewardsFeedResponse = await handlePilotRewardsRequest(request, workerEnv);
      if (rewardsFeedResponse) return rewardsFeedResponse;
      const supportResponse = await handleSupportRequest(request, workerEnv);
      if (supportResponse) return supportResponse;
      const announcementsResponse = await handleAnnouncementsRequest(request, workerEnv);
      if (announcementsResponse) return announcementsResponse;
      const adminChatResponse = await handleAdminChatRequest(request, workerEnv);
      if (adminChatResponse) return adminChatResponse;
      const chatResponse = await handleChatRequest(request, workerEnv);
      if (chatResponse) return chatResponse;
      const authResponse = await handleAuthRequest(request, workerEnv);
      if (authResponse) return authResponse;
      const adminAuthResponse = await handleAdminAuthRequest(request, workerEnv);
      if (adminAuthResponse) return adminAuthResponse;
      const realEconomyResponse = await handleRealEconomyRequest(request, workerEnv);
      if (realEconomyResponse) return realEconomyResponse;
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
      if (pathname.startsWith("/api/")) {
        try {
          const errorEnv = getWorkerEnv(request, env);
          if (errorEnv?.DB) {
            await errorEnv.DB.prepare(
              `CREATE TABLE IF NOT EXISTS admin_server_errors (
              id TEXT PRIMARY KEY, route TEXT NOT NULL, error_message TEXT NOT NULL,
              created_at INTEGER NOT NULL
            )`,
            ).run();
            const message =
              error instanceof Error
                ? (error.name + ": " + error.message).slice(0, 500)
                : String(error).slice(0, 500);
            await errorEnv.DB.prepare(
              "INSERT INTO admin_server_errors (id,route,error_message,created_at) VALUES (?,?,?,?)",
            )
              .bind(randomHex(16), pathname.slice(0, 160), message, Date.now())
              .run();
          }
        } catch (loggingError) {
          console.error("No se pudo guardar el error del servidor:", loggingError);
        }
      }
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
export { PilotNotifyRoom } from "./game/pilot-notify-room";

export { WarRoom } from "./game/war-room";

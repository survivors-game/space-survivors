import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { SHIPS } from "./game/data/ships";

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
type WorkerEnv = {
  DB?: D1Database;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GOOGLE_REDIRECT_URI?: string;
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
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const GOOGLE_STATE_TTL_MS = 10 * 60 * 1000;
const ADMIN_EMAIL = "emprendedora.onlinevee@gmail.com";
const GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
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

  return {
    DB: database,
    GOOGLE_CLIENT_ID: candidates.find((candidate) => candidate.GOOGLE_CLIENT_ID)?.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: candidates.find((candidate) => candidate.GOOGLE_CLIENT_SECRET)?.GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI: candidates.find((candidate) => candidate.GOOGLE_REDIRECT_URI)?.GOOGLE_REDIRECT_URI,
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

async function handleAuthRequest(
  request: Request,
  env: WorkerEnv | undefined,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/auth/")) return null;
  if (!env?.DB) return json({ error: "La base de datos no está disponible en este Worker." }, 503);

  const db = env.DB;
  try {
    await ensureAuthSchema(db);
  } catch (error) {
    console.error("No se pudo preparar el esquema de autenticación:", error);
    return json({ error: "No se pudo preparar la autenticación. Inténtalo de nuevo." }, 503);
  }

  if (url.pathname === "/api/auth/google/start" && request.method === "POST") {
    if (!isSameOriginPost(request, url)) return json({ error: "Solicitud no autorizada." }, 403);
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
    return json({
      authenticated: true,
      email: account.email,
      playerId: account.pilot_id,
      isAdmin: account.email === ADMIN_EMAIL,
      progress: savedProgress ? JSON.parse(savedProgress.progress_json) : null,
    });
  }

  if (url.pathname === "/api/auth/progress" && request.method === "GET") {
    const account = await getAuthenticatedAccount(db, await requestSessionHash(request));
    if (!account)
      return json({ error: "Inicia sesión con Google para recuperar el progreso." }, 401);
    const savedProgress = await db
      .prepare(`SELECT progress_json FROM player_progress WHERE pilot_id = ?`)
      .bind(account.pilot_id)
      .first<{ progress_json: string }>();
    return json({ progress: savedProgress ? JSON.parse(savedProgress.progress_json) : null });
  }

  if (url.pathname === "/api/auth/progress" && request.method === "POST") {
    if (!isSameOriginPost(request, url)) return json({ error: "Solicitud no autorizada." }, 403);
    const account = await getAuthenticatedAccount(db, await requestSessionHash(request));
    if (!account) return json({ error: "Inicia sesión con Google para guardar el progreso." }, 401);
    const body = await readJson(request, 65536);
    if (!body || !body["progress"] || typeof body["progress"] !== "object") {
      return json({ error: "Los datos del progreso no son válidos." }, 400);
    }
    await db
      .prepare(
        `INSERT INTO player_progress (pilot_id, progress_json, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(pilot_id) DO UPDATE SET
        progress_json = excluded.progress_json, updated_at = excluded.updated_at`,
      )
      .bind(account.pilot_id, JSON.stringify(body["progress"]), Date.now())
      .run();
    return json({ success: true });
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

type MarketInventoryRow = {
  id: string;
  item_id: string;
  item_name: string;
  item_type: "nave" | "objeto";
  quantity: number;
  is_locked: number;
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
  payment_methods: string;
  payment_details: string;
  status: "ACTIVO" | "PAUSADO" | "CANCELADO" | "VENDIDO";
  fee_paid: number;
  created_at: number;
  updated_at: number;
};

const VALID_PILOT_ID = /^plt_[0-9a-f]{24}$/;
const VALID_PAY_METHODS = new Set(["NEQUI", "DAVIPLATA", "TRANSFERENCIA", "PAYPAL"]);
const VALID_SHIP_IDS = new Set(SHIPS.map((ship) => ship.id));

async function ensureMarketSchema(db: D1Database): Promise<void> {
  if (!marketSchemaPromise) {
    marketSchemaPromise = (async () => {
      const schema = [
        `CREATE TABLE IF NOT EXISTS pilots (
          pilot_id TEXT PRIMARY KEY,
          callsign TEXT NOT NULL DEFAULT 'PILOTO',
          obsidian INTEGER NOT NULL DEFAULT 5 CHECK (obsidian >= 0),
          welcome_claimed INTEGER NOT NULL DEFAULT 1,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          selected_ship_id TEXT NOT NULL DEFAULT 'falcon'
        )`,
        `CREATE TABLE IF NOT EXISTS pilot_inventory (
          id TEXT PRIMARY KEY,
          pilot_id TEXT NOT NULL REFERENCES pilots(pilot_id),
          item_id TEXT NOT NULL,
          item_name TEXT NOT NULL,
          item_type TEXT NOT NULL CHECK (item_type IN ('nave', 'objeto')),
          quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity >= 0),
          is_locked INTEGER NOT NULL DEFAULT 0 CHECK (is_locked IN (0, 1)),
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
          price REAL NOT NULL CHECK (price > 0),
          currency TEXT NOT NULL CHECK (currency IN ('COP', 'USD')),
          payment_methods TEXT NOT NULL,
          payment_details TEXT NOT NULL,
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
        `CREATE TABLE IF NOT EXISTS p2p_orders (
          id TEXT PRIMARY KEY,
          ad_id TEXT NOT NULL REFERENCES p2p_ads(id),
          buyer_pilot_id TEXT NOT NULL REFERENCES pilots(pilot_id),
          status TEXT NOT NULL DEFAULT 'ABIERTA',
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
      ];
      for (const statement of schema) await db.prepare(statement).run();
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

function serializeAd(row: MarketAdRow) {
  return {
    id: row.id,
    sellerPilotId: row.seller_pilot_id,
    inventoryId: row.inventory_id,
    itemId: row.item_id,
    itemName: row.item_name,
    itemType: row.item_type,
    price: row.price,
    currency: row.currency,
    paymentMethods: decodeMethods(row.payment_methods),
    paymentDetails: row.payment_details,
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

async function handleMarketRequest(
  request: Request,
  env: WorkerEnv | undefined,
): Promise<Response | null> {
  const url = new URL(request.url);
  const isMarketPath = url.pathname.startsWith("/api/market/");
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
    if (account.email !== ADMIN_EMAIL) {
      return json({ error: "Acción administrativa no autorizada." }, 403);
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
        .prepare("SELECT obsidian FROM pilots WHERE pilot_id = ?")
        .bind(pilotId)
        .first<{ obsidian: number }>();
      return json({ success: true, credited: amount, obsidian: pilot?.obsidian ?? null });
    } catch (error) {
      console.error("No se pudo acreditar obsidiana administrativa:", error);
      return json({ error: "No se pudo acreditar el paquete al piloto." }, 400);
    }
  }
  if (isAdminPath) return json({ error: "Método no permitido." }, 405);

  if (!account) {
    return json({ error: "Inicia sesión con Google para consultar tu piloto y usar el mercado." }, 401);
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
        `SELECT id, item_id, item_name, item_type, quantity, is_locked
      FROM pilot_inventory WHERE pilot_id = ? AND is_locked = 0 AND quantity > 0
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
    const body = await readJson(request);
    const requestedShips = body?.["ships"];
    if (!Array.isArray(requestedShips) || requestedShips.some((id) => typeof id !== "string")) {
      return pilotJson(request, pilotId, { error: "El progreso de naves no es válido." }, 400);
    }
    const ownedShips = Array.from(
      new Set(
        requestedShips.filter(
          (id): id is string =>
            typeof id === "string" && id !== "falcon" && /^[a-z0-9-]+$/.test(id),
        ),
      ),
    );
    const selectedShip = body?.["selectedShip"];
    if (
      ownedShips.some((id) => !VALID_SHIP_IDS.has(id)) ||
      typeof selectedShip !== "string" ||
      !VALID_SHIP_IDS.has(selectedShip) ||
      (selectedShip !== "falcon" && !requestedShips.includes(selectedShip))
    ) {
      return pilotJson(request, pilotId, { error: "El progreso de naves no es válido." }, 400);
    }
    const selection = await db
      .prepare(
        `UPDATE pilots SET selected_ship_id = ?, updated_at = ?
        WHERE pilot_id = ? AND NOT EXISTS (
          SELECT 1 FROM pilot_inventory
          WHERE pilot_id = ? AND item_id = ? AND is_locked = 1
        )`,
      )
      .bind(selectedShip, Date.now(), pilotId, pilotId, selectedShip)
      .run();
    if (selection.meta?.changes !== 1) {
      return pilotJson(
        request,
        pilotId,
        { error: "No puedes seleccionar una nave anunciada." },
        409,
      );
    }
    const now = Date.now();
    const statements = ownedShips.flatMap((id) => {
      const ship = SHIPS.find((item) => item.id === id);
      if (!ship) return [];
      return [
        db
          .prepare(
            `INSERT OR IGNORE INTO pilot_inventory
        (id, pilot_id, item_id, item_name, item_type, quantity, is_locked, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'nave', 1, 0, ?, ?)`,
          )
          .bind(`inv_${randomHex(8)}`, pilotId, ship.id, ship.name, now, now),
      ];
    });
    if (statements.length) await db.batch(statements);
    return pilotJson(request, pilotId, { success: true });
  }

  if (url.pathname === "/api/market/my-ads" && request.method === "GET") {
    const ads = await db
      .prepare(
        `SELECT * FROM p2p_ads
      WHERE seller_pilot_id = ? AND status != 'CANCELADO'
      ORDER BY created_at DESC`,
      )
      .bind(pilotId)
      .all<MarketAdRow>();
    return pilotJson(request, pilotId, { ads: (ads.results ?? []).map(serializeAd) });
  }

  if (url.pathname === "/api/market/publish" && request.method === "POST") {
    const body = await readJson(request);
    const inventoryId = body?.["inventoryId"];
    const price = body?.["price"];
    const currency = body?.["currency"];
    const methods = body?.["methods"];
    const paymentDetails = body?.["paymentDetails"];
    if (
      typeof inventoryId !== "string" ||
      inventoryId.length > 64 ||
      typeof price !== "number" ||
      !Number.isFinite(price) ||
      price <= 0 ||
      (currency !== "COP" && currency !== "USD") ||
      !Array.isArray(methods) ||
      methods.length === 0 ||
      methods.some((method) => typeof method !== "string" || !VALID_PAY_METHODS.has(method)) ||
      typeof paymentDetails !== "string" ||
      paymentDetails.trim().length === 0 ||
      paymentDetails.length > 500
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
          `SELECT id, item_id, item_name, item_type, quantity, is_locked
        FROM pilot_inventory WHERE id = ? AND pilot_id = ?`,
        )
        .bind(inventoryId, pilotId)
        .first<MarketInventoryRow>(),
    ]);
    if (!pilot || pilot.obsidian < 1) {
      return pilotJson(request, pilotId, { error: "Saldo insuficiente: se requiere 1 OBS." }, 400);
    }
    if (!item || item.is_locked !== 0 || item.quantity < 1) {
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
            AND (item_type != 'nave' OR (item_id != 'falcon'
              AND item_id != (SELECT selected_ship_id FROM pilots WHERE pilot_id = ?)))`,
          )
          .bind(now, inventoryId, pilotId, pilotId),
        db
          .prepare(
            `INSERT INTO p2p_ads
          (id, seller_pilot_id, inventory_id, item_id, item_name, item_type, price,
            currency, payment_methods, payment_details, status, fee_paid, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVO', 1, ?, ?)`,
          )
          .bind(
            adId,
            pilotId,
            inventoryId,
            item.item_id,
            item.item_name,
            item.item_type,
            price,
            currency,
            JSON.stringify(Array.from(new Set(methods))),
            paymentDetails.trim(),
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
      const authResponse = await handleAuthRequest(request, workerEnv);
      if (authResponse) return authResponse;
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
        pathname.startsWith("/api/market/") ||
        pathname === "/api/admin/credit-obsidian"
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

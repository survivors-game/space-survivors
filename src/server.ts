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
type WorkerEnv = { DB?: D1Database; ADMIN_SECRET?: string };
type CloudflareRequest = Request & {
  runtime?: { cloudflare?: { env?: WorkerEnv } };
};
type NitroGlobal = typeof globalThis & { __env__?: WorkerEnv };
type ServerEntry = {
  fetch: (request: Request) => Promise<Response> | Response;
};

const SESSION_COOKIE = "__Host-ss_session";
const PILOT_COOKIE = "__Host-ss_pilot";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const CHALLENGE_TTL_MS = 5 * 60 * 1000;
let serverEntryPromise: Promise<ServerEntry> | undefined;
let schemaPromise: Promise<void> | undefined;
let marketSchemaPromise: Promise<void> | undefined;

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
          `CREATE TABLE IF NOT EXISTS auth_challenges (
        challenge_id TEXT PRIMARY KEY,
        wallet_address TEXT NOT NULL,
        message TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        consumed_at INTEGER
      )`,
        )
        .run();
      await db
        .prepare(
          `CREATE INDEX IF NOT EXISTS idx_auth_challenges_expiry
        ON auth_challenges(expires_at)`,
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

  // Prefer the environment that actually contains the D1 binding.
  // Nitro may expose a partial Cloudflare runtime env on the Request;
  // returning it unconditionally can hide the real Worker env argument.
  const candidates = [workerEnv, cloudflareEnv, nitroEnv];
  return (
    candidates.find((candidate) => candidate?.DB && typeof candidate.DB.prepare === "function") ??
    candidates.find((candidate) => candidate !== undefined)
  );
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

function base58Decode(value: string): Uint8Array | null {
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  if (!value || value.length > 64) return null;
  const littleEndian: number[] = [0];
  for (const character of value) {
    const digit = alphabet.indexOf(character);
    if (digit < 0) return null;
    let carry = digit;
    for (let i = 0; i < littleEndian.length; i++) {
      carry += littleEndian[i]! * 58;
      littleEndian[i] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      littleEndian.push(carry & 0xff);
      carry >>= 8;
    }
  }
  let leadingZeroes = 0;
  while (leadingZeroes < value.length && value[leadingZeroes] === "1") leadingZeroes++;
  const significant = value === "1".repeat(value.length) ? [] : littleEndian.reverse();
  const decoded = new Uint8Array(leadingZeroes + significant.length);
  decoded.set(significant, leadingZeroes);
  return decoded;
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

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function isSameOriginPost(request: Request, url: URL): boolean {
  const origin = request.headers.get("origin");
  return origin === url.origin;
}

async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const text = await request.text();
    if (text.length > 8192) return null;
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

  if (url.pathname === "/api/auth/challenge" && request.method === "POST") {
    if (!isSameOriginPost(request, url)) return json({ error: "Solicitud no autorizada." }, 403);
    const body = await readJson(request);
    const address = body?.["address"];
    if (typeof address !== "string" || base58Decode(address)?.length !== 32) {
      return json({ error: "La dirección Solana no es válida." }, 400);
    }

    const now = Date.now();
    const challengeId = randomHex(24);
    const nonce = randomHex(24);
    const expiresAt = now + CHALLENGE_TTL_MS;
    const issuedAt = new Date(now).toISOString();
    const message = [
      "SPACE SURVIVORS — Verificación de wallet",
      `Dominio: ${url.host}`,
      `Cuenta Solana: ${address}`,
      `Nonce: ${nonce}`,
      `Fecha: ${issuedAt}`,
      `Expira: ${new Date(expiresAt).toISOString()}`,
      "Esta firma solo demuestra el control de la cuenta. No autoriza pagos ni transacciones.",
    ].join("\n");

    await db
      .prepare(
        `INSERT INTO auth_challenges
      (challenge_id, wallet_address, message, expires_at, consumed_at)
      VALUES (?, ?, ?, ?, NULL)`,
      )
      .bind(challengeId, address, message, expiresAt)
      .run();

    return json({ challengeId, message, expiresAt });
  }

  if (url.pathname === "/api/auth/verify" && request.method === "POST") {
    if (!isSameOriginPost(request, url)) return json({ error: "Solicitud no autorizada." }, 403);
    const body = await readJson(request);
    const challengeId = body?.["challengeId"];
    const address = body?.["address"];
    const signatureText = body?.["signature"];
    if (
      typeof challengeId !== "string" ||
      typeof address !== "string" ||
      typeof signatureText !== "string" ||
      signatureText.length > 256
    ) {
      return json({ error: "Faltan datos para verificar la firma." }, 400);
    }

    const challenge = await db
      .prepare(
        `SELECT message, expires_at
      FROM auth_challenges
      WHERE challenge_id = ? AND wallet_address = ? AND consumed_at IS NULL`,
      )
      .bind(challengeId, address)
      .first<{ message: string; expires_at: number }>();

    const now = Date.now();
    if (!challenge || challenge.expires_at <= now) {
      return json({ error: "La solicitud de firma venció. Vuelve a conectar la wallet." }, 401);
    }

    const publicKeyBytes = base58Decode(address);
    let signature: Uint8Array;
    try {
      const binary = atob(signatureText);
      signature = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    } catch {
      return json({ error: "La firma recibida no es válida." }, 400);
    }
    if (!publicKeyBytes || publicKeyBytes.length !== 32 || signature.length !== 64) {
      return json({ error: "La clave o firma Solana no es válida." }, 400);
    }

    let valid = false;
    try {
      const publicKey = await crypto.subtle.importKey(
        "raw",
        new Uint8Array(publicKeyBytes).buffer,
        { name: "Ed25519" },
        false,
        ["verify"],
      );
      valid = await crypto.subtle.verify(
        { name: "Ed25519" },
        publicKey,
        new Uint8Array(signature).buffer,
        new TextEncoder().encode(challenge.message),
      );
    } catch {
      valid = false;
    }
    if (!valid)
      return json({ error: "MetaMask no pudo demostrar el control de esta cuenta." }, 401);

    const consumed = await db
      .prepare(
        `UPDATE auth_challenges SET consumed_at = ?
      WHERE challenge_id = ? AND wallet_address = ? AND consumed_at IS NULL AND expires_at > ?`,
      )
      .bind(now, challengeId, address, now)
      .run();
    if ((consumed.meta?.changes ?? 0) !== 1) {
      return json({ error: "La solicitud ya fue utilizada o venció. Vuelve a conectar." }, 401);
    }

    const token = randomHex(32);
    const tokenHash = await sha256Hex(token);
    const expiresAt = now + SESSION_TTL_MS;
    await db
      .prepare(
        `INSERT INTO auth_sessions
      (token_hash, wallet_address, created_at, expires_at) VALUES (?, ?, ?, ?)`,
      )
      .bind(tokenHash, address, now, expiresAt)
      .run();

    return json({ authenticated: true, address, expiresAt }, 200, {
      "set-cookie": sessionCookie(token, Math.floor(SESSION_TTL_MS / 1000)),
    });
  }

  if (url.pathname === "/api/auth/session" && request.method === "GET") {
    const token = readCookie(request, SESSION_COOKIE);
    if (!token) return json({ authenticated: false }, 200);
    const tokenHash = await sha256Hex(token);
    const session = await db
      .prepare(
        `SELECT wallet_address, expires_at FROM auth_sessions
      WHERE token_hash = ? AND expires_at > ?`,
      )
      .bind(tokenHash, Date.now())
      .first<{ wallet_address: string; expires_at: number }>();
    if (!session) {
      return json({ authenticated: false }, 200, {
        "set-cookie": sessionCookie("", 0),
      });
    }
    return json({
      authenticated: true,
      address: session.wallet_address,
      expiresAt: session.expires_at,
    });
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
    return json({ authenticated: false }, 200, { "set-cookie": sessionCookie("", 0) });
  }

  return json({ error: "Ruta de autenticación no encontrada." }, 404);
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

function validPilotId(value: string | null): value is string {
  return value !== null && VALID_PILOT_ID.test(value);
}

function resolvePilotId(request: Request): string {
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
  } catch (error) {
    console.error("No se pudo preparar el esquema del mercado:", error);
    return json({ error: "No se pudo preparar el mercado. Inténtalo de nuevo." }, 503);
  }

  if (isAdminPath && request.method === "POST") {
    if (!isSameOriginPost(request, url)) return json({ error: "Solicitud no autorizada." }, 403);
    if (!env.ADMIN_SECRET) {
      return json({ error: "El endpoint administrativo no está habilitado." }, 503);
    }
    const body = await readJson(request);
    if (
      typeof body?.["adminSecret"] !== "string" ||
      body["adminSecret"] !== env.ADMIN_SECRET ||
      typeof body["pilotId"] !== "string" ||
      !validPilotId(body["pilotId"]) ||
      typeof body["packagesCount"] !== "number" ||
      !Number.isInteger(body["packagesCount"]) ||
      body["packagesCount"] < 1 ||
      body["packagesCount"] > 1000
    ) {
      return json({ error: "Solicitud administrativa no válida." }, 403);
    }
    const amount = body["packagesCount"] * 10;
    const now = Date.now();
    try {
      const results = await db.batch([
        db
          .prepare(
            `UPDATE pilots SET obsidian = obsidian + ?, updated_at = ?
          WHERE pilot_id = ?`,
          )
          .bind(amount, now, body["pilotId"]),
        db
          .prepare(
            `INSERT INTO admin_obsidian_logs
          (id, pilot_id, amount, reason, created_at) VALUES (?, ?, ?, ?, ?)`,
          )
          .bind(`obs_${randomHex(8)}`, body["pilotId"], amount, "PAQUETE_ADMINISTRATIVO", now),
      ]);
      if (results[0]?.meta?.changes !== 1 || results[1]?.meta?.changes !== 1) {
        return json({ error: "No se pudo acreditar el paquete al piloto." }, 400);
      }
      const pilot = await db
        .prepare("SELECT obsidian FROM pilots WHERE pilot_id = ?")
        .bind(body["pilotId"])
        .first<{ obsidian: number }>();
      return json({ success: true, credited: amount, obsidian: pilot?.obsidian ?? null });
    } catch (error) {
      console.error("No se pudo acreditar obsidiana administrativa:", error);
      return json({ error: "No se pudo acreditar el paquete al piloto." }, 400);
    }
  }
  if (isAdminPath) return json({ error: "Método no permitido." }, 405);

  if (!isSameOriginPost(request, url) && request.method !== "GET") {
    return json({ error: "Solicitud no autorizada." }, 403);
  }

  const pilotId = resolvePilotId(request);
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

import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type D1Result = { meta?: { changes?: number } };
type D1Statement = {
  bind(...values: unknown[]): D1Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<D1Result>;
};
type D1Database = { prepare(query: string): D1Statement };
type WorkerEnv = { DB?: D1Database };
type CloudflareRequest = Request & {
  runtime?: { cloudflare?: { env?: WorkerEnv } };
};
type ServerEntry = {
  fetch: (request: Request) => Promise<Response> | Response;
};

const SESSION_COOKIE = "__Host-ss_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const CHALLENGE_TTL_MS = 5 * 60 * 1000;
let serverEntryPromise: Promise<ServerEntry> | undefined;
let schemaPromise: Promise<void> | undefined;

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
      await db.prepare(`CREATE TABLE IF NOT EXISTS auth_challenges (
        challenge_id TEXT PRIMARY KEY,
        wallet_address TEXT NOT NULL,
        message TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        consumed_at INTEGER
      )`).run();
      await db.prepare(`CREATE INDEX IF NOT EXISTS idx_auth_challenges_expiry
        ON auth_challenges(expires_at)`).run();
      await db.prepare(`CREATE TABLE IF NOT EXISTS auth_sessions (
        token_hash TEXT PRIMARY KEY,
        wallet_address TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
      )`).run();
      await db.prepare(`CREATE INDEX IF NOT EXISTS idx_auth_sessions_expiry
        ON auth_sessions(expires_at)`).run();
    })().catch((error) => {
      schemaPromise = undefined;
      throw error;
    });
  }
  return schemaPromise;
}

function getWorkerEnv(request: Request, env: unknown): WorkerEnv | undefined {
  const cloudflareEnv = (request as CloudflareRequest).runtime?.cloudflare?.env;
  if (cloudflareEnv) return cloudflareEnv;
  return env && typeof env === "object" ? (env as WorkerEnv) : undefined;
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

    await db.prepare(`INSERT INTO auth_challenges
      (challenge_id, wallet_address, message, expires_at, consumed_at)
      VALUES (?, ?, ?, ?, NULL)`)
      .bind(challengeId, address, message, expiresAt).run();

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

    const challenge = await db.prepare(`SELECT message, expires_at
      FROM auth_challenges
      WHERE challenge_id = ? AND wallet_address = ? AND consumed_at IS NULL`)
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
        "raw", new Uint8Array(publicKeyBytes).buffer, { name: "Ed25519" }, false, ["verify"],
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
    if (!valid) return json({ error: "MetaMask no pudo demostrar el control de esta cuenta." }, 401);

    const consumed = await db.prepare(`UPDATE auth_challenges SET consumed_at = ?
      WHERE challenge_id = ? AND wallet_address = ? AND consumed_at IS NULL AND expires_at > ?`)
      .bind(now, challengeId, address, now).run();
    if ((consumed.meta?.changes ?? 0) !== 1) {
      return json({ error: "La solicitud ya fue utilizada o venció. Vuelve a conectar." }, 401);
    }

    const token = randomHex(32);
    const tokenHash = await sha256Hex(token);
    const expiresAt = now + SESSION_TTL_MS;
    await db.prepare(`INSERT INTO auth_sessions
      (token_hash, wallet_address, created_at, expires_at) VALUES (?, ?, ?, ?)`)
      .bind(tokenHash, address, now, expiresAt).run();

    return json(
      { authenticated: true, address, expiresAt },
      200,
      { "set-cookie": sessionCookie(token, Math.floor(SESSION_TTL_MS / 1000)) },
    );
  }

  if (url.pathname === "/api/auth/session" && request.method === "GET") {
    const token = readCookie(request, SESSION_COOKIE);
    if (!token) return json({ authenticated: false }, 200);
    const tokenHash = await sha256Hex(token);
    const session = await db.prepare(`SELECT wallet_address, expires_at FROM auth_sessions
      WHERE token_hash = ? AND expires_at > ?`)
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
      await db.prepare("DELETE FROM auth_sessions WHERE token_hash = ?")
        .bind(await sha256Hex(token)).run();
    }
    return json({ authenticated: false }, 200, { "set-cookie": sessionCookie("", 0) });
  }

  return json({ error: "Ruta de autenticación no encontrada." }, 404);
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
      const authResponse = await handleAuthRequest(request, getWorkerEnv(request, env));
      if (authResponse) return authResponse;
      const handler = await getServerEntry();
      const response = await handler.fetch(request);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      if (new URL(request.url).pathname.startsWith("/api/auth/")) {
        const detail = error instanceof Error ? error.message : String(error);
        console.error("Fallo en endpoint de autenticación:", detail);
        return json(
          { error: `Falló una operación del servidor de autenticación: ${detail || "error desconocido"}` },
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

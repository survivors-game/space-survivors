import { afterEach, describe, expect, it, vi } from "vitest";
import server from "@/server";

type BoundStatement = {
  query: string;
  values: unknown[];
  bind(...boundValues: unknown[]): BoundStatement;
  run(): Promise<{ meta: { changes: number } }>;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{ results: T[] }>;
};

class AuthDatabase {
  readonly states = new Map<
    string,
    { nonce: string; code_verifier: string; expires_at: number; consumed_at: number | null }
  >();
  readonly accounts = new Map<string, { google_sub: string; email: string; pilot_id: string }>();
  readonly sessions = new Map<string, { wallet_address: string; expires_at: number }>();
  readonly progress = new Map<string, string>();
  readonly inventory = new Map<string, { pilot_id: string; item_id: string }>();

  prepare(query: string) {
    const { states, accounts, sessions, progress, inventory } = this;
    let values: unknown[] = [];
    const statement: BoundStatement = {
      query,
      values,
      bind(...boundValues: unknown[]) {
        values = boundValues;
        statement.values = values;
        return statement;
      },
      async run() {
        const [first, second, third, fourth] = values;
        if (query.includes("INSERT INTO google_oauth_states")) {
          states.set(first as string, {
            nonce: second as string,
            code_verifier: third as string,
            expires_at: fourth as number,
            consumed_at: null,
          });
          return { meta: { changes: 1 } };
        }
        if (query.includes("UPDATE google_oauth_states")) {
          const stored = states.get(second as string);
          if (!stored || stored.consumed_at !== null || stored.expires_at <= (third as number)) {
            return { meta: { changes: 0 } };
          }
          stored.consumed_at = first as number;
          return { meta: { changes: 1 } };
        }
        if (query.includes("INSERT INTO player_accounts")) {
          const record = {
            google_sub: first as string,
            email: second as string,
            pilot_id: third as string,
          };
          if (
            accounts.has(record.google_sub) ||
            [...accounts.values()].some((account) => account.email === record.email)
          ) {
            throw new Error("unique account constraint");
          }
          accounts.set(record.google_sub, record);
          return { meta: { changes: 1 } };
        }
        if (query.includes("INSERT INTO auth_sessions")) {
          sessions.set(first as string, {
            wallet_address: second as string,
            expires_at: fourth as number,
          });
          return { meta: { changes: 1 } };
        }
        if (query.includes("INSERT INTO player_progress")) {
          progress.set(first as string, second as string);
          return { meta: { changes: 1 } };
        }
        if (query.includes("INSERT OR IGNORE INTO pilot_inventory")) {
          inventory.set(`${values[1]}:falcon`, {
            pilot_id: values[1] as string,
            item_id: "falcon",
          });
          return { meta: { changes: 1 } };
        }
        if (query.includes("UPDATE pilots SET selected_ship_id")) {
          const exists = inventory.has(`${values[2]}:${values[4]}`);
          return { meta: { changes: exists ? 1 : 0 } };
        }
        if (query.includes("UPDATE player_accounts SET email")) {
          const account = accounts.get(third as string);
          if (account) account.email = first as string;
          return { meta: { changes: account ? 1 : 0 } };
        }
        return { meta: { changes: 0 } };
      },
      async first<T>() {
        if (query.includes("FROM google_oauth_states")) {
          const state = states.get(values[0] as string);
          return (state && state.consumed_at === null ? state : null) as T | null;
        }
        if (query.includes("FROM auth_sessions")) {
          const session = sessions.get(values[0] as string);
          return (
            session && session.expires_at > (values[1] as number) ? session : null
          ) as T | null;
        }
        if (query.includes("FROM player_accounts")) {
          const [value] = values;
          const account = query.includes("WHERE google_sub = ?")
            ? accounts.get(value as string)
            : query.includes("WHERE email = ?")
              ? [...accounts.values()].find((item) => item.email === value)
              : [...accounts.values()].find((item) => item.pilot_id === value);
          return (account ?? null) as T | null;
        }
        if (query.includes("FROM pilots")) {
          return {
            obsidian: 15,
            boss_obsidian: 0,
            callsign: "PILOTO",
            referral_code: "SG-ABC123",
            referred_by: null,
          } as T;
        }
        if (query.includes("FROM player_profiles")) {
          return { display_name: "TEST PILOT" } as T;
        }
        if (query.includes("FROM player_progress")) {
          const saved = progress.get(values[0] as string);
          return (saved ? { progress_json: saved } : null) as T | null;
        }
        return null;
      },
      async all<T>() {
        if (query.includes("SELECT item_id FROM pilot_inventory")) {
          return {
            results: [...inventory.values()]
              .filter((item) => item.pilot_id === values[0])
              .map((item) => ({ item_id: item.item_id })) as T[],
          };
        }
        return { results: [] as T[] };
      },
    };
    return statement;
  }

  async batch(statements: BoundStatement[]) {
    return Promise.all(statements.map((statement) => statement.run()));
  }
}

function base64Url(value: Uint8Array): string {
  return btoa(Array.from(value, (byte) => String.fromCharCode(byte)).join(""))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

async function signedGoogleIdToken(
  privateKey: CryptoKey,
  nonce: string,
  subject: string,
  email: string,
): Promise<string> {
  const header = base64Url(
    new TextEncoder().encode(JSON.stringify({ alg: "RS256", kid: "test-key" })),
  );
  const claims = base64Url(
    new TextEncoder().encode(
      JSON.stringify({
        iss: "https://accounts.google.com",
        aud: "test-client",
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000),
        nonce,
        sub: subject,
        email,
        email_verified: true,
      }),
    ),
  );
  const signedContent = `${header}.${claims}`;
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    privateKey,
    new TextEncoder().encode(signedContent),
  );
  return `${signedContent}.${base64Url(new Uint8Array(signature))}`;
}

describe("Google sign-in", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("reuses one player, progress and pilot ID for the same verified Google account", async () => {
    const database = new AuthDatabase();
    const { publicKey, privateKey } = (await crypto.subtle.generateKey(
      {
        name: "RSASSA-PKCS1-v1_5",
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: "SHA-256",
      },
      true,
      ["sign", "verify"],
    )) as CryptoKeyPair;
    const publicJwk = (await crypto.subtle.exportKey("jwk", publicKey)) as JsonWebKey & {
      kid: string;
    };
    publicJwk.kid = "test-key";
    let idToken = "";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const target = String(input);
        if (target === "https://oauth2.googleapis.com/token") {
          return new Response(JSON.stringify({ id_token: idToken }), { status: 200 });
        }
        if (target === "https://www.googleapis.com/oauth2/v3/certs") {
          return new Response(JSON.stringify({ keys: [publicJwk] }), { status: 200 });
        }
        if (target === "https://challenges.cloudflare.com/turnstile/v0/siteverify") {
          const form = new URLSearchParams(String(init?.body ?? ""));
          return new Response(
            JSON.stringify({
              success: form.get("response") !== "invalid-token",
              hostname: "game.example",
              action: "login",
            }),
            { status: 200 },
          );
        }
        throw new Error(`Unexpected fetch: ${target}`);
      }),
    );
    const env = {
      DB: database,
      LEADERBOARD: {
        values: new Map<string, string>(),
        async get(key: string) {
          return this.values.get(key) ?? null;
        },
        async put(key: string, value: string) {
          this.values.set(key, value);
        },
      },
      GOOGLE_CLIENT_ID: "test-client",
      GOOGLE_CLIENT_SECRET: "server-only-secret",
      GOOGLE_REDIRECT_URI: "https://game.example/api/auth/google/callback",
      TURNSTILE_SECRET_KEY: "server-only-turnstile-secret",
    };
    const guestPilotId = "plt_0123456789abcdef01234567";

    const missingTurnstile = await server.fetch(
      new Request("https://game.example/api/auth/verify-turnstile", {
        method: "POST",
        headers: { origin: "https://game.example", "content-type": "application/json" },
        body: "{}",
      }),
      env,
    );
    expect(missingTurnstile.status).toBe(400);

    const rejectedTurnstile = await server.fetch(
      new Request("https://game.example/api/auth/verify-turnstile", {
        method: "POST",
        headers: { origin: "https://game.example", "content-type": "application/json" },
        body: JSON.stringify({ token: "invalid-token" }),
      }),
      env,
    );
    expect(rejectedTurnstile.status).toBe(403);

    const signIn = async (subject = "google-sub-1", email = "pilot@example.com") => {
      const startResponse = await server.fetch(
        new Request("https://game.example/api/auth/verify-turnstile", {
          method: "POST",
          headers: { origin: "https://game.example", "content-type": "application/json" },
          body: JSON.stringify({ token: "verified-turnstile-token" }),
        }),
        env,
      );
      expect(startResponse.status).toBe(200);
      const startPayload = (await startResponse.json()) as { authorizationUrl: string };
      const authorizationUrl = new URL(startPayload.authorizationUrl);
      const state = authorizationUrl.searchParams.get("state")!;
      const nonce = authorizationUrl.searchParams.get("nonce")!;
      const stateCookie = startResponse.headers.get("set-cookie")!.split(";")[0]!;
      expect(startPayload.authorizationUrl).not.toContain("server-only-secret");
      const stateWithoutCookie = await server.fetch(
        new Request(`https://game.example/api/auth/google/callback?code=auth-code&state=${state}`),
        env,
      );
      expect(stateWithoutCookie.headers.get("location")).toContain("google_error=invalid_response");
      idToken = await signedGoogleIdToken(privateKey, nonce, subject, email);
      const callback = await server.fetch(
        new Request(`https://game.example/api/auth/google/callback?code=auth-code&state=${state}`, {
          headers: { cookie: `${stateCookie}; __Host-ss_pilot=${guestPilotId}` },
        }),
        env,
      );
      expect(callback.status).toBe(302);
      const sessionCookie = (callback.headers.get("set-cookie") ?? "")
        .split(",")
        .map((cookie) => cookie.trim())
        .find((cookie) => cookie.startsWith("__Host-ss_session="))
        ?.split(";")[0];
      return { callback, sessionCookie };
    };

    const firstSignIn = await signIn();
    const firstCookie = firstSignIn.sessionCookie!;
    const initialAccount = database.accounts.get("google-sub-1")!;
    expect(initialAccount.pilot_id).toBe(guestPilotId);

    const savedProgress = {
      credits: 840,
      ships: ["falcon", "comet"],
      stats: { kills: 23 },
    };
    const saveResponse = await server.fetch(
      new Request("https://game.example/api/auth/progress", {
        method: "POST",
        headers: {
          origin: "https://game.example",
          "content-type": "application/json",
          cookie: firstCookie,
        },
        body: JSON.stringify({ progress: savedProgress }),
      }),
      env,
    );
    expect(saveResponse.status).toBe(200);

    const leaderboardUpdate = await server.fetch(
      new Request("https://game.example/api/leaderboard/update", {
        method: "POST",
        headers: {
          origin: "https://game.example",
          "content-type": "application/json",
          cookie: firstCookie,
        },
        body: JSON.stringify({
          pilot_id: guestPilotId,
          callsign: "UNTRUSTED NAME",
          obsidian: 9999,
          score: 23,
        }),
      }),
      env,
    );
    expect(leaderboardUpdate.status).toBe(200);

    const leaderboardResponse = await server.fetch(
      new Request("https://game.example/api/leaderboard"),
      env,
    );
    expect(await leaderboardResponse.json()).toEqual({ entries: [] });

    const secondSignIn = await signIn();
    const sessionResponse = await server.fetch(
      new Request("https://game.example/api/auth/session", {
        headers: { cookie: secondSignIn.sessionCookie! },
      }),
      env,
    );
    const session = (await sessionResponse.json()) as {
      authenticated: boolean;
      playerId: string;
      progress: typeof savedProgress;
    };
    expect(session.authenticated).toBe(true);
    expect(session.playerId).toBe(guestPilotId);
    expect(session.progress).toEqual({
      ...savedProgress,
      ships: ["falcon"],
      selectedShip: "falcon",
    });
    expect(database.accounts.size).toBe(1);

    const duplicateEmailSignIn = await signIn("google-sub-2", "PILOT@example.com");
    expect(duplicateEmailSignIn.callback.headers.get("location")).toContain(
      "google_error=account_conflict",
    );
    expect(database.accounts.size).toBe(1);
  });
});

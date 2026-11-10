import { describe, expect, it } from "vitest";
import server from "@/server";

const PILOT_ID = "plt_0123456789abcdef01234567";
const ADMIN_EMAIL = "emprendedora.onlinevee@gmail.com";

function createDatabase(options?: { email?: string; obsidian?: number; credits?: number }) {
  let batchCalls = 0;
  const email = options?.email ?? ADMIN_EMAIL;
  const obsidian = options?.obsidian ?? 15;
  const credits = options?.credits ?? 40;
  const db = {
    prepare(query: string) {
      let values: unknown[] = [];
      return {
        bind(...args: unknown[]) {
          values = args;
          return this;
        },
        async run() {
          return { meta: { changes: 1 } };
        },
        async first() {
          if (query.includes("FROM auth_sessions")) {
            return { wallet_address: "google:admin-sub", expires_at: Date.now() + 60_000 };
          }
          if (query.includes("FROM player_accounts") && query.includes("google_sub")) {
            return { google_sub: "admin-sub", email, pilot_id: "plt_aaaaaaaaaaaaaaaaaaaaaaaa" };
          }
          if (query.includes("FROM admin_sessions")) {
            return { token_hash: "valid-admin-session", google_sub: "admin-sub" };
          }
          if (query.includes("SELECT pilot_id, obsidian FROM pilots")) {
            return { pilot_id: PILOT_ID, obsidian };
          }
          if (query.includes("SELECT progress_json FROM player_progress")) {
            return { progress_json: JSON.stringify({ v: 1, credits }) };
          }
          return null;
        },
        async all() {
          if (query.includes("SELECT p.pilot_id, p.obsidian")) {
            return { results: [{ pilot_id: PILOT_ID, obsidian }] };
          }
          return { results: [] };
        },
      };
    },
    async batch(statements: unknown[]) {
      batchCalls += 1;
      return statements.map(() => ({ meta: { changes: 1 } }));
    },
  };
  return { db, getBatchCalls: () => batchCalls };
}

function makeRequest(body: Record<string, unknown>, authenticated = true) {
  return new Request("https://game.example/api/admin/economy", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://game.example",
      ...(authenticated
        ? { cookie: "__Host-ss_session=admin; __Host-ss_admin=admin-panel" }
        : {}),
    },
    body: JSON.stringify(body),
  });
}

describe("administrative CR and OBS economy", () => {
  it("rejects requests without an authenticated account", async () => {
    const mock = createDatabase();
    const response = await server.fetch(
      makeRequest({ player: PILOT_ID, currency: "OBS", operation: "credit", amount: 10, reason: "Ajuste de prueba" }, false),
      { DB: mock.db },
    );
    expect(response.status).toBe(401);
    expect(mock.getBatchCalls()).toBe(0);
  });

  it("rejects a non-administrator account", async () => {
    const mock = createDatabase({ email: "player@example.com" });
    const response = await server.fetch(
      makeRequest({ player: PILOT_ID, currency: "CR", operation: "credit", amount: 10, reason: "Ajuste de prueba" }),
      { DB: mock.db },
    );
    expect(response.status).toBe(403);
    expect(mock.getBatchCalls()).toBe(0);
  });

  it("credits CR through the protected admin endpoint", async () => {
    const mock = createDatabase({ credits: 40 });
    const response = await server.fetch(
      makeRequest({ player: PILOT_ID, currency: "CR", operation: "credit", amount: 25, reason: "Corrección solicitada" }),
      { DB: mock.db },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      success: true,
      currency: "CR",
      balanceBefore: 40,
      balanceAfter: 65,
      delta: 25,
    });
    expect(mock.getBatchCalls()).toBe(1);
  });

  it("credits OBS through the protected admin endpoint", async () => {
    const mock = createDatabase({ obsidian: 15 });
    const response = await server.fetch(
      makeRequest({ player: PILOT_ID, currency: "OBS", operation: "credit", amount: 10, reason: "Recompensa autorizada" }),
      { DB: mock.db },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      success: true,
      currency: "OBS",
      balanceBefore: 15,
      balanceAfter: 25,
      delta: 10,
    });
    expect(mock.getBatchCalls()).toBe(1);
  });

  it("prevents an OBS debit from making the balance negative", async () => {
    const mock = createDatabase({ obsidian: 2 });
    const response = await server.fetch(
      makeRequest({ player: PILOT_ID, currency: "OBS", operation: "debit", amount: 3, reason: "Corrección solicitada" }),
      { DB: mock.db },
    );
    expect(response.status).toBe(409);
    expect(mock.getBatchCalls()).toBe(0);
  });
});

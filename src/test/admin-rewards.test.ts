import { beforeEach, describe, expect, it } from "vitest";
import server from "@/server";

const PILOT_ID = "plt_0123456789abcdef01234567";
const ADMIN_EMAIL = "emprendedora.onlinevee@gmail.com";
let statements: string[] = [];
let batchCount = 0;
let duplicateOperation = false;

function createDatabase() {
  return {
    prepare(query: string) {
      let values: unknown[] = [];
      return {
        query,
        bind(...args: unknown[]) {
          values = args;
          return this;
        },
        async run() {
          return { meta: { changes: 1 } };
        },
        async first() {
          if (query.includes("FROM auth_sessions"))
            return { wallet_address: "google:admin-sub", expires_at: Date.now() + 60_000 };
          if (query.includes("FROM player_accounts") && query.includes("google_sub"))
            return {
              google_sub: "admin-sub",
              email: ADMIN_EMAIL,
              pilot_id: "plt_aaaaaaaaaaaaaaaaaaaaaaaa",
            };
          if (query.includes("FROM admin_sessions"))
            return { token_hash: "valid-admin-session", google_sub: "admin-sub" };
          if (query.includes("FROM admin_reward_logs WHERE operation_id"))
            return duplicateOperation ? { id: "already-delivered" } : null;
          return null;
        },
        async all() {
          if (query.includes("FROM pilots p LEFT JOIN player_accounts pa"))
            return {
              results: [{ pilot_id: PILOT_ID, callsign: "TEST-PILOT", email: "pilot@example.com" }],
            };
          return { results: [] };
        },
      };
    },
    async batch(batchStatements: Array<{ query?: string }>) {
      batchCount += 1;
      statements = batchStatements.map((statement) => statement.query ?? "");
      return batchStatements.map(() => ({ meta: { changes: 1 } }));
    },
  };
}

function makeRequest(body?: Record<string, unknown>, authenticated = true, adminSession = true) {
  return new Request("https://game.example/api/admin/rewards", {
    method: body ? "POST" : "GET",
    headers: {
      origin: "https://game.example",
      ...(body ? { "content-type": "application/json" } : {}),
      ...(authenticated
        ? {
            cookie:
              "__Host-ss_session=admin" + (adminSession ? "; __Host-ss_admin=admin-panel" : ""),
          }
        : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

describe("administrative reward delivery", () => {
  beforeEach(() => {
    statements = [];
    batchCount = 0;
    duplicateOperation = false;
  });

  it("rejects anonymous requests", async () => {
    const response = await server.fetch(makeRequest(undefined, false), {
      DB: createDatabase(),
    } as never);
    expect(response.status).toBe(401);
  });

  it("rejects the admin account without the second admin session", async () => {
    const response = await server.fetch(makeRequest(undefined, true, false), {
      DB: createDatabase(),
    } as never);
    expect(response.status).toBe(403);
  });

  it("credits OBS and records the reward in one database batch", async () => {
    const db = createDatabase();
    const response = await server.fetch(
      makeRequest({
        operationId: "11111111-1111-4111-8111-111111111111",
        recipient: PILOT_ID,
        rewardType: "OBS",
        rewardId: "obs",
        quantity: 25,
        eventName: "Evento de prueba",
        reason: "Premio por participación",
      }),
      { DB: db } as never,
    );
    expect(response.status).toBe(200);
    expect(batchCount).toBe(1);
    expect(statements.some((statement) => statement.includes("UPDATE pilots SET obsidian"))).toBe(
      true,
    );
    expect(
      statements.some((statement) => statement.includes("INSERT INTO admin_reward_logs")),
    ).toBe(true);
  });

  it("delivers an item to the player's inventory", async () => {
    const db = createDatabase();
    const response = await server.fetch(
      makeRequest({
        operationId: "22222222-2222-4222-8222-222222222222",
        recipient: PILOT_ID,
        rewardType: "item",
        rewardId: "repair",
        quantity: 3,
        eventName: "",
        reason: "Reposición de objeto no recibido",
      }),
      { DB: db } as never,
    );
    expect(response.status).toBe(200);
    expect(statements.some((statement) => statement.includes("INSERT INTO pilot_inventory"))).toBe(
      true,
    );
  });

  it("extends VIP from the later of now or the current expiry", async () => {
    const db = createDatabase();
    const response = await server.fetch(
      makeRequest({
        operationId: "33333333-3333-4333-8333-333333333333",
        recipient: PILOT_ID,
        rewardType: "VIP",
        rewardId: "vip",
        quantity: 30,
        eventName: "",
        reason: "Premio de temporada",
      }),
      { DB: db } as never,
    );
    expect(response.status).toBe(200);
    expect(
      statements.some((statement) => statement.includes("MAX(COALESCE(vip_until, 0), ?) + ?")),
    ).toBe(true);
  });

  it("prevents replaying a reward operation", async () => {
    duplicateOperation = true;
    const response = await server.fetch(
      makeRequest({
        operationId: "44444444-4444-4444-8444-444444444444",
        recipient: PILOT_ID,
        rewardType: "CR",
        rewardId: "cr",
        quantity: 100,
        eventName: "",
        reason: "Corrección de recompensa pendiente",
      }),
      { DB: createDatabase() } as never,
    );
    expect(response.status).toBe(409);
    expect(batchCount).toBe(0);
  });
});

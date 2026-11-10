import { beforeEach, describe, expect, it } from "vitest";
import server from "@/server";

const ADMIN_EMAIL = "emprendedora.onlinevee@gmail.com";
const PILOT_ID = "plt_1234567890abcdef12345678";
let vipUntil: number | null = null;
let batches: string[][] = [];
function createDatabase() {
  return {
    prepare(query: string) {
      return {
        query,
        bind(..._values: unknown[]) {
          return this;
        },
        async run() {
          return { meta: { changes: 1 } };
        },
        async first() {
          if (query.includes("FROM auth_sessions"))
            return { wallet_address: "google:admin-sub", expires_at: Date.now() + 60_000 };
          if (query.includes("FROM player_accounts") && query.includes("google_sub"))
            return { google_sub: "admin-sub", email: ADMIN_EMAIL, pilot_id: "plt_admin" };
          if (query.includes("FROM admin_sessions"))
            return { token_hash: "valid-admin-session", google_sub: "admin-sub" };
          if (query.includes("SUM(CASE WHEN vip_until"))
            return { active: vipUntil && vipUntil > Date.now() ? 1 : 0, expiring_soon: 0 };
          return null;
        },
        async all() {
          if (query.includes("SELECT p.pilot_id,p.vip_until"))
            return { results: [{ pilot_id: PILOT_ID, vip_until: vipUntil }] };
          if (query.includes("SELECT p.pilot_id,COALESCE"))
            return {
              results: [
                {
                  pilot_id: PILOT_ID,
                  callsign: "Piloto",
                  email: "player@example.com",
                  vip_until: vipUntil,
                },
              ],
            };
          if (query.includes("FROM admin_vip_logs")) return { results: [] };
          return { results: [] };
        },
      };
    },
    async batch(statements: Array<{ query?: string }>) {
      batches.push(statements.map((s) => s.query ?? ""));
      return statements.map(() => ({ meta: { changes: 1 } }));
    },
  };
}
function request(body?: Record<string, unknown>, authenticated = true, adminSession = true) {
  return new Request("https://game.example/api/admin/vip" + (body ? "" : "?search="), {
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
describe("administrative VIP management", () => {
  beforeEach(() => {
    vipUntil = null;
    batches = [];
  });
  it("rejects anonymous access", async () => {
    const response = await server.fetch(request(undefined, false), {
      DB: createDatabase(),
    } as never);
    expect(response.status).toBe(401);
  });
  it("requires the second admin session", async () => {
    const response = await server.fetch(request(undefined, true, false), {
      DB: createDatabase(),
    } as never);
    expect(response.status).toBe(403);
  });
  it("lists VIP players and audit history", async () => {
    const response = await server.fetch(request(), { DB: createDatabase() } as never);
    const data = (await response.json()) as {
      players: unknown[];
      logs: unknown[];
      stats: { active: number };
    };
    expect(response.status).toBe(200);
    expect(data.players).toHaveLength(1);
    expect(data.logs).toEqual([]);
    expect(data.stats.active).toBe(0);
  });
  it("grants VIP and records the operation atomically", async () => {
    const response = await server.fetch(
      request({
        operationId: "operation-vip-0001",
        action: "grant",
        recipient: PILOT_ID,
        days: 30,
        reason: "Premio de temporada",
      }),
      { DB: createDatabase() } as never,
    );
    expect(response.status).toBe(200);
    expect(batches).toHaveLength(1);
    expect(batches[0]?.some((sql) => sql.includes("UPDATE pilots SET vip_until"))).toBe(true);
    expect(batches[0]?.some((sql) => sql.includes("INSERT INTO admin_vip_logs"))).toBe(true);
  });
  it("renews VIP and records the operation", async () => {
    vipUntil = Date.now() + 10 * 86400000;
    const response = await server.fetch(
      request({
        operationId: "operation-vip-0002",
        action: "renew",
        recipient: PILOT_ID,
        days: 30,
        reason: "Renovación solicitada",
      }),
      { DB: createDatabase() } as never,
    );
    expect(response.status).toBe(200);
    expect(batches[0]?.some((sql) => sql.includes("INSERT INTO admin_vip_logs"))).toBe(true);
  });
  it("revokes VIP and records the reason", async () => {
    vipUntil = Date.now() + 10 * 86400000;
    const response = await server.fetch(
      request({
        operationId: "operation-vip-0003",
        action: "revoke",
        recipient: PILOT_ID,
        reason: "Retiro solicitado",
      }),
      { DB: createDatabase() } as never,
    );
    expect(response.status).toBe(200);
    expect(batches[0]?.some((sql) => sql.includes("UPDATE pilots SET vip_until"))).toBe(true);
  });
  it("rejects an invalid duration", async () => {
    const response = await server.fetch(
      request({
        operationId: "operation-vip-0004",
        action: "grant",
        recipient: PILOT_ID,
        days: 0,
        reason: "Premio de temporada",
      }),
      { DB: createDatabase() } as never,
    );
    expect(response.status).toBe(400);
    expect(batches).toHaveLength(0);
  });
});

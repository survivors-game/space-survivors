import { beforeEach, describe, expect, it } from "vitest";
import server from "@/server";

const ADMIN_EMAIL = "emprendedora.onlinevee@gmail.com";
let batches: string[][] = [];
let memberRole = "miembro";
let allianceLocked = false;
let hasWarHistory = false;

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
          if (query.includes("FROM alliance_members WHERE alliance_id=? AND pilot_id=?"))
            return { role: memberRole };
          if (query.includes("FROM alliances WHERE alliance_id=?")) return { name: "Alianza" };
          if (query.includes("FROM alliance_wars WHERE war_id=?"))
            return {
              attacker_alliance_id: "alliance-1",
              defender_alliance_id: "alliance-2",
              status: "ACTIVE",
            };
          if (query.includes("FROM alliance_war_locks WHERE alliance_id=?"))
            return allianceLocked ? { war_id: "war-1" } : null;
          if (query.includes("FROM alliance_wars WHERE attacker_alliance_id=?"))
            return hasWarHistory ? { war_id: "war-old" } : null;
          return null;
        },
        async all() {
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
  return new Request("https://game.example/api/admin/alliances", {
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
describe("administrative alliance and war management", () => {
  beforeEach(() => {
    batches = [];
    memberRole = "miembro";
    allianceLocked = false;
    hasWarHistory = false;
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
  it("returns alliance, war, member and audit collections", async () => {
    const response = await server.fetch(request(), { DB: createDatabase() } as never);
    const payload = (await response.json()) as {
      alliances: unknown[];
      wars: unknown[];
      members: unknown[];
      logs: unknown[];
    };
    expect(response.status).toBe(200);
    expect(payload.alliances).toEqual([]);
    expect(payload.wars).toEqual([]);
    expect(payload.members).toEqual([]);
    expect(payload.logs).toEqual([]);
  });
  it("changes a member role and writes an audit record", async () => {
    const response = await server.fetch(
      request({
        action: "set-role",
        allianceId: "alliance-1",
        pilotId: "pilot-2",
        role: "teniente",
        reason: "Ascenso aprobado",
      }),
      { DB: createDatabase() } as never,
    );
    expect(response.status).toBe(200);
    expect(batches).toHaveLength(1);
    expect(batches[0].some((sql) => sql.includes("UPDATE alliance_members SET role=?"))).toBe(true);
    expect(batches[0].some((sql) => sql.includes("INSERT INTO admin_alliance_logs"))).toBe(true);
  });
  it("does not allow removing a member while the alliance is at war", async () => {
    allianceLocked = true;
    const response = await server.fetch(
      request({
        action: "remove-member",
        allianceId: "alliance-1",
        pilotId: "pilot-2",
        reason: "Retiro solicitado",
      }),
      { DB: createDatabase() } as never,
    );
    expect(response.status).toBe(409);
    expect(batches).toHaveLength(0);
  });
  it("preserves war history when disbanding an alliance", async () => {
    hasWarHistory = true;
    const response = await server.fetch(
      request({ action: "dissolve", allianceId: "alliance-1", reason: "Cierre administrativo" }),
      { DB: createDatabase() } as never,
    );
    expect(response.status).toBe(409);
    expect(batches).toHaveLength(0);
  });
  it("does not allow admins to cancel a battle already in progress", async () => {
    const response = await server.fetch(
      request({ action: "cancel-war", warId: "war-1", reason: "Solicitud administrativa" }),
      { DB: createDatabase() } as never,
    );
    expect(response.status).toBe(409);
    expect(batches).toHaveLength(0);
  });
});

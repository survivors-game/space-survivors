import { describe, expect, it } from "vitest";
import server from "@/server";

const ADMIN_EMAIL = "emprendedora.onlinevee@gmail.com";

function database() {
  const writes: string[] = [];
  const db = {
    prepare(query: string) {
      let values: unknown[] = [];
      return {
        bind(...args: unknown[]) { values = args; return this; },
        async run() { writes.push(query); return { meta: { changes: 1 } }; },
        async first() {
          if (query.includes("FROM auth_sessions")) return { wallet_address: "google:admin-sub", expires_at: Date.now() + 60_000 };
          if (query.includes("FROM player_accounts") && query.includes("google_sub")) return { google_sub: "admin-sub", email: ADMIN_EMAIL, pilot_id: "plt_admin" };
          if (query.includes("FROM admin_sessions")) return { token_hash: "valid-admin-session", google_sub: "admin-sub" };
          if (query.includes("SELECT setting_value FROM admin_game_settings")) return { setting_value: values[0] === "maintenance_mode" ? "false" : "true" };
          return null;
        },
        async all() {
          if (query.includes("FROM admin_game_settings_logs")) return { results: [{ setting_key: "maintenance_mode", old_value: "false", new_value: "true", reason: "Mantenimiento programado", admin_email: ADMIN_EMAIL, created_at: Date.now() }] };
          if (query.includes("FROM admin_game_settings")) return { results: [
            { setting_key: "maintenance_mode", setting_value: "false" },
            { setting_key: "registration_enabled", setting_value: "true" },
            { setting_key: "maintenance_message", setting_value: "Volvemos pronto." },
            { setting_key: "events_enabled", setting_value: "true" },
            { setting_key: "rewards_enabled", setting_value: "true" },
          ] };
          return { results: [] };
        },
      };
    },
    async batch(statements: unknown[]) {
      writes.push("BATCH:" + statements.length);
      return statements.map(() => ({ meta: { changes: 1 } }));
    },
  };
  return { db, writes };
}

function request(method: "GET" | "POST" = "GET", body?: unknown, secondFactor = true) {
  return new Request("https://game.example/api/admin/config", {
    method,
    headers: {
      cookie: "__Host-ss_session=admin" + (secondFactor ? "; __Host-ss_admin=admin-panel" : ""),
      ...(method === "POST" ? { origin: "https://game.example", "content-type": "application/json" } : {}),
    },
    ...(method === "POST" ? { body: JSON.stringify(body ?? {}) } : {}),
  });
}

describe("administrative game configuration", () => {
  it("rejects anonymous access", async () => {
    const mock = database();
    const response = await server.fetch(new Request("https://game.example/api/admin/config"), { DB: mock.db } as never);
    expect(response.status).toBe(401);
  });

  it("requires the second administrative session", async () => {
    const mock = database();
    const response = await server.fetch(request("GET", undefined, false), { DB: mock.db } as never);
    expect(response.status).toBe(403);
  });

  it("returns persisted game settings and audit history", async () => {
    const mock = database();
    const response = await server.fetch(request(), { DB: mock.db } as never);
    const payload = await response.json() as { settings: { maintenanceMode: boolean; registrationEnabled: boolean; eventsEnabled: boolean; rewardsEnabled: boolean }; logs: unknown[] };
    expect(response.status).toBe(200);
    expect(payload.settings.maintenanceMode).toBe(false);
    expect(payload.settings.registrationEnabled).toBe(true);
    expect(payload.settings.eventsEnabled).toBe(true);
    expect(payload.settings.rewardsEnabled).toBe(true);
    expect(payload.logs).toHaveLength(1);
  });

  it("saves allowed settings and writes audit entries in a batch", async () => {
    const mock = database();
    const response = await server.fetch(request("POST", {
      settings: { maintenanceMode: true, registrationEnabled: false, maintenanceMessage: "Actualización programada." },
      reason: "Mantenimiento programado",
    }), { DB: mock.db } as never);
    const payload = await response.json() as { success: boolean; changed: number };
    expect(response.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(payload.changed).toBe(3);
    expect(mock.writes).toContain("BATCH:6");
  });

  it("rejects configuration changes without an audit reason", async () => {
    const mock = database();
    const response = await server.fetch(request("POST", {
      settings: { eventsEnabled: false }, reason: "no",
    }), { DB: mock.db } as never);
    expect(response.status).toBe(400);
  });
});

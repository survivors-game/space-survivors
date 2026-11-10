import { describe, expect, it } from "vitest";
import server from "@/server";

const ADMIN_EMAIL = "emprendedora.onlinevee@gmail.com";

function createDatabase(email: string, suspended = false) {
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
          if (query.includes("FROM player_accounts")) {
            return { google_sub: "admin-sub", email, pilot_id: "plt_aaaaaaaaaaaaaaaaaaaaaaaa" };
          }
          if (query.includes("FROM admin_sessions")) {
            return { token_hash: "valid-admin-session", google_sub: "admin-sub" };
          }
          if (query.includes("FROM admin_player_status")) {
            return suspended ? { suspended_at: Date.now() } : null;
          }
          return null;
        },
        async all() {
          if (query.includes("FROM pilots p") && query.includes("JOIN player_accounts")) {
            return {
              results: [{
                pilot_id: "plt_aaaaaaaaaaaaaaaaaaaaaaaa",
                callsign: "PILOTO",
                obsidian: 15,
                boss_obsidian: 2,
                vip_until: null,
                created_at: 1000,
                email: "player@example.com",
                display_name: "PLAYER",
                suspended_at: null,
                progress_json: JSON.stringify({ credits: 450 }),
              }],
            };
          }
          return { results: [] };
        },
      };
    },
    async batch(statements: unknown[]) {
      return statements.map(() => ({ meta: { changes: 1 } }));
    },
  };
  return db;
}

function request(path: string, admin = false) {
  return new Request("https://game.example" + path, {
    headers: admin
      ? { cookie: "__Host-ss_session=player-session; __Host-ss_admin=admin-session" }
      : {},
  });
}

describe("administrative player management", () => {
  it("rejects player searches without an authenticated admin session", async () => {
    const response = await server.fetch(
      request("/api/admin/players"),
      { DB: createDatabase(ADMIN_EMAIL) },
    );
    expect(response.status).toBe(401);
  });

  it("rejects an ordinary Google account even with a panel cookie", async () => {
    const response = await server.fetch(
      request("/api/admin/players", true),
      { DB: createDatabase("player@example.com") },
    );
    expect(response.status).toBe(403);
  });

  it("returns real player profile data to the authenticated administrator", async () => {
    const response = await server.fetch(
      request("/api/admin/players?search=player", true),
      { DB: createDatabase(ADMIN_EMAIL) },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      players: [{
        pilotId: "plt_aaaaaaaaaaaaaaaaaaaaaaaa",
        name: "PLAYER",
        email: "player@example.com",
        credits: 450,
        obsidian: 15,
        bossObsidian: 2,
        suspended: false,
      }],
    });
  });
});

import { describe, expect, it } from "vitest";
import server from "@/server";

const ADMIN_EMAIL = "emprendedora.onlinevee@gmail.com";

function database() {
  const db = {
    prepare(query: string) {
      return {
        bind(..._values: unknown[]) {
          return this;
        },
        async run() {
          return { meta: { changes: 1 } };
        },
        async first() {
          if (query.includes("COUNT(*) AS count FROM pilots p JOIN player_accounts"))
            return { count: 12 };
          if (query.includes("COUNT(*) AS count FROM auth_sessions")) return { count: 3 };
          if (query.includes("COUNT(*) AS count FROM obsidian_payment_requests"))
            return { count: 2 };
          if (query.includes("COUNT(*) AS count FROM p2p_disputes")) return { count: 1 };
          if (query.includes("COUNT(*) AS count FROM support_tickets")) return { count: 4 };
          if (query.includes("COUNT(*) AS count FROM chat_reports")) return { count: 5 };
          if (query.includes("COUNT(*) AS count FROM admin_server_errors")) return { count: 1 };
          if (query.includes("FROM auth_sessions"))
            return { wallet_address: "google:admin-sub", expires_at: Date.now() + 60_000 };
          if (query.includes("FROM player_accounts") && query.includes("google_sub"))
            return { google_sub: "admin-sub", email: ADMIN_EMAIL, pilot_id: "plt_admin" };
          if (query.includes("FROM admin_sessions"))
            return { token_hash: "valid-admin-session", google_sub: "admin-sub" };
          return null;
        },
        async all() {
          if (query.includes("FROM admin_server_errors")) {
            return {
              results: [
                {
                  id: "error-1",
                  created_at: Date.now(),
                  type: "Error del servidor",
                  detail: "/api/test: Error de prueba",
                  status: "INCIDENCIA",
                },
              ],
            };
          }
          return { results: [] };
        },
      };
    },
  };
  return db;
}

function request(authenticated = true, secondFactor = true) {
  return new Request("https://game.example/api/admin/summary", {
    headers: authenticated
      ? {
          cookie: "__Host-ss_session=admin" + (secondFactor ? "; __Host-ss_admin=admin-panel" : ""),
        }
      : {},
  });
}

describe("administrative summary", () => {
  it("rejects anonymous access", async () => {
    const response = await server.fetch(request(false), { DB: database() } as never);
    expect(response.status).toBe(401);
  });

  it("requires the second administrative session", async () => {
    const response = await server.fetch(request(true, false), { DB: database() } as never);
    expect(response.status).toBe(403);
  });

  it("returns live counts and recent server alerts", async () => {
    const response = await server.fetch(request(), { DB: database() } as never);
    const payload = (await response.json()) as {
      stats: {
        players: number;
        activeSessions: number;
        pendingPayments: number;
        openDisputes: number;
        alerts: number;
      };
      alerts: Array<{ id: string; type: string; detail: string }>;
    };

    expect(response.status).toBe(200);
    expect(payload.stats).toEqual({
      players: 12,
      activeSessions: 3,
      pendingPayments: 2,
      openDisputes: 1,
      alerts: 13,
    });
    expect(payload.alerts).toHaveLength(1);
    expect(payload.alerts[0]?.type).toBe("Error del servidor");
  });
});

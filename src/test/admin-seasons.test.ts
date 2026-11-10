import { beforeEach, describe, expect, it } from "vitest";
import server from "@/server";

const ADMIN_EMAIL = "emprendedora.onlinevee@gmail.com";
let batchStatements: string[][] = [];
let activeConflict = false;

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
            return { google_sub: "admin-sub", email: ADMIN_EMAIL, pilot_id: "plt_admin" };
          if (query.includes("FROM admin_sessions"))
            return { token_hash: "valid-admin-session", google_sub: "admin-sub" };
          if (query.includes("FROM admin_season_events WHERE status = 'ACTIVE'"))
            return activeConflict ? { id: "existing-event" } : null;
          if (query.includes("SELECT name FROM admin_season_events"))
            return { name: "Evento existente" };
          if (query.includes("COUNT(*) AS participants")) return { participants: 4 };
          return null;
        },
        async all() {
          if (query.includes("FROM admin_season_events"))
            return { results: [{ id: "event-1", name: "Temporada de prueba", status: "ACTIVE" }] };
          if (query.includes("FROM player_progress progress"))
            return { results: [{ pilot_id: "plt_player", callsign: "PILOTO", pt: 120 }] };
          if (query.includes("FROM admin_season_event_logs"))
            return { results: [] };
          return { results: [] };
        },
      };
    },
    async batch(statements: Array<{ query?: string }>) {
      batchStatements.push(statements.map((statement) => statement.query ?? ""));
      return statements.map(() => ({ meta: { changes: 1 } }));
    },
  };
}

function request(body?: Record<string, unknown>, authenticated = true, adminSession = true) {
  return new Request("https://game.example/api/admin/seasons", {
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

describe("administrative seasons and missions dashboard", () => {
  beforeEach(() => {
    batchStatements = [];
    activeConflict = false;
  });

  it("rejects anonymous requests", async () => {
    const response = await server.fetch(request(undefined, false), { DB: createDatabase() } as never);
    expect(response.status).toBe(401);
  });

  it("requires the second administrative session", async () => {
    const response = await server.fetch(request(undefined, true, false), { DB: createDatabase() } as never);
    expect(response.status).toBe(403);
  });

  it("returns season events and player progress", async () => {
    const response = await server.fetch(request(), { DB: createDatabase() } as never);
    const payload = (await response.json()) as { events: unknown[]; ranking: unknown[]; participants: number };
    expect(response.status).toBe(200);
    expect(payload.events).toHaveLength(1);
    expect(payload.ranking).toHaveLength(1);
    expect(payload.participants).toBe(4);
  });

  it("creates an event and records the administrative operation", async () => {
    const now = Date.now();
    const response = await server.fetch(
      request({
        action: "create",
        name: "Evento especial",
        description: "Desafío para todos los pilotos.",
        startsAt: now + 60_000,
        endsAt: now + 86_400_000,
        rewardDescription: "Premios desde el panel de recompensas",
        status: "DRAFT",
      }),
      { DB: createDatabase() } as never,
    );
    expect(response.status).toBe(200);
    expect(batchStatements[0]).toHaveLength(2);
    expect(batchStatements[0].some((sql) => sql.includes("INSERT INTO admin_season_events"))).toBe(true);
    expect(batchStatements[0].some((sql) => sql.includes("INSERT INTO admin_season_event_logs"))).toBe(true);
  });

  it("prevents two overlapping active events", async () => {
    activeConflict = true;
    const now = Date.now();
    const response = await server.fetch(
      request({
        action: "create",
        name: "Evento duplicado",
        description: "Otro evento activo.",
        startsAt: now,
        endsAt: now + 86_400_000,
        rewardDescription: "",
        status: "ACTIVE",
      }),
      { DB: createDatabase() } as never,
    );
    expect(response.status).toBe(409);
    expect(batchStatements).toHaveLength(0);
  });
});

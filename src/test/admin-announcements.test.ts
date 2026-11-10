import { describe, expect, it } from "vitest";
import server from "@/server";

const ADMIN_EMAIL = "emprendedora.onlinevee@gmail.com";

function createDatabase() {
  const announcements = [
    {
      id: "11111111-1111-4111-8111-111111111111",
      title: "Mantenimiento programado",
      type: "MANTENIMIENTO",
      message: "El servidor tendrá mantenimiento.",
      status: "PUBLISHED",
      created_at: 1000,
      updated_at: 1000,
    },
  ];
  const logs: Array<Record<string, unknown>> = [];
  const db = {
    prepare(query: string) {
      let values: unknown[] = [];
      return {
        bind(...args: unknown[]) {
          values = args;
          return this;
        },
        async run() {
          if (query.includes("INSERT INTO admin_announcements")) {
            announcements.push({
              id: String(values[0]),
              title: String(values[1]),
              type: String(values[2]),
              message: String(values[3]),
              status: String(values[4]),
              created_at: Number(values[5]),
              updated_at: Number(values[6]),
            });
          }
          if (query.includes("INSERT INTO admin_announcement_logs")) {
            logs.push({
              announcement_id: values[1],
              action: values[2],
              title: values[3],
              admin_email: values[4],
              created_at: values[5],
            });
          }
          if (query.startsWith("DELETE FROM admin_announcements")) {
            const index = announcements.findIndex((item) => item.id === values[0]);
            if (index >= 0) announcements.splice(index, 1);
          }
          return { meta: { changes: 1 } };
        },
        async first() {
          if (query.includes("FROM auth_sessions"))
            return { wallet_address: "google:admin-sub", expires_at: Date.now() + 60_000 };
          if (query.includes("FROM player_accounts"))
            return { google_sub: "admin-sub", email: ADMIN_EMAIL, pilot_id: "plt_aaaaaaaaaaaaaaaaaaaaaaaa" };
          if (query.includes("FROM admin_sessions"))
            return { token_hash: "valid-admin-session", google_sub: "admin-sub" };
          if (query.includes("SELECT title FROM admin_announcements"))
            return announcements.find((item) => item.id === values[0]) ?? null;
          return null;
        },
        async all() {
          if (query.includes("FROM admin_announcements")) return { results: [...announcements] };
          if (query.includes("FROM admin_announcement_logs")) return { results: [...logs] };
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

function adminRequest(path: string, method = "GET", body?: unknown) {
  return new Request("https://game.example" + path, {
    method,
    headers: {
      cookie: "__Host-ss_session=player-session; __Host-ss_admin=admin-session",
      ...(method === "POST"
        ? { origin: "https://game.example", "content-type": "application/json" }
        : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

describe("administrative announcements", () => {
  it("serves only published announcements to game visitors", async () => {
    const response = await server.fetch(new Request("https://game.example/api/announcements"), {
      DB: createDatabase(),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      announcements: [{ title: "Mantenimiento programado", status: "PUBLISHED" }],
    });
  });

  it("requires the administrator's second session to manage announcements", async () => {
    const response = await server.fetch(
      new Request("https://game.example/api/admin/announcements"),
      { DB: createDatabase() },
    );
    expect(response.status).toBe(401);
  });

  it("creates and audits an announcement for the authenticated administrator", async () => {
    const response = await server.fetch(
      adminRequest("/api/admin/announcements", "POST", {
        action: "create",
        title: "Nuevo evento",
        type: "EVENTO",
        message: "Comienza un nuevo evento.",
        status: "PUBLISHED",
      }),
      { DB: createDatabase() },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true });
  });

  it("rejects invalid announcement content", async () => {
    const response = await server.fetch(
      adminRequest("/api/admin/announcements", "POST", {
        action: "create",
        title: "x",
        type: "EVENTO",
        message: "ok",
        status: "PUBLISHED",
      }),
      { DB: createDatabase() },
    );
    expect(response.status).toBe(400);
  });
});

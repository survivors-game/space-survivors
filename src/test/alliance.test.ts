// @vitest-environment node
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import server from "@/server";

const db = new DatabaseSync(":memory:");
const PILOT_IDS = Array.from(
  { length: 12 },
  (_, index) => `plt_${String(index + 1).padStart(24, "0")}`,
);

function pilotId(index: number): string {
  const id = PILOT_IDS[index];
  if (!id) throw new Error(`Missing test pilot ${index}.`);
  return id;
}

function createD1Adapter() {
  return {
    prepare(query: string) {
      let values: unknown[] = [];
      const statement = {
        bind(...boundValues: unknown[]) {
          values = boundValues;
          return statement;
        },
        async run() {
          const result = db.prepare(query).run(...(values as never[]));
          return { meta: { changes: Number(result.changes) } };
        },
        async first<T>() {
          return (db.prepare(query).get(...(values as never[])) as T | undefined) ?? null;
        },
        async all<T>() {
          return { results: db.prepare(query).all(...(values as never[])) as T[] };
        },
      };
      return statement;
    },
    async batch(statements: Array<{ run(): Promise<{ meta: { changes: number } }> }>) {
      db.exec("BEGIN");
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        db.exec("COMMIT");
        return results;
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
  };
}

const database = createD1Adapter();

function tokenFor(index: number) {
  return `alliance-session-${index}`;
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function makeRequest(
  path: string,
  index: number,
  method: "GET" | "POST" = "GET",
  body?: Record<string, unknown>,
) {
  return new Request(`https://game.example${path}`, {
    method,
    headers: {
      ...(method === "POST"
        ? { "content-type": "application/json", origin: "https://game.example" }
        : {}),
      cookie: `__Host-ss_session=${tokenFor(index)}`,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

async function requestJson<T = { error?: string; success?: boolean }>(
  path: string,
  index: number,
  method: "GET" | "POST" = "GET",
  body?: Record<string, unknown>,
) {
  const response = await server.fetch(makeRequest(path, index, method, body), { DB: database });
  return { response, payload: (await response.json()) as T };
}

function addAlliance(name: string, leaderIndex = 0) {
  const allianceId = `all_${name.toLowerCase()}`;
  const now = Date.now();
  db.prepare(
    `INSERT INTO alliances (alliance_id, name, tag, leader_pilot_id, created_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(allianceId, name, name.slice(0, 3).toUpperCase(), pilotId(leaderIndex), now);
  db.prepare(
    `INSERT INTO alliance_members (alliance_id, pilot_id, role, joined_at)
     VALUES (?, ?, 'lider', ?)`,
  ).run(allianceId, pilotId(leaderIndex), now);
  return allianceId;
}

beforeEach(() => {
  if (!db.prepare("SELECT name FROM sqlite_master WHERE name = 'pilots'").get()) {
    db.exec(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE pilots (
        pilot_id TEXT PRIMARY KEY,
        callsign TEXT NOT NULL DEFAULT 'PILOTO',
        obsidian INTEGER NOT NULL DEFAULT 5,
        boss_obsidian INTEGER NOT NULL DEFAULT 0,
        welcome_claimed INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE player_accounts (
        google_sub TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        pilot_id TEXT NOT NULL UNIQUE,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE player_profiles (
        pilot_id TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE auth_sessions (
        token_hash TEXT PRIMARY KEY,
        wallet_address TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
      );
    `);
    db.exec(readFileSync("migrations/0008_alliance_system.sql", "utf8"));
  }
  db.exec(`
    DELETE FROM alliance_invites;
    DELETE FROM alliance_members;
    DELETE FROM alliances;
    DELETE FROM player_profiles;
    DELETE FROM auth_sessions;
    DELETE FROM player_accounts;
    DELETE FROM pilots;
  `);
  const now = Date.now();
  PILOT_IDS.forEach((pilotId, index) => {
    const sub = `alliance-sub-${index}`;
    db.prepare(
      `INSERT INTO pilots (pilot_id, callsign, obsidian, created_at, updated_at)
       VALUES (?, ?, 50, ?, ?)`,
    ).run(pilotId, `PILOT${index}`, now, now);
    db.prepare(
      `INSERT INTO player_accounts (google_sub, email, pilot_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(sub, `${index}@example.com`, pilotId, now, now);
    db.prepare(
      `INSERT INTO auth_sessions (token_hash, wallet_address, created_at, expires_at)
       VALUES (?, ?, ?, ?)`,
    ).run(hashToken(tokenFor(index)), `google:${sub}`, now, now + 60_000);
    db.prepare(
      `INSERT INTO player_profiles (pilot_id, display_name, updated_at) VALUES (?, ?, ?)`,
    ).run(pilotId, `PILOT${index}`, now);
  });
});

describe("alliance system", () => {
  it("requires active VIP to create an alliance and charges 20 OBS when eligible", async () => {
    const denied = await requestJson("/api/alliance/create", 0, "POST", {
      name: "Star Guild",
      tag: "SGX",
    });
    expect(denied.response.status).toBe(403);
    expect(db.prepare("SELECT COUNT(*) AS count FROM alliances").get()).toEqual({ count: 0 });

    db.prepare("UPDATE pilots SET vip_until = ? WHERE pilot_id = ?").run(
      Date.now() + 60_000,
      pilotId(0),
    );
    const created = await requestJson<{ alliance_id: string }>("/api/alliance/create", 0, "POST", {
      name: "Star Guild",
      tag: "SGX",
    });
    expect(created.response.status).toBe(200);
    expect(db.prepare("SELECT obsidian FROM pilots WHERE pilot_id = ?").get(pilotId(0))).toEqual({
      obsidian: 30,
    });
    expect(
      db.prepare("SELECT role FROM alliance_members WHERE pilot_id = ?").get(pilotId(0)),
    ).toEqual({ role: "lider" });
  });

  it("rejects creating a second alliance membership", async () => {
    addAlliance("Existing");
    db.prepare("UPDATE pilots SET vip_until = ? WHERE pilot_id = ?").run(
      Date.now() + 60_000,
      pilotId(0),
    );
    const result = await requestJson("/api/alliance/create", 0, "POST", {
      name: "Second",
      tag: "SEC",
    });
    expect(result.response.status).toBe(409);
    expect(result.payload.error).toContain("perteneces");
  });

  it("allows leaders to invite eligible pilots and rejects pilots already in an alliance", async () => {
    const allianceId = addAlliance("Inviters");
    const invited = await requestJson<{ invite_id: string }>("/api/alliance/invite", 0, "POST", {
      pilot_id: pilotId(1),
    });
    expect(invited.response.status).toBe(200);
    expect(
      db
        .prepare("SELECT status FROM alliance_invites WHERE invite_id = ?")
        .get(invited.payload.invite_id),
    ).toEqual({ status: "PENDIENTE" });

    addAlliance("Other", 2);
    const alreadyMember = await requestJson("/api/alliance/invite", 0, "POST", {
      pilot_id: pilotId(2),
    });
    expect(alreadyMember.response.status).toBe(409);
    expect(
      db.prepare("SELECT alliance_id FROM alliance_members WHERE pilot_id = ?").get(pilotId(0)),
    ).toEqual({
      alliance_id: allianceId,
    });
  });

  it("does not invite a member into an alliance with ten members", async () => {
    const allianceId = addAlliance("Full");
    const now = Date.now();
    for (const pilotId of PILOT_IDS.slice(1, 10)) {
      db.prepare(
        `INSERT INTO alliance_members (alliance_id, pilot_id, role, joined_at)
         VALUES (?, ?, 'miembro', ?)`,
      ).run(allianceId, pilotId, now);
    }
    const result = await requestJson("/api/alliance/invite", 0, "POST", {
      pilot_id: pilotId(10),
    });
    expect(result.response.status).toBe(409);
    expect(result.payload.error).toContain("10 miembros");
  });

  it("accepts and rejects pending invitations", async () => {
    const allianceId = addAlliance("Responses");
    const now = Date.now();
    db.prepare(
      `INSERT INTO alliance_invites (invite_id, alliance_id, invited_pilot_id, invited_by, created_at)
       VALUES ('invite-accept', ?, ?, ?, ?)`,
    ).run(allianceId, pilotId(1), pilotId(0), now);
    db.prepare(
      `INSERT INTO alliance_invites (invite_id, alliance_id, invited_pilot_id, invited_by, created_at)
       VALUES ('invite-reject', ?, ?, ?, ?)`,
    ).run(allianceId, pilotId(2), pilotId(0), now);

    const accepted = await requestJson("/api/alliance/accept", 1, "POST", {
      invite_id: "invite-accept",
    });
    const rejected = await requestJson("/api/alliance/reject", 2, "POST", {
      invite_id: "invite-reject",
    });
    expect(accepted.response.status).toBe(200);
    expect(rejected.response.status).toBe(200);
    expect(
      db.prepare("SELECT role FROM alliance_members WHERE pilot_id = ?").get(pilotId(1)),
    ).toEqual({ role: "miembro" });
    expect(
      db.prepare("SELECT status FROM alliance_invites WHERE invite_id = 'invite-reject'").get(),
    ).toEqual({ status: "RECHAZADA" });
  });

  it("lets a lieutenant kick members, and only the leader change roles", async () => {
    const allianceId = addAlliance("Roles");
    const now = Date.now();
    db.prepare(
      `INSERT INTO alliance_members (alliance_id, pilot_id, role, joined_at)
       VALUES (?, ?, 'teniente', ?), (?, ?, 'miembro', ?), (?, ?, 'miembro', ?)`,
    ).run(allianceId, pilotId(1), now, allianceId, pilotId(2), now, allianceId, pilotId(3), now);
    const lieutenantPromotion = await requestJson("/api/alliance/promote", 0, "POST", {
      pilot_id: pilotId(2),
      role: "teniente",
    });
    const lieutenantKick = await requestJson("/api/alliance/kick", 1, "POST", {
      pilot_id: pilotId(3),
    });
    expect(lieutenantPromotion.response.status).toBe(200);
    expect(lieutenantKick.response.status).toBe(200);
    expect(
      db.prepare("SELECT pilot_id FROM alliance_members WHERE alliance_id = ?").all(allianceId),
    ).toHaveLength(3);
  });

  it("does not allow a leader to leave and dissolves all alliance data", async () => {
    const allianceId = addAlliance("Dissolve");
    db.prepare(
      `INSERT INTO alliance_invites (invite_id, alliance_id, invited_pilot_id, invited_by, created_at)
       VALUES ('pending-dissolve', ?, ?, ?, ?)`,
    ).run(allianceId, pilotId(1), pilotId(0), Date.now());
    const leave = await requestJson("/api/alliance/leave", 0, "POST", {});
    expect(leave.response.status).toBe(409);
    const dissolved = await requestJson("/api/alliance/dissolve", 0, "POST", {});
    expect(dissolved.response.status).toBe(200);
    expect(db.prepare("SELECT COUNT(*) AS count FROM alliance_members").get()).toEqual({
      count: 0,
    });
    expect(db.prepare("SELECT COUNT(*) AS count FROM alliance_invites").get()).toEqual({
      count: 0,
    });
  });

  it("passes the alliance tag to the authenticated chat connection", async () => {
    addAlliance("Chat", 0);
    const captured: { url?: URL } = {};
    const response = await server.fetch(
      new Request("https://game.example/api/chat/ws?language=es", {
        headers: {
          Upgrade: "websocket",
          origin: "https://game.example",
          cookie: `__Host-ss_session=${tokenFor(0)}; __Host-ss_admin=alliance-admin-session`,
        },
      }),
      {
        DB: database,
        CHAT_ROOM: {
          idFromName: () => "global",
          get: () => ({
            fetch: async (request: Request) => {
              captured.url = new URL(request.url);
              return new Response(null, { status: 200 });
            },
          }),
        },
      },
    );
    expect(response.status).toBe(200);
    expect(captured.url?.searchParams.get("allianceTag")).toBe("CHA");
  });

  it("allows only the admin to grant VIP for valid day counts", async () => {
    const request = new Request("https://game.example/api/admin/set-vip", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://game.example",
        cookie: `__Host-ss_session=${tokenFor(0)}`,
      },
      body: JSON.stringify({ pilot_id: pilotId(1), days: 30 }),
    });
    const response = await server.fetch(request, { DB: database });
    expect(response.status).toBe(403);
    expect(db.prepare("SELECT vip_until FROM pilots WHERE pilot_id = ?").get(pilotId(1))).toEqual({
      vip_until: null,
    });
    db.prepare("UPDATE player_accounts SET email = ? WHERE pilot_id = ?").run(
      "emprendedora.onlinevee@gmail.com",
      pilotId(0),
    );
    const now = Date.now();
    db.prepare(
      "INSERT INTO admin_sessions (token_hash, google_sub, created_at, expires_at) VALUES (?, ?, ?, ?)",
    ).run(hashToken("alliance-admin-session"), "alliance-sub-0", now, now + 60_000);
    const adminResponse = await server.fetch(request, { DB: database });
    expect(adminResponse.status).toBe(200);
    const vip = db.prepare("SELECT vip_until FROM pilots WHERE pilot_id = ?").get(pilotId(1)) as {
      vip_until: number | null;
    };
    expect(vip.vip_until).toBeGreaterThan(Date.now());
  });
});

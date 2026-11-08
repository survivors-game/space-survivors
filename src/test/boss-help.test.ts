import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import server from "@/server";

type HelpSession = {
  session_id: string;
  host_pilot_id: string;
  helper_pilot_id: string | null;
  boss_id: string;
  status: "WAITING" | "ACTIVE" | "COMPLETED" | "EXPIRED" | "LEFT";
  created_at: number;
};

function createDb() {
  const pilots = new Map([
    ["host", { google_sub: "host", email: "host@test.invalid", pilot_id: "plt_host" }],
    ["helper", { google_sub: "helper", email: "helper@test.invalid", pilot_id: "plt_helper" }],
    ["helper2", { google_sub: "helper2", email: "helper2@test.invalid", pilot_id: "plt_helper2" }],
    [
      "outsider",
      { google_sub: "outsider", email: "outsider@test.invalid", pilot_id: "plt_outsider" },
    ],
  ]);
  const alliances = new Map<string, string>([
    ["plt_host", "alliance_a"],
    ["plt_helper", "alliance_a"],
    ["plt_helper2", "alliance_a"],
    ["plt_outsider", "alliance_b"],
  ]);
  const attempts = new Map<
    string,
    { pilot_id: string; boss_id: string; token_hash: string; claimed_at: number | null }
  >();
  const sessions = new Map<string, HelpSession>();
  const notifications: string[] = [];
  let activeSub = "host";

  const db = {
    prepare(query: string) {
      let values: unknown[] = [];
      return {
        bind(...bound: unknown[]) {
          values = bound;
          return this;
        },
        async run() {
          if (query.includes("INSERT INTO boss_attempts")) {
            attempts.set(String(values[0]), {
              token_hash: String(values[0]),
              pilot_id: String(values[1]),
              boss_id: String(values[2]),
              claimed_at: null,
            });
          }
          if (query.includes("UPDATE boss_help_sessions")) {
            const expired = query.includes("SET status = 'EXPIRED'");
            const sessionId = String(expired ? values[1] : values[2]);
            const session = sessions.get(sessionId);
            if (session && session.status === "WAITING") {
              session.status = expired ? "EXPIRED" : (String(values[0]) as HelpSession["status"]);
            }
          }
          return { meta: { changes: 1 } };
        },
        async first<T>() {
          if (query.includes("FROM auth_sessions")) {
            return { wallet_address: `google:${activeSub}`, expires_at: Date.now() + 60_000 } as T;
          }
          if (query.includes("FROM player_accounts")) {
            const account = pilots.get(String(values[0]));
            return account ? (account as T) : null;
          }
          if (
            query.includes("FROM alliance_members member") &&
            query.includes("JOIN alliances alliance")
          ) {
            const pilotId = String(values[0]);
            const allianceId = alliances.get(pilotId);
            return allianceId ? ({ alliance_id: allianceId, name: allianceId } as T) : null;
          }
          if (query.includes("SELECT token_hash FROM boss_attempts")) {
            return (
              (Array.from(attempts.values()).find(
                (attempt) =>
                  attempt.pilot_id === values[0] &&
                  attempt.boss_id === values[1] &&
                  attempt.claimed_at === null,
              ) as T | undefined) ?? null
            );
          }
          if (query.includes("INSERT INTO boss_help_sessions")) {
            const [sessionId, hostId, bossId, createdAt, , allianceId] = values;
            if (alliances.get(String(hostId)) !== allianceId) return null;
            if (
              Array.from(sessions.values()).some(
                (session) =>
                  session.host_pilot_id === hostId &&
                  ["WAITING", "ACTIVE"].includes(session.status),
              )
            ) {
              return null;
            }
            const session: HelpSession = {
              session_id: String(sessionId),
              host_pilot_id: String(hostId),
              helper_pilot_id: null,
              boss_id: String(bossId),
              status: "WAITING",
              created_at: Number(createdAt),
            };
            sessions.set(session.session_id, session);
            return { session_id: session.session_id } as T;
          }
          if (query.includes("FROM boss_help_sessions")) {
            const session = sessions.get(String(values[0]));
            return session ? ({ ...session } as T) : null;
          }
          if (query.includes("UPDATE boss_help_sessions SET helper_pilot_id")) {
            const [helperId, , sessionId, now, hostAlliance, helperPilotId, helperAlliance] =
              values;
            const session = sessions.get(String(sessionId));
            const hostAllianceId = session && alliances.get(session.host_pilot_id);
            if (
              !session ||
              session.status !== "WAITING" ||
              session.created_at + 60_000 <= Number(now) ||
              hostAllianceId !== hostAlliance ||
              helperId !== helperPilotId ||
              alliances.get(String(helperId)) !== helperAlliance
            ) {
              return null;
            }
            session.helper_pilot_id = String(helperId);
            session.status = "ACTIVE";
            return { session_id: session.session_id } as T;
          }
          if (query.includes("FROM player_profiles")) {
            return { display_name: String(values[0]) } as T;
          }
          if (query.includes("FROM player_progress")) return null;
          if (query.includes("FROM boss_cooldowns")) return null;
          return null;
        },
        async all<T>() {
          if (query.includes("PRAGMA table_info")) {
            return {
              results: [
                { name: "grant_source" },
                { name: "claim_id" },
                { name: "challenge_seed" },
                { name: "boss_hp" },
                { name: "boss_damage" },
                { name: "min_combat_ms" },
                { name: "max_hit_damage" },
              ] as T[],
            };
          }
          if (query.includes("SELECT item_id FROM pilot_inventory")) return { results: [] as T[] };
          return { results: [] as T[] };
        },
      };
    },
  };
  return {
    db,
    alliances,
    sessions,
    notifications,
    setPilot(pilot: string) {
      activeSub = pilot;
    },
  };
}

function request(path: string, body: Record<string, unknown>) {
  return new Request(`https://game.example${path}`, {
    method: "POST",
    headers: {
      cookie: "__Host-ss_session=test",
      origin: "https://game.example",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

describe("boss help sessions", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("rejects help requests without an alliance", async () => {
    const state = createDb();
    state.alliances.delete("plt_host");
    const response = await server.fetch(
      request("/api/boss/help-request", { boss_id: "leviathan", world: 1 }),
      {
        DB: state.db as never,
        BOSS_HELP: {
          idFromName: () => "room",
          get: () => ({ fetch: async () => new Response(null, { status: 204 }) }),
        } as never,
      },
    );
    expect(response.status).toBe(403);
  });

  it("notifies the alliance and permits exactly one same-alliance helper", async () => {
    const state = createDb();
    const room = {
      fetch: async (request: Request) => {
        if (new URL(request.url).pathname === "/notify") {
          state.notifications.push(await request.text());
        }
        return new Response(null, { status: 204 });
      },
    };
    const env = {
      DB: state.db as never,
      BOSS_HELP: { idFromName: () => "room", get: () => room } as never,
    };

    const started = await server.fetch(request("/api/boss/start", { boss_id: "leviathan" }), env);
    expect(started.status).toBe(200);
    const requested = await server.fetch(
      request("/api/boss/help-request", { boss_id: "leviathan", world: 1 }),
      env,
    );
    expect(requested.status).toBe(200);
    const { session_id: sessionId } = (await requested.json()) as { session_id: string };
    expect(state.notifications).toHaveLength(1);

    state.setPilot("outsider");
    const wrongAlliance = await server.fetch(
      request("/api/boss/help-join", { session_id: sessionId }),
      env,
    );
    expect(wrongAlliance.status).toBe(409);

    state.setPilot("host");
    const selfJoin = await server.fetch(
      request("/api/boss/help-join", { session_id: sessionId }),
      env,
    );
    expect(selfJoin.status).toBe(409);

    state.setPilot("helper");
    const joined = await server.fetch(
      request("/api/boss/help-join", { session_id: sessionId }),
      env,
    );
    expect(joined.status, JSON.stringify(await joined.clone().json())).toBe(200);
    expect(state.sessions.get(sessionId)?.helper_pilot_id).toBe("plt_helper");

    state.setPilot("helper2");
    const secondHelper = await server.fetch(
      request("/api/boss/help-join", { session_id: sessionId }),
      env,
    );
    expect(secondHelper.status).toBe(409);
  });

  it("expires an unanswered request after 60 seconds", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-01T12:00:00Z"));
    const state = createDb();
    const room = { fetch: async () => new Response(null, { status: 204 }) };
    const env = {
      DB: state.db as never,
      BOSS_HELP: { idFromName: () => "room", get: () => room } as never,
    };
    await server.fetch(request("/api/boss/start", { boss_id: "leviathan" }), env);
    const response = await server.fetch(
      request("/api/boss/help-request", { boss_id: "leviathan", world: 1 }),
      env,
    );
    const { session_id: sessionId } = (await response.json()) as { session_id: string };
    vi.advanceTimersByTime(60_001);
    state.setPilot("helper");
    const join = await server.fetch(request("/api/boss/help-join", { session_id: sessionId }), env);
    expect(join.status).toBe(409);
    expect(state.sessions.get(sessionId)?.status).toBe("EXPIRED");
  });
});

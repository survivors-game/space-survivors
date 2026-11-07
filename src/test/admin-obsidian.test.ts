import { describe, expect, it } from "vitest";
import server from "@/server";

const PILOT_ID = "plt_0123456789abcdef01234567";

function createDatabase(email: string) {
  let batchCalls = 0;
  const db = {
    prepare(query: string) {
      let values: unknown[] = [];
      return {
        bind(...boundValues: unknown[]) {
          values = boundValues;
          return this;
        },
        async run() {
          return { meta: { changes: 1 } };
        },
        async first() {
          if (query.includes("FROM auth_sessions")) {
            return { wallet_address: "google:test-sub", expires_at: Date.now() + 60_000 };
          }
          if (query.includes("FROM player_accounts")) {
            return {
              google_sub: "test-sub",
              email,
              pilot_id: "plt_aaaaaaaaaaaaaaaaaaaaaaaa",
            };
          }
          if (query.includes("SELECT obsidian FROM pilots")) {
            return { obsidian: 15 };
          }
          return null;
        },
        async all() {
          return { results: [] };
        },
      };
    },
    async batch(statements: unknown[]) {
      batchCalls++;
      return statements.map(() => ({ meta: { changes: 1 } }));
    },
  };
  return { db, getBatchCalls: () => batchCalls };
}

function makeRequest(session = false) {
  return new Request("https://game.example/api/admin/credit-obsidian", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://game.example",
      ...(session ? { cookie: "__Host-ss_session=test-session" } : {}),
    },
    body: JSON.stringify({ pilotId: PILOT_ID, packagesCount: 1 }),
  });
}

describe("administrative obsidian credits", () => {
  it("only allows the verified Google administrator account to credit obsidian", async () => {
    const anonymousDb = createDatabase("");
    const playerDb = createDatabase("player@example.com");
    const adminDb = createDatabase("emprendedora.onlinevee@gmail.com");

    const responses = await Promise.all([
      server.fetch(makeRequest(), { DB: anonymousDb.db }),
      server.fetch(makeRequest(true), { DB: playerDb.db }),
      server.fetch(makeRequest(true), { DB: adminDb.db }),
    ]);

    expect(responses.map((response) => response.status)).toEqual([401, 403, 200]);
    expect(anonymousDb.getBatchCalls()).toBe(0);
    expect(playerDb.getBatchCalls()).toBe(0);
    expect(adminDb.getBatchCalls()).toBe(1);
    expect(await responses[2]!.json()).toMatchObject({ success: true, credited: 10, obsidian: 15 });
  });
});

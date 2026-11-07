import { describe, expect, it } from "vitest";
import server from "@/server";

const ADMIN_SECRET = "server-only-admin-secret";
const PILOT_ID = "plt_0123456789abcdef01234567";

function createDatabase() {
  let batchCalls = 0;

  const db = {
    prepare() {
      return {
        bind() {
          return this;
        },
        async run() {
          return { meta: { changes: 0 } };
        },
        async first() {
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

describe("administrative obsidian credits", () => {
  it("rejects player requests without a server-validated Bearer secret", async () => {
    const { db, getBatchCalls } = createDatabase();
    const payload = JSON.stringify({
      pilotId: PILOT_ID,
      packagesCount: 1,
    });
    const legacyPayload = JSON.stringify({
      adminSecret: ADMIN_SECRET,
      pilotId: PILOT_ID,
      packagesCount: 1,
    });

    const responses = await Promise.all([
      server.fetch(
        new Request("https://game.example/api/admin/credit-obsidian", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin: "https://game.example",
          },
          body: legacyPayload,
        }),
        { DB: db, ADMIN_SECRET },
      ),
      server.fetch(
        new Request("https://game.example/api/admin/credit-obsidian", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin: "https://game.example",
            authorization: "Bearer player-supplied-secret",
          },
          body: payload,
        }),
        { DB: db, ADMIN_SECRET },
      ),
      server.fetch(
        new Request("https://game.example/api/admin/credit-obsidian", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin: "https://game.example",
            authorization: `Bearer ${ADMIN_SECRET}`,
          },
          body: payload,
        }),
        { DB: db, ADMIN_SECRET },
      ),
    ]);

    expect(responses.map((response) => response.status)).toEqual([403, 403, 200]);
    expect(getBatchCalls()).toBe(1);
  });
});

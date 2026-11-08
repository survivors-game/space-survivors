import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import server from "@/server";
import { BOSS_COOLDOWN_MS, BOSS_REWARDS } from "@/game/data/boss-rewards";

const PILOT_ID = "plt_0123456789abcdef01234567";

type MockStatement = {
  query: string;
  values: unknown[];
};

function createDatabase() {
  const cooldowns = new Map<string, { lastDefeatedAt: number; rewardId: string }>();
  const attempts = new Map<
    string,
    {
      pilotId: string;
      bossId: string;
      issuedAt: number;
      expiresAt: number;
      claimedAt: number | null;
      claimId: string | null;
    }
  >();
  const inventory = new Map<
    string,
    { itemId: string; itemName: string; itemType: string; quantity: number; grantSource: string }
  >();
  let bossObsidian = 0;

  const db = {
    prepare(query: string) {
      let values: unknown[] = [];
      return {
        query,
        get values() {
          return values;
        },
        bind(...boundValues: unknown[]) {
          values = boundValues;
          return this;
        },
        async run() {
          if (query.includes("INSERT INTO boss_attempts")) {
            const [tokenHash, pilotId, bossId, issuedAt, expiresAt] = values;
            attempts.set(String(tokenHash), {
              pilotId: String(pilotId),
              bossId: String(bossId),
              issuedAt: Number(issuedAt),
              expiresAt: Number(expiresAt),
              claimedAt: null,
              claimId: null,
            });
          } else if (query.includes("INSERT OR IGNORE INTO pilot_inventory")) {
            inventory.set("falcon", {
              itemId: "falcon",
              itemName: String(values[2]),
              itemType: "nave",
              quantity: 1,
              grantSource: "starter",
            });
          } else if (query.includes("DELETE FROM boss_attempts")) {
            for (const [hash, attempt] of attempts) {
              if (
                attempt.pilotId === values[0] &&
                attempt.bossId === values[1] &&
                attempt.claimedAt === null &&
                attempt.expiresAt <= Number(values[2])
              ) {
                attempts.delete(hash);
              }
            }
          }
          return { meta: { changes: 1 } };
        },
        async first<T>() {
          if (query.includes("FROM auth_sessions")) {
            return { wallet_address: "google:test-sub", expires_at: Date.now() + 60_000 } as T;
          }
          if (query.includes("FROM player_accounts")) {
            return {
              google_sub: "test-sub",
              email: "pilot@example.com",
              pilot_id: PILOT_ID,
            } as T;
          }
          if (query.includes("FROM boss_cooldowns")) {
            const cooldown = cooldowns.get(String(values[1]));
            return cooldown ? ({ last_defeated_at: cooldown.lastDefeatedAt } as T) : null;
          }
          if (query.includes("FROM boss_attempts")) {
            const attempt = attempts.get(String(values[0]));
            if (!attempt || attempt.pilotId !== values[1] || attempt.bossId !== values[2]) {
              return null;
            }
            return {
              issued_at: attempt.issuedAt,
              expires_at: attempt.expiresAt,
              claimed_at: attempt.claimedAt,
            } as T;
          }
          return null;
        },
        async all<T>() {
          if (query.includes("PRAGMA table_info")) {
            return {
              results: [{ name: "grant_source" }, { name: "claim_id" }] as T[],
            };
          }
          if (query.includes("FROM boss_cooldowns")) {
            return {
              results: Array.from(cooldowns, ([boss_id, value]) => ({
                boss_id,
                last_defeated_at: value.lastDefeatedAt,
              })) as T[],
            };
          }
          if (query.includes("SELECT item_id FROM pilot_inventory")) {
            return {
              results: Array.from(inventory.values())
                .filter((item) => item.quantity > 0 && item.grantSource !== "legacy")
                .map((item) => ({ item_id: item.itemId })) as T[],
            };
          }
          return { results: [] };
        },
      };
    },
    async batch(statements: unknown[]) {
      const results = (statements as MockStatement[]).map(({ query, values }) => {
        if (query.includes("UPDATE boss_attempts SET claimed_at")) {
          const attempt = attempts.get(String(values[2]));
          const now = Number(values[0]);
          const cooldown = cooldowns.get(String(values[8]));
          if (
            !attempt ||
            attempt.pilotId !== values[3] ||
            attempt.bossId !== values[4] ||
            attempt.claimedAt !== null ||
            attempt.expiresAt <= now ||
            attempt.issuedAt > Number(values[6]) ||
            (cooldown && cooldown.lastDefeatedAt > Number(values[9]))
          ) {
            return { meta: { changes: 0 } };
          }
          attempt.claimedAt = now;
          attempt.claimId = String(values[1]);
          return { meta: { changes: 1 } };
        }
        if (query.includes("INSERT INTO boss_cooldowns")) {
          const attempt = attempts.get(String(values[4]));
          const rewardId = String(values[3]);
          const existing = cooldowns.get(String(values[1]));
          if (
            !attempt ||
            attempt.claimId !== String(values[7]) ||
            (existing && existing.lastDefeatedAt > Number(values[8]))
          ) {
            return { meta: { changes: 0 } };
          }
          cooldowns.set(String(values[1]), {
            lastDefeatedAt: Number(values[2]),
            rewardId,
          });
          return { meta: { changes: 1 } };
        }
        if (query.includes("UPDATE pilots SET boss_obsidian")) {
          const cooldown = cooldowns.get(String(values[4]));
          if (!cooldown || cooldown.rewardId !== values[5]) return { meta: { changes: 0 } };
          bossObsidian += Number(values[0]);
          return { meta: { changes: 1 } };
        }
        if (query.includes("INSERT INTO pilot_inventory")) {
          const cooldown = cooldowns.get(String(values[9]));
          if (!cooldown || cooldown.rewardId !== values[10]) return { meta: { changes: 0 } };
          const itemId = String(values[2]);
          const previous = inventory.get(itemId);
          inventory.set(itemId, {
            itemId,
            itemName: String(values[3]),
            itemType: String(values[4]),
            quantity: (previous?.quantity ?? 0) + 1,
            grantSource: "boss",
          });
          return { meta: { changes: 1 } };
        }
        return { meta: { changes: 1 } };
      });
      return results;
    },
  };

  return {
    db,
    cooldowns,
    attempts,
    inventory,
    getBossObsidian: () => bossObsidian,
  };
}

function makeRequest(path: string, method: "GET" | "POST" = "GET", body?: Record<string, unknown>) {
  return new Request(`https://game.example${path}`, {
    method,
    headers: {
      cookie: "__Host-ss_session=test-session",
      ...(method === "POST"
        ? { origin: "https://game.example", "content-type": "application/json" }
        : {}),
    },
    ...(method === "POST" ? { body: JSON.stringify(body ?? {}) } : {}),
  });
}

async function requestBossAttempt(db: ReturnType<typeof createDatabase>["db"], bossId: string) {
  const response = await server.fetch(makeRequest("/api/bosses/attempt", "POST", { bossId }), {
    DB: db,
  });
  return { response, body: (await response.json()) as { ticket?: string; error?: string } };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-03-01T12:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("boss rewards and cooldowns", () => {
  it("uses progressive rewards, one-use combat tickets, and one-hour cooldowns", async () => {
    const { db, cooldowns, inventory, getBossObsidian } = createDatabase();
    const expected = [
      { bossId: "leviathan", world: 1, obsidian: 3, shipChance: 0.15, itemChance: 0.1, rank: "D" },
      { bossId: "nemesis", world: 2, obsidian: 5, shipChance: 0.12, itemChance: 0.1, rank: "C" },
      { bossId: "colossus", world: 3, obsidian: 8, shipChance: 0.1, itemChance: 0.08, rank: "B" },
    ];
    expect(BOSS_REWARDS).toEqual(expected);

    const missingTicket = await server.fetch(
      makeRequest("/api/bosses/claim", "POST", { bossId: "leviathan", ticket: "a".repeat(64) }),
      { DB: db },
    );
    expect(missingTicket.status).toBe(403);

    for (const reward of expected) {
      const { response: attemptResponse, body: attempt } = await requestBossAttempt(
        db,
        reward.bossId,
      );
      expect(attemptResponse.status).toBe(200);
      expect(attempt.ticket).toMatch(/^[0-9a-f]{64}$/);

      const earlyClaim = await server.fetch(
        makeRequest("/api/bosses/claim", "POST", { bossId: reward.bossId, ticket: attempt.ticket }),
        { DB: db },
      );
      expect(earlyClaim.status).toBe(409);

      vi.advanceTimersByTime(15_000);
      const response = await server.fetch(
        makeRequest("/api/bosses/claim", "POST", { bossId: reward.bossId, ticket: attempt.ticket }),
        { DB: db },
      );
      expect(response.status).toBe(200);
      const result = (await response.json()) as {
        obsidian: number;
        rewards: { itemName: string; itemType: string }[];
      };
      expect(result.obsidian).toBe(reward.obsidian);
      expect(result.rewards.length).toBeGreaterThanOrEqual(0);
      expect(result.rewards.length).toBeLessThanOrEqual(2);
      expect(result.rewards.every((drop) => drop.itemName.includes(`Rango ${reward.rank}`))).toBe(
        true,
      );

      const replay = await server.fetch(
        makeRequest("/api/bosses/claim", "POST", { bossId: reward.bossId, ticket: attempt.ticket }),
        { DB: db },
      );
      expect(replay.status).toBe(409);
    }

    expect(getBossObsidian()).toBe(16);
    expect(
      [...inventory.values()].every(
        (item) => item.grantSource === "starter" || item.grantSource === "boss",
      ),
    ).toBe(true);
    expect([...cooldowns.keys()].sort()).toEqual(expected.map((reward) => reward.bossId).sort());

    const statusResponse = await server.fetch(makeRequest("/api/bosses/status"), { DB: db });
    expect(statusResponse.status).toBe(200);
    const status = (await statusResponse.json()) as { cooldowns: Record<string, number> };
    for (const { bossId } of expected) {
      expect(status.cooldowns[bossId]).toBe(
        cooldowns.get(bossId)!.lastDefeatedAt + BOSS_COOLDOWN_MS,
      );
    }

    const blocked = await requestBossAttempt(db, "leviathan");
    expect(blocked.response.status).toBe(409);
    expect(blocked.body.error).toMatch(/cooldown/i);
    expect(getBossObsidian()).toBe(16);
  });
});

describe("server-owned inventory", () => {
  it("rejects client attempts to create inventory through sync-inventory", async () => {
    const { db, inventory } = createDatabase();
    const response = await server.fetch(
      makeRequest("/api/market/sync-inventory", "POST", {
        ships: ["falcon", "arbitrary-ship"],
        selectedShip: "arbitrary-ship",
      }),
      { DB: db },
    );
    expect(response.status).toBe(410);
    expect([...inventory.keys()]).toEqual(["falcon"]);
  });

  it("canonicalizes client-supplied ship unlocks to server-owned inventory", async () => {
    const { db } = createDatabase();
    const response = await server.fetch(
      makeRequest("/api/auth/progress", "POST", {
        progress: { ships: ["falcon", "forged-ship"], selectedShip: "forged-ship" },
      }),
      { DB: db },
    );
    expect(response.status).toBe(200);
    const result = (await response.json()) as {
      progress: { ships: string[]; selectedShip: string };
    };
    expect(result.progress.ships).toEqual(["falcon"]);
    expect(result.progress.selectedShip).toBe("falcon");
  });
});

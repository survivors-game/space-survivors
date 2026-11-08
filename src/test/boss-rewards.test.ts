import { describe, expect, it } from "vitest";
import server from "@/server";
import { BOSS_COOLDOWN_MS, BOSS_REWARDS } from "@/game/data/boss-rewards";

const PILOT_ID = "plt_0123456789abcdef01234567";

type MockStatement = {
  query: string;
  values: unknown[];
};

function createDatabase() {
  const cooldowns = new Map<string, { lastDefeatedAt: number; rewardId: string }>();
  const inventory = new Map<
    string,
    { itemId: string; itemName: string; itemType: string; quantity: number }
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
            const bossId = String(values[1]);
            const cooldown = cooldowns.get(bossId);
            return cooldown ? ({ last_defeated_at: cooldown.lastDefeatedAt } as T) : null;
          }
          return null;
        },
        async all<T>() {
          if (query.includes("FROM boss_cooldowns")) {
            return {
              results: Array.from(cooldowns, ([boss_id, value]) => ({
                boss_id,
                last_defeated_at: value.lastDefeatedAt,
              })) as T[],
            };
          }
          return { results: [] };
        },
      };
    },
    async batch(statements: unknown[]) {
      const results = (statements as MockStatement[]).map(({ query, values }) => {
        if (query.includes("INSERT INTO boss_cooldowns")) {
          const bossId = String(values[1]);
          const defeatedAt = Number(values[2]);
          const rewardId = String(values[3]);
          const existing = cooldowns.get(bossId);
          if (existing && existing.lastDefeatedAt > Number(values[4])) {
            return { meta: { changes: 0 } };
          }
          cooldowns.set(bossId, { lastDefeatedAt: defeatedAt, rewardId });
          return { meta: { changes: 1 } };
        }
        if (query.includes("UPDATE pilots SET boss_obsidian")) {
          const cooldown = cooldowns.get(String(values[4]));
          if (!cooldown || cooldown.rewardId !== values[5]) return { meta: { changes: 0 } };
          bossObsidian += Number(values[0]);
          return { meta: { changes: 1 } };
        }
        if (query.includes("INSERT INTO pilot_inventory")) {
          const cooldown = cooldowns.get(String(values[8]));
          if (!cooldown || cooldown.rewardId !== values[9]) return { meta: { changes: 0 } };
          const itemId = String(values[2]);
          const previous = inventory.get(itemId);
          inventory.set(itemId, {
            itemId,
            itemName: String(values[3]),
            itemType: String(values[4]),
            quantity: (previous?.quantity ?? 0) + 1,
          });
          return { meta: { changes: 1 } };
        }
        return { meta: { changes: 1 } };
      });
      return results;
    },
  };

  return { db, cooldowns, inventory, getBossObsidian: () => bossObsidian };
}

function makeRequest(path: string, method: "GET" | "POST" = "GET", bossId?: string) {
  return new Request(`https://game.example${path}`, {
    method,
    headers: {
      cookie: "__Host-ss_session=test-session",
      ...(method === "POST"
        ? { origin: "https://game.example", "content-type": "application/json" }
        : {}),
    },
    ...(method === "POST" ? { body: JSON.stringify({ bossId }) } : {}),
  });
}

describe("boss rewards and cooldowns", () => {
  it("uses progressive world rewards and blocks a boss for one hour after its defeat", async () => {
    const { db, cooldowns, inventory, getBossObsidian } = createDatabase();
    const expected = [
      { bossId: "leviathan", world: 1, obsidian: 3, shipChance: 0.15, itemChance: 0.1, rank: "D" },
      { bossId: "nemesis", world: 2, obsidian: 5, shipChance: 0.12, itemChance: 0.1, rank: "C" },
      { bossId: "colossus", world: 3, obsidian: 8, shipChance: 0.1, itemChance: 0.08, rank: "B" },
    ];
    expect(BOSS_REWARDS).toEqual(expected);

    for (const reward of expected) {
      const response = await server.fetch(
        makeRequest("/api/bosses/defeat", "POST", reward.bossId),
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
    }

    expect(getBossObsidian()).toBe(16);
    expect([...inventory.values()].every((item) => item.quantity === 1)).toBe(true);
    expect([...cooldowns.keys()].sort()).toEqual(expected.map((reward) => reward.bossId).sort());

    const statusResponse = await server.fetch(makeRequest("/api/bosses/status"), { DB: db });
    expect(statusResponse.status).toBe(200);
    const status = (await statusResponse.json()) as { cooldowns: Record<string, number> };
    for (const { bossId } of expected) {
      expect(status.cooldowns[bossId]).toBe(
        cooldowns.get(bossId)!.lastDefeatedAt + BOSS_COOLDOWN_MS,
      );
    }

    const repeated = await server.fetch(makeRequest("/api/bosses/defeat", "POST", "leviathan"), {
      DB: db,
    });
    expect(repeated.status).toBe(409);
    expect((await repeated.json()).error).toMatch(/cooldown/i);
    expect(getBossObsidian()).toBe(16);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import server from "@/server";
import { BOSS_COOLDOWN_MS, BOSS_REWARDS } from "@/game/data/boss-rewards";
import { createBossCombatProof, type BossCombatEvidence } from "@/game/meta/boss-combat-proof";

const PILOT_ID = "plt_0123456789abcdef01234567";

type MockStatement = {
  query: string;
  values: unknown[];
};

type StoredAttempt = {
  pilotId: string;
  bossId: string;
  issuedAt: number;
  expiresAt: number;
  claimedAt: number | null;
  claimId: string | null;
  seed: string;
  hp: number;
  damage: number;
  minCombatMs: number;
  maxHitDamage: number;
};

function createDatabase() {
  const cooldowns = new Map<string, { lastDefeatedAt: number; rewardId: string }>();
  const attempts = new Map<string, StoredAttempt>();
  const inventory = new Map<
    string,
    { itemId: string; itemName: string; itemType: string; quantity: number; grantSource: string }
  >();
  const helpSessions = new Map<
    string,
    { hostPilotId: string; helperPilotId: string; status: "ACTIVE" | "COMPLETED" }
  >();
  const helperBalances = new Map<string, { credits: number; obsidian: number }>();
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
            const [
              tokenHash,
              pilotId,
              bossId,
              issuedAt,
              expiresAt,
              seed,
              hp,
              damage,
              minCombatMs,
              maxHitDamage,
            ] = values;
            attempts.set(String(tokenHash), {
              pilotId: String(pilotId),
              bossId: String(bossId),
              issuedAt: Number(issuedAt),
              expiresAt: Number(expiresAt),
              claimedAt: null,
              claimId: null,
              seed: String(seed),
              hp: Number(hp),
              damage: Number(damage),
              minCombatMs: Number(minCombatMs),
              maxHitDamage: Number(maxHitDamage),
            });
          } else if (query.includes("UPDATE boss_attempts SET claimed_at")) {
            const attempt = attempts.get(String(values[2]));
            if (!attempt || attempt.pilotId !== values[3] || attempt.claimedAt !== null) {
              return { meta: { changes: 0 } };
            }
            attempt.claimedAt = Number(values[0]);
            attempt.claimId = String(values[1]);
          } else if (query.includes("UPDATE boss_help_sessions SET status = 'COMPLETED'")) {
            const session = helpSessions.get(String(values[1]));
            if (session?.status === "ACTIVE") session.status = "COMPLETED";
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
          if (query.includes("FROM boss_help_sessions")) {
            const session = helpSessions.get(String(values[0]));
            return session?.status === "ACTIVE"
              ? ({
                  session_id: values[0],
                  helper_pilot_id: session.helperPilotId,
                } as T)
              : null;
          }
          if (query.includes("FROM boss_attempts")) {
            const attempt = attempts.get(String(values[0]));
            if (!attempt || attempt.pilotId !== values[1]) return null;
            return {
              issued_at: attempt.issuedAt,
              expires_at: attempt.expiresAt,
              claimed_at: attempt.claimedAt,
              challenge_seed: attempt.seed,
              boss_hp: attempt.hp,
              boss_damage: attempt.damage,
              min_combat_ms: attempt.minCombatMs,
              max_hit_damage: attempt.maxHitDamage,
              boss_id: attempt.bossId,
            } as T;
          }
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
        if (query.includes("INSERT INTO boss_cooldowns")) {
          const attempt = attempts.get(String(values[4]));
          const rewardId = String(values[3]);
          const existing = cooldowns.get(String(values[1]));
          if (
            !attempt ||
            attempt.pilotId !== values[5] ||
            attempt.bossId !== values[6] ||
            attempt.claimedAt !== Number(values[7]) ||
            attempt.claimId !== String(values[8]) ||
            attempt.expiresAt <= Number(values[9]) ||
            (existing && existing.lastDefeatedAt > Number(values[13]))
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
        if (query.includes("UPDATE pilots SET obsidian = obsidian + 1")) {
          const session = helpSessions.get(String(values[2]));
          if (
            !session ||
            session.status !== "ACTIVE" ||
            session.hostPilotId !== values[3] ||
            session.helperPilotId !== values[4] ||
            session.helperPilotId !== values[1]
          ) {
            return { meta: { changes: 0 } };
          }
          const balance = helperBalances.get(session.helperPilotId) ?? { credits: 0, obsidian: 0 };
          balance.obsidian += 1;
          helperBalances.set(session.helperPilotId, balance);
          return { meta: { changes: 1 } };
        }
        if (query.includes("INSERT INTO player_progress")) {
          const session = helpSessions.get(String(values[4]));
          if (
            !session ||
            session.status !== "ACTIVE" ||
            session.hostPilotId !== values[5] ||
            session.helperPilotId !== values[6] ||
            session.helperPilotId !== values[0]
          ) {
            return { meta: { changes: 0 } };
          }
          const balance = helperBalances.get(session.helperPilotId) ?? { credits: 0, obsidian: 0 };
          balance.credits += 50;
          helperBalances.set(session.helperPilotId, balance);
          return { meta: { changes: 1 } };
        }
        if (query.includes("UPDATE boss_help_sessions SET status = 'COMPLETED'")) {
          const session = helpSessions.get(String(values[1]));
          if (
            !session ||
            session.status !== "ACTIVE" ||
            session.hostPilotId !== values[2] ||
            session.helperPilotId !== values[3]
          ) {
            return { meta: { changes: 0 } };
          }
          session.status = "COMPLETED";
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
    helpSessions,
    helperBalances,
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

async function startBoss(db: ReturnType<typeof createDatabase>["db"], bossId: string) {
  const response = await server.fetch(makeRequest("/api/boss/start", "POST", { boss_id: bossId }), {
    DB: db,
  });
  return {
    response,
    body: (await response.json()) as {
      token?: string;
      seed?: string;
      issued_at?: number;
      boss?: { hp: number; min_combat_ms: number; max_hit_damage: number };
      error?: string;
    },
  };
}

function createEvidence(
  issuedAt: number,
  durationMs: number,
  hp: number,
  damageReceived = 36,
): BossCombatEvidence {
  const perHit = hp / 4;
  const events: BossCombatEvidence["events"] = [
    { type: "boss_hit", at: 5_000, damage: perHit, count: 1 },
    { type: "player_hit", at: 10_000, damage: damageReceived, count: 1 },
    { type: "boss_hit", at: 15_000, damage: perHit, count: 1 },
    { type: "minion_kill", at: 20_000, damage: 0, count: 2 },
    { type: "boss_hit", at: 25_000, damage: perHit, count: 1 },
    { type: "boss_hit", at: Math.min(30_000, durationMs), damage: perHit, count: 1 },
  ];
  events.sort((a, b) => a.at - b.at);
  return {
    started_at: issuedAt,
    ended_at: issuedAt + durationMs,
    damage_dealt: hp,
    damage_received: damageReceived,
    hits: 4,
    events,
  };
}

async function claimBoss(
  db: ReturnType<typeof createDatabase>["db"],
  bossId: string,
  token: string,
  seed: string,
  result: "victory" | "defeat",
  evidence: BossCombatEvidence,
  helpSessionId?: string,
) {
  const proof = await createBossCombatProof(seed, evidence);
  return server.fetch(
    makeRequest("/api/boss/claim", "POST", {
      boss_id: bossId,
      token,
      result,
      ...evidence,
      proof,
      ...(helpSessionId ? { help_session_id: helpSessionId } : {}),
    }),
    { DB: db },
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-03-01T12:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("server-validated boss combat", () => {
  it("pays the helper only after a validated victory", async () => {
    const victoryState = createDatabase();
    const victorySession = "help_victory";
    victoryState.helpSessions.set(victorySession, {
      hostPilotId: PILOT_ID,
      helperPilotId: "plt_helper",
      status: "ACTIVE",
    });
    const { response: victoryStart, body: victoryAttempt } = await startBoss(
      victoryState.db,
      "leviathan",
    );
    expect(victoryStart.status).toBe(200);
    const durationMs = victoryAttempt.boss!.min_combat_ms + 1_000;
    vi.advanceTimersByTime(durationMs);
    const victory = await claimBoss(
      victoryState.db,
      "leviathan",
      victoryAttempt.token!,
      victoryAttempt.seed!,
      "victory",
      createEvidence(victoryAttempt.issued_at!, durationMs, victoryAttempt.boss!.hp),
      victorySession,
    );
    expect(victory.status).toBe(200);
    expect(victoryState.getBossObsidian()).toBe(3);
    expect(victoryState.helperBalances.get("plt_helper")).toEqual({ credits: 50, obsidian: 1 });
    expect(victoryState.helpSessions.get(victorySession)?.status).toBe("COMPLETED");

    const defeatState = createDatabase();
    const defeatSession = "help_defeat";
    defeatState.helpSessions.set(defeatSession, {
      hostPilotId: PILOT_ID,
      helperPilotId: "plt_helper",
      status: "ACTIVE",
    });
    const { response: defeatStart, body: defeatAttempt } = await startBoss(
      defeatState.db,
      "leviathan",
    );
    expect(defeatStart.status).toBe(200);
    const defeatDuration = defeatAttempt.boss!.min_combat_ms + 1_000;
    vi.advanceTimersByTime(defeatDuration);
    const defeat = await claimBoss(
      defeatState.db,
      "leviathan",
      defeatAttempt.token!,
      defeatAttempt.seed!,
      "defeat",
      createEvidence(defeatAttempt.issued_at!, defeatDuration, defeatAttempt.boss!.hp),
      defeatSession,
    );
    expect(defeat.status).toBe(200);
    expect(defeatState.getBossObsidian()).toBe(0);
    expect(defeatState.helperBalances.size).toBe(0);
  });

  it("uses server parameters and awards progressive rewards for valid victories", async () => {
    const { db, cooldowns, inventory, getBossObsidian } = createDatabase();
    expect(BOSS_REWARDS.map(({ bossId }) => bossId)).toEqual(["leviathan", "nemesis", "colossus"]);

    for (const reward of BOSS_REWARDS) {
      const { response: startResponse, body: attempt } = await startBoss(db, reward.bossId);
      expect(startResponse.status).toBe(200);
      expect(attempt.token).toMatch(/^[0-9a-f]{64}$/);
      expect(attempt.seed).toMatch(/^[0-9a-f]{64}$/);
      expect(attempt.boss?.hp).toBeGreaterThan(0);
      expect(attempt.boss?.min_combat_ms).toBeGreaterThan(0);

      const durationMs = attempt.boss!.min_combat_ms + 1_000;
      vi.advanceTimersByTime(durationMs);
      const evidence = createEvidence(attempt.issued_at!, durationMs, attempt.boss!.hp);
      const response = await claimBoss(
        db,
        reward.bossId,
        attempt.token!,
        attempt.seed!,
        "victory",
        evidence,
      );
      expect(response.status).toBe(200);
      const body = (await response.json()) as Record<string, unknown>;
      expect(body.success).toBe(true);
      expect(body).not.toHaveProperty("obsidian");
      expect(body).not.toHaveProperty("rewards");
      expect(body).not.toHaveProperty("helperReward");

      const replay = await claimBoss(
        db,
        reward.bossId,
        attempt.token!,
        attempt.seed!,
        "victory",
        evidence,
      );
      expect(replay.status).toBe(409);
    }

    const cooldownBlocked = await startBoss(db, "leviathan");
    expect(cooldownBlocked.response.status).toBe(409);
    expect(getBossObsidian()).toBe(16);
    expect([...inventory.values()].every((item) => item.grantSource !== "legacy")).toBe(true);
    expect([...cooldowns.keys()].sort()).toEqual(BOSS_REWARDS.map(({ bossId }) => bossId).sort());
    const status = await server.fetch(makeRequest("/api/bosses/status"), { DB: db });
    const { cooldowns: cooldownMap } = (await status.json()) as {
      cooldowns: Record<string, number>;
    };
    for (const reward of BOSS_REWARDS) {
      expect(cooldownMap[reward.bossId]).toBe(
        cooldowns.get(reward.bossId)!.lastDefeatedAt + BOSS_COOLDOWN_MS,
      );
    }
  });

  it("rejects expired, reused, too-short, and insufficient-damage claims and consumes failed proofs", async () => {
    const { db, attempts, getBossObsidian } = createDatabase();
    const expired = await startBoss(db, "leviathan");
    vi.advanceTimersByTime(10 * 60 * 1000 + 1);
    const expiredEvidence = createEvidence(
      expired.body.issued_at!,
      10 * 60 * 1000,
      expired.body.boss!.hp,
    );
    const expiredClaim = await claimBoss(
      db,
      "leviathan",
      expired.body.token!,
      expired.body.seed!,
      "victory",
      expiredEvidence,
    );
    expect(expiredClaim.status).toBe(410);

    const tooShort = await startBoss(db, "leviathan");
    const shortEvidence = createEvidence(tooShort.body.issued_at!, 20_000, tooShort.body.boss!.hp);
    const shortClaim = await claimBoss(
      db,
      "leviathan",
      tooShort.body.token!,
      tooShort.body.seed!,
      "victory",
      shortEvidence,
    );
    expect(shortClaim.status).toBe(400);

    vi.advanceTimersByTime(31_000);
    const insufficient = await startBoss(db, "nemesis");
    const durationMs = insufficient.body.boss!.min_combat_ms + 1_000;
    vi.advanceTimersByTime(durationMs);
    const weakEvidence = createEvidence(
      insufficient.body.issued_at!,
      durationMs,
      insufficient.body.boss!.hp / 2,
    );
    const insufficientClaim = await claimBoss(
      db,
      "nemesis",
      insufficient.body.token!,
      insufficient.body.seed!,
      "victory",
      weakEvidence,
    );
    expect(insufficientClaim.status).toBe(400);
    expect(getBossObsidian()).toBe(0);
    expect([...attempts.values()].every((attempt) => attempt.claimedAt !== null)).toBe(true);
  });

  it("records a valid defeat as consumed without granting a reward", async () => {
    const { db, cooldowns, getBossObsidian, inventory, attempts } = createDatabase();
    const { body: attempt } = await startBoss(db, "leviathan");
    const durationMs = attempt.boss!.min_combat_ms + 1_000;
    vi.advanceTimersByTime(durationMs);
    const evidence = createEvidence(attempt.issued_at!, durationMs, attempt.boss!.hp / 2);
    const response = await claimBoss(
      db,
      "leviathan",
      attempt.token!,
      attempt.seed!,
      "defeat",
      evidence,
    );
    expect(response.status).toBe(200);
    expect((await response.json()).result).toBe("defeat");
    expect(getBossObsidian()).toBe(0);
    expect(cooldowns.size).toBe(0);
    expect(inventory.size).toBe(1);
    expect([...attempts.values()][0]!.claimedAt).not.toBeNull();
  });

  it("rejects tampered transcripts and consumes the attempt", async () => {
    const { db, attempts } = createDatabase();
    const { body: attempt } = await startBoss(db, "leviathan");
    const durationMs = attempt.boss!.min_combat_ms + 1_000;
    vi.advanceTimersByTime(durationMs);
    const evidence = createEvidence(attempt.issued_at!, durationMs, attempt.boss!.hp);
    const response = await server.fetch(
      makeRequest("/api/boss/claim", "POST", {
        boss_id: "leviathan",
        token: attempt.token,
        result: "victory",
        ...evidence,
        proof: "0".repeat(64),
      }),
      { DB: db },
    );
    expect(response.status).toBe(400);
    expect([...attempts.values()][0]!.claimedAt).not.toBeNull();
  });

  it("consumes a valid token submitted for a different boss", async () => {
    const { db, attempts } = createDatabase();
    const { body: attempt } = await startBoss(db, "leviathan");
    vi.advanceTimersByTime(attempt.boss!.min_combat_ms + 1_000);
    const evidence = createEvidence(
      attempt.issued_at!,
      attempt.boss!.min_combat_ms + 1_000,
      attempt.boss!.hp,
    );
    const proof = await createBossCombatProof(attempt.seed!, evidence);
    const response = await server.fetch(
      makeRequest("/api/boss/claim", "POST", {
        boss_id: "nemesis",
        token: attempt.token,
        result: "victory",
        ...evidence,
        proof,
      }),
      { DB: db },
    );
    expect(response.status).toBe(400);
    expect([...attempts.values()][0]!.claimedAt).not.toBeNull();
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
